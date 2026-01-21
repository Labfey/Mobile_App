import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Modal, Alert, Animated } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Navigation as NavIcon, MapPin, Circle, XCircle } from "lucide-react-native"; 
import { ref, onValue, update, get } from "firebase/database";
import { auth, db } from "../../services/firebase"; 
import { FARE_ZONES } from "../../constants/routes"; 

interface ExtendedZone {
  originalIndex: number;
  id: string;
  label: string;
  color: string;
  pts: number[][];
}

export default function MapScreen() {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'driver' | 'passenger' | 'guest'>('guest');
  
  // Driver State
  const [isFull, setIsFull] = useState(false);
  const [routeModalVisible, setRouteModalVisible] = useState(false);
  const [currentDest, setCurrentDest] = useState<'Town' | 'Balacbac' | null>(null);
  
  const activeZonesRef = useRef<ExtendedZone[]>([]);
  const locationSub = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for active trip indicator
  useEffect(() => {
    if (currentDest) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [currentDest]);

  // 1. INITIAL ROLE CHECK
  useEffect(() => {
    const fetchRole = async () => {
      if (auth.currentUser) {
        const snap = await get(ref(db, `users/${auth.currentUser.uid}`));
        if (snap.exists()) setRole(snap.val().role);
      } else {
        setRole('guest');
      }
      setLoading(false);
    };
    fetchRole();
  }, []);

  // 2. GENERATE ROUTE (With Color Reversing Logic & Connected Segments)
  const startTrip = async (destination: 'Town' | 'Balacbac') => {
    webViewRef.current?.postMessage(JSON.stringify({ type: "CLEAR_ZONES" }));
    
    // Copy base zones with their original indices
    const baseZones: ExtendedZone[] = FARE_ZONES.map((z, i) => ({ ...z, originalIndex: i }));
    
    // LOGIC: If going to Town, REVERSE the entire zone order (Zone 4 -> Zone 1)
    const zonesToProcess = destination === 'Town' ? [...baseZones].reverse() : [...baseZones];

    // COLOR REVERSAL: If going to Town, flip the colors array
    const originalColors = ['#22c55e', '#eab308', '#f97316', '#ef4444']; // Green -> Yellow -> Orange -> Red
    const reversedColors = [...originalColors].reverse(); // Red -> Orange -> Yellow -> Green
    const colorsToUse = destination === 'Town' ? reversedColors : originalColors;

    const zoneData = await Promise.all(zonesToProcess.map(async (zone, idx) => {
      // COORDINATE SWAP: If going to Town, swap Start/End coordinates of each segment
      const start = destination === 'Town' ? zone.pts[1] : zone.pts[0];
      const end = destination === 'Town' ? zone.pts[0] : zone.pts[1];
      
      // Get the color from our reversed/normal array
      const zoneColor = colorsToUse[idx];
      
      try {
        const resp = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`);
        const data = await resp.json();
        
        if (data.routes && data.routes[0]) {
           return { 
             coords: data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]), 
             color: zoneColor 
           };
        }
        return { coords: [], color: zoneColor };
      } catch (e) { 
        return { coords: [], color: zoneColor }; 
      }
    }));

    // CONNECT SEGMENTS: Add the last point of each segment as the first point of the next
    for (let i = 0; i < zoneData.length - 1; i++) {
      if (zoneData[i].coords.length > 0 && zoneData[i + 1].coords.length > 0) {
        const lastPoint = zoneData[i].coords[zoneData[i].coords.length - 1];
        const nextFirstPoint = zoneData[i + 1].coords[0];
        
        // If there's a gap, connect them
        const distance = Math.sqrt(
          Math.pow(lastPoint[0] - nextFirstPoint[0], 2) + 
          Math.pow(lastPoint[1] - nextFirstPoint[1], 2)
        );
        
        // If gap is more than 0.0001 degrees (~11 meters), add connecting point
        if (distance > 0.0001) {
          zoneData[i + 1].coords.unshift(lastPoint);
        }
      }
    }

    // Send lines to Map
    webViewRef.current?.postMessage(JSON.stringify({ 
      type: "DRAW_ZONES", 
      zones: zoneData,
      destination: destination 
    }));
    
    // Update State & Firebase
    setCurrentDest(destination);
    setRouteModalVisible(false);
    
    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), { 
        destination: destination,
        status: isFull ? 'full' : 'available'
      });
    }
  };

  // 3. END TRIP LOGIC
  const endTrip = () => {
    Alert.alert("End Trip", "Are you sure you want to end the current trip?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "End Trip", 
        style: "destructive", 
        onPress: () => {
          setCurrentDest(null);
          webViewRef.current?.postMessage(JSON.stringify({ type: "CLEAR_ZONES" }));
          
          if (auth.currentUser) {
            update(ref(db, `jeeps/${auth.currentUser.uid}`), { 
              destination: null,
              status: 'available'
            });
          }
        }
      }
    ]);
  };

  const toggleStatus = (newStatus: boolean) => {
    setIsFull(newStatus);
    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), { 
        status: newStatus ? 'full' : 'available' 
      });
    }
  };

  // 4. LOCATION LISTENER (Dynamic Navigator)
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 }, 
        (pos) => {
          const { latitude, longitude } = pos.coords;

          // Send location to Map with navigator mode enabled
          webViewRef.current?.postMessage(JSON.stringify({ 
            type: "SET_LOCATION", 
            lat: latitude, 
            lng: longitude,
            isDriver: role === 'driver',
            hasActiveRoute: currentDest !== null // Enable navigator mode
          }));

          if (role === 'driver' && auth.currentUser) {
             update(ref(db, `jeeps/${auth.currentUser.uid}`), { 
               latitude, 
               longitude
             });
          }
        }
      );

      const jeepsRef = ref(db, 'jeeps');
      const unsubscribe = onValue(jeepsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const jeepsArray = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          webViewRef.current?.postMessage(JSON.stringify({ type: "SET_JEEPS", jeeps: jeepsArray }));
        }
      });

      return () => unsubscribe();
    })();

    return () => {
      if (locationSub.current) locationSub.current.remove();
    };
  }, [role, currentDest]);

  // 5. MAP HTML (Dynamic Navigator Logic)
  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { height: 100vh; width: 100vw; background: #f8f9fa; }
        
        .user-dot { 
          width: 20px; 
          height: 20px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: 4px solid white; 
          border-radius: 50%; 
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5), 0 0 0 8px rgba(102, 126, 234, 0.15);
          position: relative;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5), 0 0 0 8px rgba(102, 126, 234, 0.15); }
          50% { box-shadow: 0 4px 12px rgba(102, 126, 234, 0.7), 0 0 0 12px rgba(102, 126, 234, 0.25); }
        }
        
        .jeep-marker { 
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: 3px solid white; 
          border-radius: 50%; 
          text-align: center; 
          line-height: 30px; 
          font-size: 18px; 
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
          transition: all 0.3s ease;
        }
        
        .jeep-marker:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.6);
        }
        
        .jeep-full { 
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
        }
        
        .jeep-full:hover {
          box-shadow: 0 6px 16px rgba(239, 68, 68, 0.6) !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { 
          zoomControl: false,
          attributionControl: false 
        }).setView([16.4023, 120.5960], 14);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        var userMarker = null;
        var jeepMarkers = {};
        var routeSegments = []; // Array of polylines
        var passengerViewRoutes = []; // For passenger viewing jeep routes
        var isDriverMode = false;
        var hasActiveRoute = false;
        var jeepsData = {}; // Store jeep data including destinations

        // --- ENHANCED NAVIGATOR LOGIC ---
        function updateNavigatorRoute(lat, lng) {
          if (routeSegments.length === 0 || !hasActiveRoute) return;

          // Get the current active segment (the first one in the list)
          var currentPoly = routeSegments[0];
          var points = currentPoly.getLatLngs();
          
          if (!points || points.length === 0) return;

          // Find the closest point on this segment to the driver
          var closestDist = Infinity;
          var closestIdx = -1;

          for (var i = 0; i < points.length; i++) {
            var d = map.distance([lat, lng], points[i]);
            if (d < closestDist) {
              closestDist = d;
              closestIdx = i;
            }
          }

          // Check if we're near the end of this segment
          // If within 40 meters of the last point, remove this segment
          var lastPointDist = map.distance([lat, lng], points[points.length - 1]);
          if (lastPointDist < 40) {
            map.removeLayer(currentPoly);
            routeSegments.shift(); // Remove completed segment
            
            // Auto-pan to next segment if exists
            if (routeSegments.length > 0) {
              var nextPoints = routeSegments[0].getLatLngs();
              if (nextPoints.length > 0) {
                map.panTo(nextPoints[0]);
              }
            }
            return;
          }

          // DYNAMIC LINE SHORTENING:
          // Keep points from closest index onwards, and snap the start to driver location
          if (closestIdx !== -1 && closestIdx < points.length - 1) {
            var remainingPoints = points.slice(closestIdx);
            remainingPoints.unshift([lat, lng]); // Connect line to driver's current position
            currentPoly.setLatLngs(remainingPoints);
          }
        }

        // --- PASSENGER: SHOW JEEP ROUTE ON CLICK ---
        async function showJeepRoute(jeepId) {
          // Clear any existing passenger routes
          passengerViewRoutes.forEach(r => map.removeLayer(r));
          passengerViewRoutes = [];
          
          var jeep = jeepsData[jeepId];
          if (!jeep || !jeep.destination) {
            alert('This jeep has no active route');
            return;
          }
          
          // Define zone points (same as React Native)
          var POINTS = {
            TOWN: [16.414019, 120.593455],
            SHELL: [16.393590, 120.579564],
            JUNCTION: [16.388988, 120.575658],
            INTERIOR_A: [16.386876, 120.576439],
            CENTRO: [16.380109, 120.579936],
            FRIENDSHIP: [16.378661, 120.580563],
            TIERRA: [16.378759, 120.586049],
          };
          
          var FARE_ZONES = [
            { id: 'z1', pts: [POINTS.TOWN, POINTS.SHELL] },
            { id: 'z2', pts: [POINTS.SHELL, POINTS.JUNCTION] },
            { id: 'z3', pts: [POINTS.INTERIOR_A, POINTS.CENTRO] },
            { id: 'z4', pts: [POINTS.FRIENDSHIP, POINTS.TIERRA] },
          ];
          
          var destination = jeep.destination;
          var zonesToProcess = destination === 'Town' ? FARE_ZONES.slice().reverse() : FARE_ZONES;
          
          // Color logic
          var originalColors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
          var reversedColors = originalColors.slice().reverse();
          var colorsToUse = destination === 'Town' ? reversedColors : originalColors;
          
          // Fetch routes
          var fetchPromises = zonesToProcess.map(function(zone, idx) {
            var start = destination === 'Town' ? zone.pts[1] : zone.pts[0];
            var end = destination === 'Town' ? zone.pts[0] : zone.pts[1];
            var color = colorsToUse[idx];
            
            return fetch('https://router.project-osrm.org/route/v1/driving/' + start[1] + ',' + start[0] + ';' + end[1] + ',' + end[0] + '?overview=full&geometries=geojson')
              .then(function(resp) { return resp.json(); })
              .then(function(data) {
                if (data.routes && data.routes[0]) {
                  return {
                    coords: data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; }),
                    color: color
                  };
                }
                return { coords: [], color: color };
              })
              .catch(function() {
                return { coords: [], color: color };
              });
          });
          
          Promise.all(fetchPromises).then(function(zoneData) {
            // Connect segments
            for (var i = 0; i < zoneData.length - 1; i++) {
              if (zoneData[i].coords.length > 0 && zoneData[i + 1].coords.length > 0) {
                var lastPoint = zoneData[i].coords[zoneData[i].coords.length - 1];
                var nextFirstPoint = zoneData[i + 1].coords[0];
                
                var distance = Math.sqrt(
                  Math.pow(lastPoint[0] - nextFirstPoint[0], 2) + 
                  Math.pow(lastPoint[1] - nextFirstPoint[1], 2)
                );
                
                if (distance > 0.0001) {
                  zoneData[i + 1].coords.unshift(lastPoint);
                }
              }
            }
            
            // Draw routes
            zoneData.forEach(function(z) {
              if (z.coords && z.coords.length > 0) {
                var poly = L.polyline(z.coords, { 
                  color: z.color, 
                  weight: 6, 
                  opacity: 0.85, 
                  lineCap: 'round',
                  lineJoin: 'round'
                }).addTo(map);
                passengerViewRoutes.push(poly);
              }
            });
            
            // Zoom to route
            if (passengerViewRoutes.length > 0) {
              var group = L.featureGroup(passengerViewRoutes);
              map.fitBounds(group.getBounds(), { padding: [50, 50] });
            }
          });
        }

        window.addEventListener("message", (event) => {
          try {
            const m = JSON.parse(event.data);
            
            if (m.type === "SET_LOCATION") {
              isDriverMode = m.isDriver;
              hasActiveRoute = m.hasActiveRoute || false;
              
              if (!userMarker) {
                var icon = L.divIcon({ className: 'user-dot', iconSize: [20, 20] });
                userMarker = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
                map.panTo([m.lat, m.lng]);
              } else {
                userMarker.setLatLng([m.lat, m.lng]);
                
                // Smooth follow for driver
                if (isDriverMode && hasActiveRoute) {
                  map.panTo([m.lat, m.lng], { animate: true, duration: 0.5 });
                }
              }

              // Update navigator route if driver has active trip
              if (isDriverMode && hasActiveRoute) {
                updateNavigatorRoute(m.lat, m.lng);
              }
            }
            
            if (m.type === "DRAW_ZONES") {
              // Clear old routes
              routeSegments.forEach(s => map.removeLayer(s));
              routeSegments = [];
              
              // Draw new route segments with reversed colors
              m.zones.forEach((z) => {
                if (z.coords && z.coords.length > 0) {
                  var poly = L.polyline(z.coords, { 
                    color: z.color, 
                    weight: 8, 
                    opacity: 0.9, 
                    lineCap: 'round',
                    lineJoin: 'round'
                  }).addTo(map);
                  routeSegments.push(poly);
                }
              });
              
              // Zoom to fit the entire route
              if (routeSegments.length > 0) {
                var group = L.featureGroup(routeSegments);
                map.fitBounds(group.getBounds(), { padding: [50, 50] });
              }
            }

            if (m.type === "CLEAR_ZONES") { 
              routeSegments.forEach(s => map.removeLayer(s)); 
              routeSegments = [];
              hasActiveRoute = false;
            }

            if (m.type === "SET_JEEPS") {
              // Store jeeps data
              m.jeeps.forEach(j => {
                jeepsData[j.id] = j;
              });
              
              // Remove markers for jeeps that no longer exist
              Object.keys(jeepMarkers).forEach(id => {
                if (!m.jeeps.find(j => j.id === id)) {
                  map.removeLayer(jeepMarkers[id]);
                  delete jeepMarkers[id];
                }
              });
              
              // Update or create jeep markers
              m.jeeps.forEach(j => {
                var isFull = (j.status === 'full');
                if (jeepMarkers[j.id]) {
                  jeepMarkers[j.id].setLatLng([j.latitude, j.longitude]);
                  var el = jeepMarkers[j.id].getElement();
                  if (el) {
                    if (isFull) el.classList.add('jeep-full');
                    else el.classList.remove('jeep-full');
                  }
                } else {
                  var cssClass = 'jeep-marker' + (isFull ? ' jeep-full' : '');
                  var icon = L.divIcon({ className: cssClass, iconSize: [36, 36], html: '🚕' });
                  var marker = L.marker([j.latitude, j.longitude], { icon: icon }).addTo(map);
                  
                  // Add click handler for passengers to view route
                  marker.jeepId = j.id;
                  marker.on('click', function(e) {
                    if (!isDriverMode) {
                      showJeepRoute(this.jeepId);
                    }
                  });
                  
                  jeepMarkers[j.id] = marker;
                }
              });
            }
          } catch(e) {
            console.error('Map message error:', e);
          }
        });
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView 
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHtml }}
        style={{ flex: 1 }}
      />

      {/* DRIVER CONTROLS */}
      {role === 'driver' && (
        <View style={styles.driverPanel}>
          
          {/* Active Trip Card */}
          {currentDest && (
            <View style={styles.activeTripCard}>
              <View style={styles.tripHeader}>
                <View style={styles.tripIconContainer}>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Circle color="#10b981" size={12} fill="#10b981" />
                  </Animated.View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripLabel}>Active Trip</Text>
                  <Text style={styles.tripDestination}>To {currentDest}</Text>
                </View>
              </View>
              
              {/* SEPARATE LARGE STATUS BUTTONS */}
              <View style={styles.statusButtonsRow}>
                <TouchableOpacity 
                  onPress={() => toggleStatus(false)} 
                  style={[
                    styles.statusButton, 
                    styles.availableButton,
                    !isFull && styles.statusButtonActive
                  ]}
                >
                  <Circle size={10} color={!isFull ? '#10B981' : '#9CA3AF'} fill={!isFull ? '#10B981' : '#9CA3AF'} />
                  <Text style={[styles.statusButtonText, !isFull && styles.statusButtonTextActive]}>
                    Available
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  onPress={() => toggleStatus(true)} 
                  style={[
                    styles.statusButton, 
                    styles.fullButton,
                    isFull && styles.statusButtonActive
                  ]}
                >
                  <Circle size={10} color={isFull ? '#EF4444' : '#9CA3AF'} fill={isFull ? '#EF4444' : '#9CA3AF'} />
                  <Text style={[styles.statusButtonText, isFull && styles.statusButtonTextActive]}>
                    Full
                  </Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity onPress={endTrip} style={styles.endTripBtn}>
                <XCircle color="#DC2626" size={20} />
                <Text style={styles.endTripText}>End Trip</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Start Trip Button */}
          {!currentDest && (
            <TouchableOpacity onPress={() => setRouteModalVisible(true)} style={styles.startTripCard}>
              <View style={styles.startTripContent}>
                <View style={styles.startIconContainer}>
                  <NavIcon color="white" size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.startTripTitle}>Start a Trip</Text>
                  <Text style={styles.startTripSubtitle}>Choose your destination</Text>
                </View>
                <View style={styles.arrowContainer}>
                  <Text style={{ color: 'white', fontSize: 20 }}>→</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* DESTINATION MODAL */}
      <Modal visible={routeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Destination</Text>
            <Text style={styles.modalSubtitle}>Where are you heading?</Text>
            
            <TouchableOpacity 
              onPress={() => startTrip('Town')} 
              style={styles.destinationCard}
            >
              <View style={[styles.destinationIcon, { backgroundColor: '#DBEAFE' }]}>
                <MapPin color="#2563EB" size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.destinationTitle}>Balacbac to Town</Text>
              </View>
              <View style={styles.destinationArrow}>
                <Text style={{ fontSize: 18, color: '#9CA3AF' }}>→</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => startTrip('Balacbac')} 
              style={styles.destinationCard}
            >
              <View style={[styles.destinationIcon, { backgroundColor: '#FEF3C7' }]}>
                <MapPin color="#D97706" size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.destinationTitle}>Town to Balacbac</Text>
              </View>
              <View style={styles.destinationArrow}>
                <Text style={{ fontSize: 18, color: '#9CA3AF' }}>→</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setRouteModalVisible(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  
  // Driver Panel
  driverPanel: { 
    position: 'absolute', 
    bottom: 20, 
    left: 16, 
    right: 16,
  },
  
  // Active Trip Card
  activeTripCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tripIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tripLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tripDestination: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 2,
  },
  
  // LARGE SEPARATE STATUS BUTTONS
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statusButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  statusButtonActive: {
    borderWidth: 2,
  },
  availableButton: {
    backgroundColor: '#F0FDF4',
  },
  fullButton: {
    backgroundColor: '#FEF2F2',
  },
  statusButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
  },
  statusButtonTextActive: {
    fontSize: 15,
    fontWeight: '700',
  },
  
  endTripBtn: {
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  endTripText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 15,
  },
  
  // Start Trip Card
  startTripCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  startTripContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  startIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#667EEA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  startTripTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  startTripSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#667EEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Modal
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    justifyContent: 'flex-end',
  },
  modalContent: { 
    backgroundColor: 'white', 
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: '#1F2937',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 24,
  },
  
  // Destination Cards
  destinationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  destinationIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  destinationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  destinationSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  destinationArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});
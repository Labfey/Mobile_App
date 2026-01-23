import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Modal, Alert, Animated, Platform } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as TaskManager from 'expo-task-manager';
import { Navigation as NavIcon, MapPin, Circle, XCircle } from "lucide-react-native"; 
import { ref, onValue, update, get } from "firebase/database";
import { auth, db } from "../../services/firebase"; 
import { FARE_ZONES } from "../../constants/routes"; 

const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('Background task error:', error);
    return;
  }

  if (data) {
    const { locations } = data;
    const { latitude, longitude } = locations[0].coords;

    if (auth.currentUser) {
      try {
        await update(ref(db, `jeeps/${auth.currentUser.uid}`), {
          latitude,
          longitude,
        });
      } catch (err) {
        console.log('Background Firebase update error:', err);
      }
    }
  }
});

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
  
  const [isFull, setIsFull] = useState(false);
  const [routeModalVisible, setRouteModalVisible] = useState(false);
  const [currentDest, setCurrentDest] = useState<'Town' | 'Balacbac' | null>(null);
  
  const activeZonesRef = useRef<ExtendedZone[]>([]);
  const locationSub = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [webViewLoaded, setWebViewLoaded] = useState(false);

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

  const postMessageToWebView = (message: any) => {
    if (webViewRef.current && webViewLoaded) {
      const messageStr = JSON.stringify(message);
      // console.log('Sending to WebView:', message.type);
      webViewRef.current.postMessage(messageStr);
    }
  };

  const startTrip = async (destination: 'Town' | 'Balacbac') => {
    postMessageToWebView({ type: "CLEAR_ZONES" });
    
    if (role === 'driver') {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus === 'granted') {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 5,
          foregroundService: {
            notificationTitle: "JeepRoute Tracking Active",
            notificationBody: `Currently heading to ${destination}`,
            notificationColor: "#15803d",
          },
        });
      }
    }
    
    const baseZones: ExtendedZone[] = FARE_ZONES.map((z, i) => ({ ...z, originalIndex: i }));
    const zonesToProcess = destination === 'Town' ? [...baseZones].reverse() : [...baseZones];
    const originalColors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
    const reversedColors = [...originalColors].reverse();
    const colorsToUse = destination === 'Town' ? reversedColors : originalColors;

    const zoneData = await Promise.all(zonesToProcess.map(async (zone, idx) => {
      const start = destination === 'Town' ? zone.pts[1] : zone.pts[0];
      const end = destination === 'Town' ? zone.pts[0] : zone.pts[1];
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
        console.log('Route fetch error:', e);
        return { coords: [], color: zoneColor }; 
      }
    }));

    for (let i = 0; i < zoneData.length - 1; i++) {
      if (zoneData[i].coords.length > 0 && zoneData[i + 1].coords.length > 0) {
        const lastPoint = zoneData[i].coords[zoneData[i].coords.length - 1];
        const nextFirstPoint = zoneData[i + 1].coords[0];
        const distance = Math.sqrt(
          Math.pow(lastPoint[0] - nextFirstPoint[0], 2) + 
          Math.pow(lastPoint[1] - nextFirstPoint[1], 2)
        );
        if (distance > 0.0001) {
          zoneData[i + 1].coords.unshift(lastPoint);
        }
      }
    }

    postMessageToWebView({ 
      type: "DRAW_ZONES", 
      zones: zoneData,
      destination: destination 
    });
    
    setCurrentDest(destination);
    setRouteModalVisible(false);
    
    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), { 
        destination: destination,
        status: isFull ? 'full' : 'available'
      });
    }
  };

  const endTrip = () => {
    Alert.alert("End Trip", "Are you sure you want to end the current trip?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "End Trip", 
        style: "destructive", 
        onPress: async () => {
          setCurrentDest(null);
          postMessageToWebView({ type: "CLEAR_ZONES" });
          
          const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (isTracking) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          }
          
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

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 }, 
        (pos) => {
          const { latitude, longitude } = pos.coords;

          postMessageToWebView({ 
            type: "SET_LOCATION", 
            lat: latitude, 
            lng: longitude,
            isDriver: role === 'driver',
            hasActiveRoute: currentDest !== null
          });

          if (role === 'driver' && auth.currentUser) {
             update(ref(db, `jeeps/${auth.currentUser.uid}`), { 
               latitude, 
               longitude
             }).catch(err => console.log('Firebase update error:', err));
          }
        }
      );

      const jeepsRef = ref(db, 'jeeps');
      const unsubscribe = onValue(jeepsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          // Filter: Only include jeeps that have a valid destination (active trip)
          // This ensures that when a driver stops a trip (destination becomes null),
          // they are removed from the list sent to the map.
          const jeepsArray = Object.keys(data)
            .map(key => ({ id: key, ...data[key] }))
            .filter(j => j.destination && j.latitude && j.longitude); 
            
          console.log('Firebase: Active Jeeps:', jeepsArray.length);
          postMessageToWebView({ type: "SET_JEEPS", jeeps: jeepsArray });
        } else {
            // If no data exists, send empty array so map clears everyone
            postMessageToWebView({ type: "SET_JEEPS", jeeps: [] });
        }
      }, (error) => {
        console.log('Firebase listener error:', error);
      });

      return () => unsubscribe();
    })();

    return () => {
      if (locationSub.current) locationSub.current.remove();
    };
  }, [role, currentDest, webViewLoaded]);

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
          width: 20px; height: 20px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: 4px solid white; border-radius: 50%; 
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5), 0 0 0 8px rgba(102, 126, 234, 0.15);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5), 0 0 0 8px rgba(102, 126, 234, 0.15); }
          50% { box-shadow: 0 4px 12px rgba(102, 126, 234, 0.7), 0 0 0 12px rgba(102, 126, 234, 0.25); }
        }
        .jeep-marker { 
          width: 36px; height: 36px; 
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: 3px solid white; border-radius: 50%; 
          text-align: center; line-height: 30px; font-size: 18px; 
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
          transition: all 0.3s ease;
          cursor: pointer;
        }
        .jeep-marker:hover { transform: scale(1.1); }
        .jeep-full { 
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
        }
        /* Custom Popup Style */
        .leaflet-popup-content-wrapper {
            border-radius: 12px;
            padding: 0;
            overflow: hidden;
        }
        .leaflet-popup-content {
            margin: 0;
            width: 160px !important;
        }
        .popup-header {
            background: #10b981;
            color: white;
            padding: 8px;
            font-weight: bold;
            text-align: center;
        }
        .popup-body {
            padding: 10px;
            text-align: center;
        }
        .fare-row {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            margin-bottom: 4px;
            color: #374151;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        console.log('=== MAP SCRIPT STARTING ===');
        
        var map = L.map('map', { 
          zoomControl: false, 
          attributionControl: false 
        }).setView([16.4023, 120.5960], 14);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(map);

        var userMarker = null;
        var jeepMarkers = {};
        var routeSegments = [];
        var passengerViewRoutes = [];
        var isDriverMode = false;
        var hasActiveRoute = false;
        var jeepsData = {};

        console.log('Map initialized');

        setTimeout(function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
          }
        }, 500);

        function updateNavigatorRoute(lat, lng) {
          if (routeSegments.length === 0 || !hasActiveRoute) return;

          var currentPoly = routeSegments[0];
          var points = currentPoly.getLatLngs();
          if (!points || points.length === 0) return;

          var closestDist = Infinity;
          var closestIdx = -1;

          for (var i = 0; i < points.length; i++) {
            var d = map.distance([lat, lng], points[i]);
            if (d < closestDist) {
              closestDist = d;
              closestIdx = i;
            }
          }

          var lastPointDist = map.distance([lat, lng], points[points.length - 1]);
          if (lastPointDist < 40) {
            map.removeLayer(currentPoly);
            routeSegments.shift();
            if (routeSegments.length > 0) {
              var nextPoints = routeSegments[0].getLatLngs();
              if (nextPoints.length > 0) map.panTo(nextPoints[0]);
            }
            return;
          }

          if (closestIdx !== -1 && closestIdx < points.length - 1) {
            var remainingPoints = points.slice(closestIdx);
            remainingPoints.unshift([lat, lng]);
            currentPoly.setLatLngs(remainingPoints);
          }
        }

        function showJeepRoute(jeepId) {
          console.log('Showing route for jeep:', jeepId);
          // Clear previous passenger routes
          passengerViewRoutes.forEach(function(r) { map.removeLayer(r); });
          passengerViewRoutes = [];
          
          var jeep = jeepsData[jeepId];
          if (!jeep || !jeep.destination) return;
          
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
          var originalColors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
          var reversedColors = originalColors.slice().reverse();
          var colorsToUse = destination === 'Town' ? reversedColors : originalColors;
          
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
              .catch(function(err) { return { coords: [], color: color }; });
          });
          
          Promise.all(fetchPromises).then(function(zoneData) {
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
            
            // Do NOT fit bounds here automatically, it might annoy the user if they are panning.
            // But if you want to focus on the route, you can uncomment this:
            // if (passengerViewRoutes.length > 0) {
            //   var group = L.featureGroup(passengerViewRoutes);
            //   map.fitBounds(group.getBounds(), { padding: [50, 50] });
            // }
          });
        }

        function handleMessage(event) {
          try {
            var m = JSON.parse(event.data);
            
            if (m.type === "SET_LOCATION") {
              isDriverMode = m.isDriver;
              hasActiveRoute = m.hasActiveRoute || false;
              
              if (!userMarker) {
                var icon = L.divIcon({ className: 'user-dot', iconSize: [20, 20] });
                userMarker = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
                map.panTo([m.lat, m.lng]);
              } else {
                userMarker.setLatLng([m.lat, m.lng]);
                if (isDriverMode && hasActiveRoute) {
                  map.panTo([m.lat, m.lng], { animate: true, duration: 0.5 });
                }
              }

              if (isDriverMode && hasActiveRoute) {
                updateNavigatorRoute(m.lat, m.lng);
              }
            }
            
            if (m.type === "DRAW_ZONES") {
              routeSegments.forEach(function(s) { map.removeLayer(s); });
              routeSegments = [];
              
              m.zones.forEach(function(z) {
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
              
              if (routeSegments.length > 0) {
                var group = L.featureGroup(routeSegments);
                map.fitBounds(group.getBounds(), { padding: [50, 50] });
              }
            }

            if (m.type === "CLEAR_ZONES") { 
              routeSegments.forEach(function(s) { map.removeLayer(s); });
              routeSegments = [];
              hasActiveRoute = false;
            }

            if (m.type === "SET_JEEPS") {
              m.jeeps.forEach(function(j) {
                jeepsData[j.id] = j;
              });
              
              // Remove markers that are no longer in the list
              Object.keys(jeepMarkers).forEach(function(id) {
                if (!m.jeeps.find(function(j) { return j.id === id; })) {
                  map.removeLayer(jeepMarkers[id]);
                  
                  // Also clear routes if this specific jeep was being viewed
                  // You might want to keep the route or clear it. 
                  // For now, we clear passenger lines if the jeep disappears.
                  passengerViewRoutes.forEach(function(r) { map.removeLayer(r); });
                  passengerViewRoutes = [];
                  
                  delete jeepMarkers[id];
                }
              });
              
              m.jeeps.forEach(function(j) {
                var isFull = (j.status === 'full');
                
                // Construct Popup Content
                var destText = j.destination ? 'To ' + j.destination : 'Active Trip';
                var popupHtml = '<div class="popup-header">' + destText + '</div>' +
                                '<div class="popup-body">' + 
                                   '<div class="fare-row"><span>Regular</span> <span>₱15.00</span></div>' +
                                   '<div class="fare-row"><span>Student/Senior</span> <span>₱12.00</span></div>' +
                                '</div>';

                if (jeepMarkers[j.id]) {
                  // Update existing marker
                  jeepMarkers[j.id].setLatLng([j.latitude, j.longitude]);
                  
                  // Update Popup content dynamically
                  jeepMarkers[j.id].bindPopup(popupHtml);

                  var el = jeepMarkers[j.id].getElement();
                  if (el) {
                    if (isFull) el.classList.add('jeep-full');
                    else el.classList.remove('jeep-full');
                  }
                } else {
                  // Create new marker
                  var cssClass = 'jeep-marker' + (isFull ? ' jeep-full' : '');
                  var icon = L.divIcon({ className: cssClass, iconSize: [36, 36], html: '🚕' });
                  var marker = L.marker([j.latitude, j.longitude], { icon: icon }).addTo(map);
                  
                  marker.jeepId = j.id;
                  
                  // Bind Popup
                  marker.bindPopup(popupHtml, {
                      closeButton: false,
                      offset: [0, -10]
                  });

                  // Add Click Event to Show Route + Open Popup
                  marker.on('click', function(e) {
                    if (!isDriverMode) {
                      this.openPopup(); // Explicitly open the fare popup
                      showJeepRoute(this.jeepId); // Draw the route line
                    }
                  });
                  
                  jeepMarkers[j.id] = marker;
                }
              });
            }
          } catch(e) {
            console.error('❌ Message error:', e);
          }
        }

        window.addEventListener("message", handleMessage);
        document.addEventListener("message", handleMessage);
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
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        cacheEnabled={false}
        onLoad={() => {
          setWebViewLoaded(true);
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('❌ WebView error:', nativeEvent);
        }}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'MAP_READY') {
              setWebViewLoaded(true);
            }
          } catch (e) {
            console.error('Message parse error:', e);
          }
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('❌ HTTP Error:', nativeEvent.statusCode, nativeEvent.url);
        }}
        {...(Platform.OS === 'android' && {
          androidHardwareAccelerationDisabled: false,
          androidLayerType: 'hardware',
        })}
      />

      {role === 'driver' && (
        <View style={styles.driverPanel}>
          {currentDest ? (
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
              
              <View style={styles.statusButtonsRow}>
                <TouchableOpacity 
                  onPress={() => toggleStatus(false)} 
                  style={[styles.statusButton, styles.availableButton, !isFull && styles.statusButtonActive]}
                >
                  <Circle size={10} color={!isFull ? '#10B981' : '#9CA3AF'} fill={!isFull ? '#10B981' : '#9CA3AF'} />
                  <Text style={[styles.statusButtonText, !isFull && styles.statusButtonTextActive]}>Available</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  onPress={() => toggleStatus(true)} 
                  style={[styles.statusButton, styles.fullButton, isFull && styles.statusButtonActive]}
                >
                  <Circle size={10} color={isFull ? '#EF4444' : '#9CA3AF'} fill={isFull ? '#EF4444' : '#9CA3AF'} />
                  <Text style={[styles.statusButtonText, isFull && styles.statusButtonTextActive]}>Full</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity onPress={endTrip} style={styles.endTripBtn}>
                <XCircle color="#DC2626" size={20} />
                <Text style={styles.endTripText}>End Trip</Text>
              </TouchableOpacity>
            </View>
          ) : (
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

      <Modal visible={routeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Destination</Text>
            
            <TouchableOpacity onPress={() => startTrip('Town')} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: '#DBEAFE' }]}>
                <MapPin color="#15803d" size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.destinationTitle}>Balacbac to Town</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => startTrip('Balacbac')} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: '#FEF3C7' }]}>
                <MapPin color="#D97706" size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.destinationTitle}>Town to Balacbac</Text>
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
  driverPanel: { position: 'absolute', bottom: 20, left: 16, right: 16 },
  activeTripCard: {
    backgroundColor: 'white', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
  },
  tripHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  tripIconContainer: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#D1FAE5',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  tripLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },
  tripDestination: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  statusButtonsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statusButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, borderRadius: 14, gap: 8, borderWidth: 2, borderColor: '#E5E7EB',
  },
  statusButtonActive: { borderColor: '#15803d' },
  availableButton: { backgroundColor: '#F0FDF4' },
  fullButton: { backgroundColor: '#FEF2F2' },
  statusButtonText: { fontSize: 15, fontWeight: '700', color: '#6B7280' },
  statusButtonTextActive: { color: '#1F2937' },
  endTripBtn: {
    backgroundColor: '#FEE2E2', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  endTripText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
  startTripCard: {
    backgroundColor: 'white', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.15, elevation: 8,
  },
  startTripContent: { flexDirection: 'row', alignItems: 'center' },
  startIconContainer: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#15803d',
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  startTripTitle: { fontSize: 18, fontWeight: '700' },
  startTripSubtitle: { fontSize: 14, color: '#6B7280' },
  arrowContainer: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#15803d',
    alignItems: 'center', justifyContent: 'center'
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { 
    backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: 40
  },
  modalHandle: {
    width: 40, height: 5, backgroundColor: '#E5E7EB',
    borderRadius: 3, alignSelf: 'center', marginBottom: 20
  },
  modalTitle: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  destinationCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
    borderRadius: 16, padding: 16, marginBottom: 12
  },
  destinationIcon: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', marginRight: 16
  },
  destinationTitle: { fontSize: 16, fontWeight: '700' },
  cancelBtn: { marginTop: 12, paddingVertical: 16, alignItems: 'center' },
  cancelText: { color: '#6B7280', fontSize: 16, fontWeight: '600' },
});
import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Modal, Alert, Animated, Platform } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as TaskManager from 'expo-task-manager';
import { Navigation as NavIcon, MapPin, Circle, XCircle, DollarSign } from "lucide-react-native"; 
import { ref, onValue, update, get, remove } from "firebase/database";
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
  const [fareModalVisible, setFareModalVisible] = useState(false);
  
  const activeZonesRef = useRef<ExtendedZone[]>([]);
  const locationSub = useRef<any>(null);
  const currentLocationRef = useRef<{ lat: number; lng: number } | null>(null);
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
      console.log('Sending to WebView:', message.type);
      webViewRef.current.postMessage(messageStr);
    } else {
      console.log('WebView not ready, message dropped:', message.type);
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

    const originalColors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

    // Send all the raw zone waypoints + driver location to the WebView.
    // The WebView will do a single multi-waypoint OSRM call so the road
    // geometry is always correct (no straight-line gaps between zones).
    postMessageToWebView({
      type: "DRAW_ZONES",
      destination,
      driverLat: currentLocationRef.current?.lat ?? null,
      driverLng: currentLocationRef.current?.lng ?? null,
      zoneColors: destination === 'Town' ? [...originalColors].reverse() : originalColors,
    });

    setCurrentDest(destination);
    setRouteModalVisible(false);

    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), {
        destination,
        status: isFull ? 'full' : 'available',
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
            await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
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

          // Always keep the latest position so startTrip can use it
          currentLocationRef.current = { lat: latitude, lng: longitude };

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
          const jeepsArray = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          console.log('Firebase: Got', jeepsArray.length, 'jeeps');
          postMessageToWebView({ type: "SET_JEEPS", jeeps: jeepsArray });
        } else {
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
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        console.log('=== MAP SCRIPT STARTING ===');

        var map = L.map('map', {
          zoomControl: false,
          attributionControl: false,
          preferCanvas: true
        }).setView([16.4023, 120.5960], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(map);

        var userMarker = null;
        var jeepMarkers = {};
        var routeSegments = [];       // driver view layers (triplets)
        var passengerViewRoutes = []; // passenger view layers
        var isDriverMode = false;
        var hasActiveRoute = false;
        var jeepsData = {};

        // ─── Fixed route waypoints ────────────────────────────────────────────────
        var ROUTE_POINTS = {
          TOWN:       [16.414019, 120.593455],
          SHELL:      [16.393590, 120.579564],
          JUNCTION:   [16.388988, 120.575658],
          INTERIOR_A: [16.386876, 120.576439],
          CENTRO:     [16.380109, 120.579936],
          FRIENDSHIP: [16.378661, 120.580563],
          TIERRA:     [16.378759, 120.586049],
        };

        // Ordered waypoints for the full route (Town → Tierra direction)
        // Each segment between consecutive points = one fare zone
        var ROUTE_WAYPOINTS_FWD = [
          ROUTE_POINTS.TOWN,
          ROUTE_POINTS.SHELL,
          ROUTE_POINTS.JUNCTION,
          ROUTE_POINTS.INTERIOR_A,
          ROUTE_POINTS.CENTRO,
          ROUTE_POINTS.FRIENDSHIP,
          ROUTE_POINTS.TIERRA,
        ];

        // Zone boundary indices into ROUTE_WAYPOINTS_FWD (0-based, inclusive pairs)
        // z1: TOWN→SHELL (idx 0→1), z2: SHELL→JUNCTION (1→2),
        // z3: INTERIOR_A→CENTRO (3→4), z4: FRIENDSHIP→TIERRA (5→6)
        var ZONE_SEGMENT_RANGES = [
          { start: 0, end: 1 },  // zone 1
          { start: 1, end: 2 },  // zone 2
          { start: 3, end: 4 },  // zone 3
          { start: 5, end: 6 },  // zone 4
        ];

        setTimeout(function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
          }
        }, 500);

        // ─── Waze/Grab-style layered polyline ────────────────────────────────────
        function hexToRgb(hex) {
          var r = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
          return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) }
                   : { r: 0, g: 0, b: 0 };
        }
        function darkenColor(hex, factor) {
          var c = hexToRgb(hex);
          return 'rgb('+Math.round(c.r*factor)+','+Math.round(c.g*factor)+','+Math.round(c.b*factor)+')';
        }
        function drawNavRoute(coords, color, layerArray) {
          if (!coords || coords.length === 0) return;
          var opts = { lineCap: 'round', lineJoin: 'round', smoothFactor: 1 };
          var casing  = L.polyline(coords, Object.assign({}, opts, { color: 'rgba(255,255,255,0.95)', weight: 16, opacity: 1   })).addTo(map);
          var outline = L.polyline(coords, Object.assign({}, opts, { color: darkenColor(color, 0.55),            weight: 12, opacity: 0.6  })).addTo(map);
          var fill    = L.polyline(coords, Object.assign({}, opts, { color: color,                               weight: 8,  opacity: 1   })).addTo(map);
          layerArray.push(casing, outline, fill);
        }
        // ─────────────────────────────────────────────────────────────────────────

        // ─── Full multi-waypoint OSRM fetch ──────────────────────────────────────
        // Takes an ordered array of [lat,lng] waypoints and returns the road-snapped
        // geometry split back into per-zone segments using the annotation indices.
        function fetchFullRoute(waypoints) {
          var coordStr = waypoints.map(function(p) { return p[1] + ',' + p[0]; }).join(';');
          var url = 'https://router.project-osrm.org/route/v1/driving/' + coordStr
                  + '?overview=full&geometries=geojson&annotations=false';
          return fetch(url)
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (!data.routes || !data.routes[0]) return null;
              // Full road geometry
              var allCoords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
              return allCoords;
            })
            .catch(function(e) { console.log('OSRM error:', e); return null; });
        }

        // Given the full polyline coords and the via-waypoints from OSRM,
        // split the geometry at the closest point to each zone boundary waypoint.
        function splitRouteIntoZones(allCoords, boundaryLatLngs) {
          // boundaryLatLngs = the zone-boundary points (not including start/end of whole route)
          var segments = [];
          var remaining = allCoords.slice();

          for (var b = 0; b < boundaryLatLngs.length; b++) {
            var target = boundaryLatLngs[b];
            var bestIdx = 0;
            var bestDist = Infinity;
            for (var i = 0; i < remaining.length; i++) {
              var d = Math.pow(remaining[i][0] - target[0], 2) + Math.pow(remaining[i][1] - target[1], 2);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            segments.push(remaining.slice(0, bestIdx + 1));
            remaining = remaining.slice(bestIdx);
          }
          segments.push(remaining); // last segment
          return segments;
        }

        // Build and draw the full route starting from originLatLng through all
        // zone waypoints in direction order, colouring each zone segment.
        function buildAndDrawRoute(originLat, originLng, destination, zoneColors, layerArray) {
          // Choose waypoint order based on destination
          var orderedWaypoints = destination === 'Balacbac'
            ? ROUTE_WAYPOINTS_FWD.slice()           // Town → Tierra
            : ROUTE_WAYPOINTS_FWD.slice().reverse(); // Tierra → Town

          // Prepend driver/jeep current position as the route origin
          var allWaypoints = [[originLat, originLng]].concat(orderedWaypoints);

          // Zone boundary waypoints (all except the very first and very last of allWaypoints)
          // These are used to split the returned geometry into coloured segments
          var boundaries = allWaypoints.slice(1, allWaypoints.length - 1);

          return fetchFullRoute(allWaypoints).then(function(allCoords) {
            if (!allCoords) return;

            // Split the full geometry at each intermediate waypoint
            var rawSegments = splitRouteIntoZones(allCoords, boundaries);

            // We have (waypoints-1) raw segments; map them to zone colors.
            // The first raw segment is from the driver to the first zone waypoint — 
            // it gets the color of zone 1 (the zone the driver is currently in/approaching).
            // Subsequent raw segments map to zone colors in order.
            // Because zones 1+2 share waypoints and zones 3+4 share waypoints there
            // are 6 raw segments (driver→TOWN, TOWN→SHELL … FRIENDSHIP→TIERRA for Balacbac).
            // We need to merge the segments that belong to the same colour zone.
            // Simpler approach: just colour every segment with the color of the zone
            // that its end-waypoint belongs to, falling back gracefully.

            rawSegments.forEach(function(seg, idx) {
              // Map raw segment index → zone colour index
              // raw[0] = driver→first_waypoint (pre-zone, use zone[0] color)
              // raw[1..N] = between zone waypoints → use zone color[idx-1] capped
              var colorIdx = Math.min(idx, zoneColors.length - 1);
              // For Balacbac direction colors are already pre-reversed from RN side
              drawNavRoute(seg, zoneColors[colorIdx], layerArray);
            });

            if (layerArray.length > 0) {
              var fills = layerArray.filter(function(_, i) { return i % 3 === 2; });
              if (fills.length > 0) {
                map.fitBounds(L.featureGroup(fills).getBounds(), { padding: [50, 50] });
              }
            }
          });
        }
        // ─────────────────────────────────────────────────────────────────────────

        // ─── Live route trimming (driver view) ───────────────────────────────────
        function updateNavigatorRoute(lat, lng) {
          var fills = routeSegments.filter(function(_, i) { return i % 3 === 2; });
          if (fills.length === 0 || !hasActiveRoute) return;

          var currentFill = fills[0];
          var points = currentFill.getLatLngs();
          if (!points || points.length === 0) return;

          // If we've reached the end of this segment, drop the whole triplet
          var lastDist = map.distance([lat, lng], points[points.length - 1]);
          if (lastDist < 40) {
            for (var t = 0; t < 3; t++) {
              if (routeSegments[0]) { map.removeLayer(routeSegments[0]); routeSegments.shift(); }
            }
            return;
          }

          // Trim the leading portion of all 3 layers to the driver's current position
          var closestIdx = 0, closestDist = Infinity;
          for (var i = 0; i < points.length; i++) {
            var d = map.distance([lat, lng], points[i]);
            if (d < closestDist) { closestDist = d; closestIdx = i; }
          }
          if (closestIdx > 0 && closestIdx < points.length - 1) {
            var trimmed = [[lat, lng]].concat(points.slice(closestIdx + 1));
            [0, 1, 2].forEach(function(offset) {
              if (routeSegments[offset]) routeSegments[offset].setLatLngs(trimmed);
            });
          }
        }
        // ─────────────────────────────────────────────────────────────────────────

        function showJeepRoute(jeepId) {
          passengerViewRoutes.forEach(function(r) { map.removeLayer(r); });
          passengerViewRoutes = [];

          var jeep = jeepsData[jeepId];
          if (!jeep || !jeep.destination || !jeep.latitude || !jeep.longitude) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SHOW_FARE_MODAL', jeepId: jeepId }));
            }
            return;
          }

          var destination = jeep.destination;
          var originalColors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
          var zoneColors = destination === 'Town' ? originalColors.slice().reverse() : originalColors;

          buildAndDrawRoute(
            jeep.latitude, jeep.longitude,
            destination,
            zoneColors,
            passengerViewRoutes
          ).then(function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SHOW_FARE_MODAL',
                jeepId: jeepId,
                destination: destination
              }));
            }
          });
        }

        function handleMessage(event) {
          try {
            var m = JSON.parse(event.data);
            console.log('Received:', m.type);

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
              // Clear old layers
              routeSegments.forEach(function(s) { map.removeLayer(s); });
              routeSegments = [];

              // Use driver's current location if available, otherwise fall back to
              // the first zone waypoint in the chosen direction
              var originLat = m.driverLat;
              var originLng = m.driverLng;
              if (originLat === null || originLat === undefined) {
                var fallback = m.destination === 'Balacbac'
                  ? ROUTE_WAYPOINTS_FWD[0]
                  : ROUTE_WAYPOINTS_FWD[ROUTE_WAYPOINTS_FWD.length - 1];
                originLat = fallback[0];
                originLng = fallback[1];
              }

              hasActiveRoute = true;
              buildAndDrawRoute(originLat, originLng, m.destination, m.zoneColors, routeSegments);
            }

            if (m.type === "CLEAR_ZONES") {
              routeSegments.forEach(function(s) { map.removeLayer(s); });
              routeSegments = [];
              hasActiveRoute = false;
            }

            if (m.type === "SET_JEEPS") {
              var newJeepsData = {};
              m.jeeps.forEach(function(j) { newJeepsData[j.id] = j; });

              Object.keys(jeepMarkers).forEach(function(id) {
                if (!newJeepsData[id]) {
                  map.removeLayer(jeepMarkers[id]);
                  delete jeepMarkers[id];
                }
              });
              jeepsData = newJeepsData;

              m.jeeps.forEach(function(j) {
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
                  marker.jeepId = j.id;
                  marker.on('click', function() { showJeepRoute(this.jeepId); });
                  jeepMarkers[j.id] = marker;
                }
              });
            }
          } catch(e) {
            console.error('Message error:', e);
          }
        }

        window.addEventListener("message", handleMessage);
        document.addEventListener("message", handleMessage);
        console.log('=== EVENT LISTENERS REGISTERED ===');
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
          console.log('WebView loaded');
          setWebViewLoaded(true);
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent);
        }}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            console.log('Message from WebView:', message.type);
            
            if (message.type === 'MAP_READY') {
              setWebViewLoaded(true);
            }
            
            if (message.type === 'SHOW_FARE_MODAL') {
              setFareModalVisible(true);
            }
          } catch (e) {
            console.error('Message parse error:', e);
          }
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('HTTP Error:', nativeEvent.statusCode, nativeEvent.url);
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

      {/* DESTINATION MODAL */}
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
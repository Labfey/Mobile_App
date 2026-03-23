import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Modal, Alert, Animated, Platform, TextInput, KeyboardAvoidingView, Image } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { Navigation as NavIcon, MapPin, Circle, XCircle, User, Truck, ChevronRight, X } from "lucide-react-native";
import { ref, onValue, update, get, remove } from "firebase/database";
import { auth, db } from "../../services/firebase";
import { FARE_ZONES } from "../../constants/routes";

// Show notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // legacy SDK <50
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,  // required SDK >=50
    shouldShowList: true,    // required SDK >=50
  }),
});

// Terminal coords — departure notification fires when a driver starts from here
const TERMINALS = {
  TOWN:   { lat: 16.414019, lng: 120.593455, label: "Town Terminal" },
  TIERRA: { lat: 16.378759, lng: 120.586049, label: "Balacbac Terminal" },
};
const TERMINAL_RADIUS_METERS = 80;

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

  // ── Driver profile setup (name + plate) ─────────────────────────────────
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [pendingDestination, setPendingDestination] = useState<'Town' | 'Balacbac' | null>(null);

  // ── Driver info bottom sheet (passenger taps a jeep) ────────────────────
  const [jeepInfoVisible, setJeepInfoVisible] = useState(false);
  const [selectedJeepInfo, setSelectedJeepInfo] = useState<{
    driverName: string;
    plateNumber: string;
    profilePic: string | null;
    status: string;
    destination: string | null;
  } | null>(null);
  const jeepSheetAnim = useRef(new Animated.Value(300)).current;

  // ── In-app departure banner ──────────────────────────────────────────────
  const [departureBanner, setDepartureBanner] = useState<{
    visible: boolean;
    message: string;
    terminal: string;
  }>({ visible: false, message: '', terminal: '' });
  const bannerAnim = useRef(new Animated.Value(-100)).current;
  // Track which jeep IDs have already fired a departure so we don't spam
  const departedJeepsRef = useRef<Set<string>>(new Set());

  // ── Notification permission ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Notification permission not granted');
      }
    })();
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const showDepartureBanner = (message: string, terminal: string) => {
    setDepartureBanner({ visible: true, message, terminal });
    Animated.sequence([
      Animated.spring(bannerAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.delay(4000),
      Animated.timing(bannerAnim, { toValue: -120, duration: 400, useNativeDriver: true }),
    ]).start(() => setDepartureBanner(prev => ({ ...prev, visible: false })));
  };

  const sendPushNotification = async (title: string, body: string) => {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null, // fire immediately
    });
  };

  const openJeepInfoSheet = (info: typeof selectedJeepInfo) => {
    setSelectedJeepInfo(info);
    setJeepInfoVisible(true);
    Animated.spring(jeepSheetAnim, {
      toValue: 0, useNativeDriver: true, tension: 80, friction: 12,
    }).start();
  };

  const closeJeepInfoSheet = () => {
    Animated.timing(jeepSheetAnim, {
      toValue: 400, duration: 280, useNativeDriver: true,
    }).start(() => setJeepInfoVisible(false));
  };

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
    // Check if driver has a name and plate set in jeep_info — prompt if not
    if (auth.currentUser) {
      const snap = await get(ref(db, `jeep_info/${auth.currentUser.uid}`));
      const jeepData = snap.exists() ? snap.val() : {};
      if (!jeepData.driverName || !jeepData.plate) {
        setDriverName(jeepData.driverName || '');
        setPlateNumber(jeepData.plate || '');
        setPendingDestination(destination);
        setRouteModalVisible(false);
        setProfileModalVisible(true);
        return; // wait for profile to be saved before continuing
      }
    }
    await _executeStartTrip(destination);
  };

  const _executeStartTrip = async (destination: 'Town' | 'Balacbac') => {
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
    postMessageToWebView({
      type: "DRAW_ZONES",
      destination,
      driverLat: currentLocationRef.current?.lat ?? null,
      driverLng: currentLocationRef.current?.lng ?? null,
      zoneColors: destination === 'Town' ? [...originalColors].reverse() : originalColors,
    });

    setCurrentDest(destination);
    setRouteModalVisible(false);

    // Check if driver is departing from a terminal and fire notification
    if (currentLocationRef.current) {
      const { lat, lng } = currentLocationRef.current;
      const nearTown   = haversineMeters(lat, lng, TERMINALS.TOWN.lat,   TERMINALS.TOWN.lng)   < TERMINAL_RADIUS_METERS;
      const nearTierra = haversineMeters(lat, lng, TERMINALS.TIERRA.lat, TERMINALS.TIERRA.lng) < TERMINAL_RADIUS_METERS;
      const terminalLabel = nearTown ? TERMINALS.TOWN.label : nearTierra ? TERMINALS.TIERRA.label : null;

      if (terminalLabel) {
        const msg = `A jeep has departed from ${terminalLabel} heading to ${destination === 'Town' ? 'Town' : 'Balacbac'}`;
        sendPushNotification('🚌 Jeep Departed!', msg);
        showDepartureBanner(msg, terminalLabel);
      }
    }

    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), {
        destination,
        status: isFull ? 'full' : 'available',
      });
    }
  };

  const saveProfileAndStart = async () => {
    if (!driverName.trim()) {
      Alert.alert('Required', 'Please enter your name.'); return;
    }
    if (!plateNumber.trim()) {
      Alert.alert('Required', 'Please enter your plate number.'); return;
    }
    if (auth.currentUser) {
      await update(ref(db, `jeep_info/${auth.currentUser.uid}`), {
        driverName: driverName.trim(),
        plate: plateNumber.trim().toUpperCase(),
        route: 'Balacbac – Town', // default route
        updatedAt: Date.now(),
      });
    }
    setProfileModalVisible(false);
    if (pendingDestination) {
      await _executeStartTrip(pendingDestination);
      setPendingDestination(null);
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

  // Refs so callbacks always see the latest values without re-subscribing
  const roleRef = useRef(role);
  const currentDestRef = useRef(currentDest);
  const webViewLoadedRef = useRef(webViewLoaded);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { currentDestRef.current = currentDest; }, [currentDest]);
  useEffect(() => { webViewLoadedRef.current = webViewLoaded; }, [webViewLoaded]);

  // Location subscription — created ONCE, never torn down and re-created
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (pos) => {
          const { latitude, longitude } = pos.coords;
          currentLocationRef.current = { lat: latitude, lng: longitude };

          // Read latest values from refs — avoids stale closure
          const liveRole = roleRef.current;
          const liveDest = currentDestRef.current;
          const liveLoaded = webViewLoadedRef.current;

          if (liveLoaded && webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({
              type: "SET_LOCATION",
              lat: latitude,
              lng: longitude,
              isDriver: liveRole === 'driver',
              hasActiveRoute: liveDest !== null,
            }));
          }

          if (liveRole === 'driver' && auth.currentUser) {
            update(ref(db, `jeeps/${auth.currentUser.uid}`), {
              latitude,
              longitude,
            }).catch(err => console.log('Firebase update error:', err));
          }
        }
      );
    })();

    return () => {
      if (locationSub.current) {
        locationSub.current.remove();
        locationSub.current = null;
      }
    };
  }, []); // empty deps — subscribe once for the lifetime of the screen

  // Firebase jeeps listener — watches for new departures too
  useEffect(() => {
    if (!webViewLoaded) return;

    const jeepsRef = ref(db, 'jeeps');
    const unsubscribe = onValue(jeepsRef, (snapshot) => {
      const jeepsArray = snapshot.exists()
        ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }))
        : [];

      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: "SET_JEEPS", jeeps: jeepsArray }));
      }

      // Departure detection for passengers/guests:
      // If a jeep appears that we haven't seen before AND it's at a terminal → notify
      if (roleRef.current !== 'driver') {
        jeepsArray.forEach((jeep: any) => {
          if (!departedJeepsRef.current.has(jeep.id) && jeep.latitude && jeep.longitude && jeep.destination) {
            const nearTown   = haversineMeters(jeep.latitude, jeep.longitude, TERMINALS.TOWN.lat,   TERMINALS.TOWN.lng)   < TERMINAL_RADIUS_METERS;
            const nearTierra = haversineMeters(jeep.latitude, jeep.longitude, TERMINALS.TIERRA.lat, TERMINALS.TIERRA.lng) < TERMINAL_RADIUS_METERS;
            const terminalLabel = nearTown ? TERMINALS.TOWN.label : nearTierra ? TERMINALS.TIERRA.label : null;
            if (terminalLabel) {
              const msg = `A jeep has departed from ${terminalLabel} heading to ${jeep.destination}`;
              sendPushNotification('🚌 Jeep Departed!', msg);
              showDepartureBanner(msg, terminalLabel);
            }
            departedJeepsRef.current.add(jeep.id);
          }
        });
        // Clean up departed IDs that are no longer in Firebase
        const activeIds = new Set(jeepsArray.map((j: any) => j.id));
        departedJeepsRef.current.forEach(id => {
          if (!activeIds.has(id)) departedJeepsRef.current.delete(id);
        });
      }
    }, (error) => {
      console.log('Firebase listener error:', error);
    });

    return () => unsubscribe();
  }, [webViewLoaded]);


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

        /* ── Passenger / guest: blue pulsing dot ── */
        .passenger-dot {
          width: 18px; height: 18px;
          background: #3b82f6;
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 2px 8px rgba(59,130,246,0.5), 0 0 0 6px rgba(59,130,246,0.15);
          animation: passengerPulse 2s infinite;
        }
        @keyframes passengerPulse {
          0%,100% { box-shadow: 0 2px 8px rgba(59,130,246,0.5), 0 0 0 6px rgba(59,130,246,0.15); }
          50%      { box-shadow: 0 2px 8px rgba(59,130,246,0.7), 0 0 0 10px rgba(59,130,246,0.25); }
        }

        /* ── Driver: green pill badge with steering wheel icon ── */
        .driver-marker-wrap {
          display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px;
          background: linear-gradient(135deg, #15803d 0%, #16a34a 100%);
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 4px 14px rgba(21,128,61,0.55), 0 0 0 5px rgba(21,128,61,0.18);
          animation: driverPulse 2.5s infinite;
        }
        @keyframes driverPulse {
          0%,100% { box-shadow: 0 4px 14px rgba(21,128,61,0.55), 0 0 0 5px rgba(21,128,61,0.18); }
          50%      { box-shadow: 0 4px 14px rgba(21,128,61,0.75), 0 0 0 9px rgba(21,128,61,0.28); }
        }
        .driver-marker-wrap svg { display: block; }

        /* ── Jeep markers on the map (other drivers seen by passengers) ── */
        .jeep-marker {
          display: flex; align-items: center; justify-content: center;
          width: 42px; height: 42px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border: 3px solid white; border-radius: 12px;
          box-shadow: 0 4px 12px rgba(245,158,11,0.45);
          font-size: 20px; line-height: 1;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .jeep-marker:hover { transform: scale(1.12); box-shadow: 0 6px 18px rgba(245,158,11,0.55); }
        .jeep-full {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
          box-shadow: 0 4px 12px rgba(239,68,68,0.45) !important;
        }
        .jeep-full:hover { box-shadow: 0 6px 18px rgba(239,68,68,0.55) !important; }
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
              var prevDriverMode = isDriverMode;
              isDriverMode = m.isDriver;
              hasActiveRoute = m.hasActiveRoute || false;

              // SVG steering-wheel icon used for the driver marker
              var driverIconHtml = '<div class="driver-marker-wrap">'
                + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
                + '<circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/>'
                + '<circle cx="12" cy="12" r="3" fill="white"/>'
                + '<line x1="12" y1="2" x2="12" y2="9" stroke="white" stroke-width="2" stroke-linecap="round"/>'
                + '<line x1="4.22" y1="16" x2="10.27" y2="13.5" stroke="white" stroke-width="2" stroke-linecap="round"/>'
                + '<line x1="19.78" y1="16" x2="13.73" y2="13.5" stroke="white" stroke-width="2" stroke-linecap="round"/>'
                + '</svg></div>';

              var passengerIconHtml = '<div class="passenger-dot"></div>';

              // Build the correct icon for the current role
              function makeUserIcon() {
                if (isDriverMode) {
                  return L.divIcon({
                    className: '',
                    html: driverIconHtml,
                    iconSize: [44, 44],
                    iconAnchor: [22, 22],
                  });
                } else {
                  return L.divIcon({
                    className: '',
                    html: passengerIconHtml,
                    iconSize: [18, 18],
                    iconAnchor: [9, 9],
                  });
                }
              }

              if (!userMarker) {
                userMarker = L.marker([m.lat, m.lng], { icon: makeUserIcon() }).addTo(map);
                map.panTo([m.lat, m.lng]);
              } else {
                // Swap icon if role changed (e.g. driver ends trip and becomes passenger)
                if (prevDriverMode !== isDriverMode) {
                  userMarker.setIcon(makeUserIcon());
                }
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
                  // Refresh icon so full/available color updates correctly
                  var updatedClass = 'jeep-marker' + (isFull ? ' jeep-full' : '');
                  jeepMarkers[j.id].setIcon(L.divIcon({ className: '', html: '<div class="' + updatedClass + '">🚌</div>', iconSize: [42, 42], iconAnchor: [21, 21] }));
                } else {
                  var cssClass = 'jeep-marker' + (isFull ? ' jeep-full' : '');
                  var icon = L.divIcon({ className: '', html: '<div class="' + cssClass + '">🚌</div>', iconSize: [42, 42], iconAnchor: [21, 21] });
                  var marker = L.marker([j.latitude, j.longitude], { icon: icon }).addTo(map);
                  marker.jeepId = j.id;
                  marker.on('click', function() {
                    var jd = jeepsData[this.jeepId];
                    // Draw the route on map (existing behaviour)
                    showJeepRoute(this.jeepId);
                    // Also send tap event to React Native so it shows the driver info sheet
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'JEEP_TAPPED',
                        jeepId: this.jeepId,
                        destination: jd ? jd.destination : null,
                        status: jd ? jd.status : 'available',
                      }));
                    }
                  });
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

            // Passenger tapped a jeep marker — fetch driver profile from Firebase
            if (message.type === 'JEEP_TAPPED') {
              const { jeepId, destination, status } = message;
              // Driver profile lives in jeep_info/{uid} — same path used by JeepInfoScreen
              get(ref(db, `jeep_info/${jeepId}`)).then(snap => {
                const jeepData = snap.exists() ? snap.val() : {};
                openJeepInfoSheet({
                  driverName: jeepData.driverName || 'Unknown Driver',
                  plateNumber: jeepData.plate || 'Not set',
                  profilePic: jeepData.profilePic || null,
                  status: status || 'available',
                  destination: destination || null,
                });
              }).catch(() => {
                openJeepInfoSheet({
                  driverName: 'Unknown Driver',
                  plateNumber: 'Not set',
                  profilePic: null,
                  status: status || 'available',
                  destination: destination || null,
                });
              });
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

      {/* ── DEPARTURE BANNER ───────────────────────────────────────────────── */}
      {departureBanner.visible && (
        <Animated.View style={[styles.departureBanner, { transform: [{ translateY: bannerAnim }] }]}>
          <View style={styles.departureBannerIcon}>
            <Text style={{ fontSize: 20 }}>🚌</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.departureBannerTitle}>Jeep Departed!</Text>
            <Text style={styles.departureBannerMsg} numberOfLines={2}>{departureBanner.message}</Text>
          </View>
          <TouchableOpacity onPress={() => setDepartureBanner(p => ({ ...p, visible: false }))}>
            <X color="#fff" size={18} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── DRIVER INFO BOTTOM SHEET (passenger taps a jeep) ──────────────── */}
      {jeepInfoVisible && (
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeJeepInfoSheet} />
          <Animated.View style={[styles.jeepInfoSheet, { transform: [{ translateY: jeepSheetAnim }] }]}>
            <View style={styles.sheetHandle} />

            {/* Driver avatar + name header */}
            <View style={styles.sheetDriverHeader}>
              {selectedJeepInfo?.profilePic ? (
                <Image
                  source={{ uri: selectedJeepInfo.profilePic }}
                  style={styles.sheetDriverAvatar}
                />
              ) : (
                <View style={styles.sheetDriverAvatarFallback}>
                  <User color="#6B7280" size={28} />
                </View>
              )}
              <View style={{ marginLeft: 14 }}>
                <Text style={styles.sheetTitle}>{selectedJeepInfo?.driverName ?? 'Jeep Info'}</Text>
                <Text style={styles.sheetDriverPlate}>{selectedJeepInfo?.plateNumber ?? ''}</Text>
              </View>
            </View>

            {/* Destination */}
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, { backgroundColor: '#DBEAFE' }]}>
                <MapPin color="#3B82F6" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Heading To</Text>
                <Text style={styles.sheetRowValue}>
                  {selectedJeepInfo?.destination
                    ? (selectedJeepInfo.destination === 'Town' ? 'Town' : 'Balacbac')
                    : 'Not started'}
                </Text>
              </View>
            </View>

            {/* Status */}
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, {
                backgroundColor: selectedJeepInfo?.status === 'full' ? '#FEE2E2' : '#D1FAE5'
              }]}>
                <Circle
                  size={20}
                  color={selectedJeepInfo?.status === 'full' ? '#EF4444' : '#10B981'}
                  fill={selectedJeepInfo?.status === 'full' ? '#EF4444' : '#10B981'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Status</Text>
                <Text style={[styles.sheetRowValue, {
                  color: selectedJeepInfo?.status === 'full' ? '#EF4444' : '#10B981'
                }]}>
                  {selectedJeepInfo?.status === 'full' ? 'Full' : 'Available'}
                </Text>
              </View>
            </View>

            {/* Route */}
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, { backgroundColor: '#F3F4F6' }]}>
                <Truck color="#6B7280" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Route</Text>
                <Text style={styles.sheetRowValue}>Balacbac – Town</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.sheetCloseBtn} onPress={closeJeepInfoSheet}>
              <Text style={styles.sheetCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* ── DRIVER PROFILE SETUP MODAL (first time starting a trip) ──────── */}
      <Modal visible={profileModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Set Up Your Profile</Text>
            <Text style={styles.profileSubtitle}>
              Passengers will see this info when they tap your jeep.
            </Text>

            <Text style={styles.inputLabel}>Your Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Juan dela Cruz"
              value={driverName}
              onChangeText={setDriverName}
              autoCapitalize="words"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.inputLabel}>Plate Number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. ABC 1234"
              value={plateNumber}
              onChangeText={setPlateNumber}
              autoCapitalize="characters"
              placeholderTextColor="#9CA3AF"
            />

            <TouchableOpacity style={styles.saveProfileBtn} onPress={saveProfileAndStart}>
              <Text style={styles.saveProfileBtnText}>Save & Start Trip</Text>
              <ChevronRight color="white" size={20} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setProfileModalVisible(false); setPendingDestination(null); }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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

  // ── Departure banner ─────────────────────────────────────────────────────
  departureBanner: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: '#15803d',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 52 : 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
    zIndex: 999,
  },
  departureBannerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  departureBannerTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  departureBannerMsg: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },

  // ── Jeep info bottom sheet ───────────────────────────────────────────────
  sheetOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 100,
  },
  jeepInfoSheet: {
    backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 20,
  },
  sheetHandle: {
    width: 40, height: 5, backgroundColor: '#E5E7EB',
    borderRadius: 3, alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  sheetIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetRowLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  sheetRowValue: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  sheetDriverHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 20,
  },
  sheetDriverAvatar: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 2, borderColor: '#E5E7EB',
  },
  sheetDriverAvatarFallback: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#E5E7EB',
  },
  sheetDriverPlate: {
    fontSize: 13, color: '#6B7280', fontWeight: '600',
    marginTop: 2,
  },
  sheetCloseBtn: {
    marginTop: 20, backgroundColor: '#F3F4F6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  sheetCloseBtnText: { color: '#374151', fontWeight: '700', fontSize: 15 },

  // ── Driver profile setup ─────────────────────────────────────────────────
  profileSubtitle: { color: '#6B7280', fontSize: 14, marginBottom: 24, marginTop: -8 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  textInput: {
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#111827', marginBottom: 16,
  },
  saveProfileBtn: {
    backgroundColor: '#15803d', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4,
  },
  saveProfileBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
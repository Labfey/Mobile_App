import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Modal, Alert, Animated, Platform, TextInput, KeyboardAvoidingView, Image, PanResponder } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { Navigation as NavIcon, MapPin, Circle, XCircle, User, Truck, ChevronRight, X, Calculator } from "lucide-react-native";
import { ref, onValue, update, get, remove } from "firebase/database";
import { auth, db } from "../../services/firebase";
import { FARE_ZONES } from "../../constants/routes";

// Show notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const TERMINALS = {
  TOWN:   { lat: 16.414019, lng: 120.593455, label: "Town Terminal" },
  TIERRA: { lat: 16.378759, lng: 120.586049, label: "Balacbac Terminal" },
};
const TERMINAL_RADIUS_METERS = 80;
const LOCATION_TASK_NAME = 'background-location-task';

// ── Fare calculation constants ───────────────────────────────────────────────
const BASE_FARE = 13;        // PHP — first 4 km
const FARE_PER_KM = 1.80;   // PHP per km after base
const BASE_KM = 4;

function computeFare(distanceKm: number): number {
  if (distanceKm <= BASE_KM) return BASE_FARE;
  return Math.ceil(BASE_FARE + (distanceKm - BASE_KM) * FARE_PER_KM);
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) { console.error('Background task error:', error); return; }
  if (data) {
    const { locations } = data;
    const { latitude, longitude } = locations[0].coords;
    if (auth.currentUser) {
      try {
        await update(ref(db, `jeeps/${auth.currentUser.uid}`), { latitude, longitude });
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

  // ── Driver profile ───────────────────────────────────────────────────────
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [pendingDestination, setPendingDestination] = useState<'Town' | 'Balacbac' | null>(null);

  // ── Jeep info bottom sheet ───────────────────────────────────────────────
  const [jeepInfoVisible, setJeepInfoVisible] = useState(false);
  const [selectedJeepInfo, setSelectedJeepInfo] = useState<{
    driverName: string;
    plateNumber: string;
    profilePic: string | null;
    status: string;
    destination: string | null;
  } | null>(null);
  const jeepSheetAnim = useRef(new Animated.Value(300)).current;

  // ── Departure banner ─────────────────────────────────────────────────────
  const [departureBanner, setDepartureBanner] = useState<{
    visible: boolean;
    message: string;
    terminal: string;
  }>({ visible: false, message: '', terminal: '' });
  const bannerAnim = useRef(new Animated.Value(-100)).current;
  const departedJeepsRef = useRef<Set<string>>(new Set());

  // ── CHANGE 2: Draggable fare calculator bubble ───────────────────────────
  const [fareCalcVisible, setFareCalcVisible] = useState(false);
  const [fareDistance, setFareDistance] = useState('');
  const [fareResult, setFareResult] = useState<number | null>(null);
  const bubblePosition = useRef(new Animated.ValueXY({ x: 16, y: 200 })).current;
  const bubblePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        bubblePosition.setOffset({
          x: (bubblePosition.x as any)._value,
          y: (bubblePosition.y as any)._value,
        });
        bubblePosition.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: bubblePosition.x, dy: bubblePosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        bubblePosition.flattenOffset();
      },
    })
  ).current;

  // ── Notification permission ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') console.log('Notification permission not granted');
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
      trigger: null,
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
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
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
      webViewRef.current.postMessage(JSON.stringify(message));
    }
  };

  const startTrip = async (destination: 'Town' | 'Balacbac') => {
    if (auth.currentUser) {
      const snap = await get(ref(db, `jeep_info/${auth.currentUser.uid}`));
      const jeepData = snap.exists() ? snap.val() : {};
      if (!jeepData.driverName || !jeepData.plate) {
        setDriverName(jeepData.driverName || '');
        setPlateNumber(jeepData.plate || '');
        setPendingDestination(destination);
        setRouteModalVisible(false);
        setProfileModalVisible(true);
        return;
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
    if (!driverName.trim()) { Alert.alert('Required', 'Please enter your name.'); return; }
    if (!plateNumber.trim()) { Alert.alert('Required', 'Please enter your plate number.'); return; }
    if (auth.currentUser) {
      await update(ref(db, `jeep_info/${auth.currentUser.uid}`), {
        driverName: driverName.trim(),
        plate: plateNumber.trim().toUpperCase(),
        route: 'Balacbac – Town',
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
          if (isTracking) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (auth.currentUser) await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
        }
      }
    ]);
  };

  // CHANGE 4: toggleStatus now also sends the full status to WebView so markers update
  const toggleStatus = (newStatus: boolean) => {
    setIsFull(newStatus);
    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), {
        status: newStatus ? 'full' : 'available'
      });
    }
    // Notify WebView immediately so the driver's own marker updates
    postMessageToWebView({ type: "SET_DRIVER_STATUS", isFull: newStatus });
  };

  const roleRef = useRef(role);
  const currentDestRef = useRef(currentDest);
  const webViewLoadedRef = useRef(webViewLoaded);
  const isFullRef = useRef(isFull);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { currentDestRef.current = currentDest; }, [currentDest]);
  useEffect(() => { webViewLoadedRef.current = webViewLoaded; }, [webViewLoaded]);
  useEffect(() => { isFullRef.current = isFull; }, [isFull]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { console.log('Location permission denied'); return; }

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (pos) => {
          const { latitude, longitude } = pos.coords;
          currentLocationRef.current = { lat: latitude, lng: longitude };

          const liveRole = roleRef.current;
          const liveDest = currentDestRef.current;
          const liveLoaded = webViewLoadedRef.current;
          const liveIsFull = isFullRef.current;

          if (liveLoaded && webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({
              type: "SET_LOCATION",
              lat: latitude,
              lng: longitude,
              isDriver: liveRole === 'driver',
              hasActiveRoute: liveDest !== null,
              isFull: liveIsFull, // CHANGE 4: pass full status
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
      if (locationSub.current) { locationSub.current.remove(); locationSub.current = null; }
    };
  }, []);

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

  // CHANGE 3: Also listen to users/passengers and send to WebView
  useEffect(() => {
    if (!webViewLoaded) return;
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      // We only send users who are passengers (not drivers/admins) — but we
      // don't have their live location in the database by default.
      // We'll send the current user's own location as a passenger marker.
      // This ref is kept for future expansion when passenger locations are stored.
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

        /* CHANGE 3: Commuter/passenger dot — purple pulsing */
        .commuter-dot {
          width: 16px; height: 16px;
          background: #8b5cf6;
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 2px 8px rgba(139,92,246,0.5), 0 0 0 6px rgba(139,92,246,0.15);
          animation: commuterPulse 2s infinite;
        }
        @keyframes commuterPulse {
          0%,100% { box-shadow: 0 2px 8px rgba(139,92,246,0.5), 0 0 0 6px rgba(139,92,246,0.15); }
          50%      { box-shadow: 0 2px 8px rgba(139,92,246,0.7), 0 0 0 10px rgba(139,92,246,0.25); }
        }

        /* Passenger/guest own location dot — blue */
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

        /* CHANGE 1: Driver marker — GREEN CIRCLE with jeepney SVG */
        .driver-marker-wrap {
          display: flex; align-items: center; justify-content: center;
          width: 46px; height: 46px;
          background: radial-gradient(circle at 40% 35%, #22c55e, #15803d);
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 4px 14px rgba(21,128,61,0.55), 0 0 0 5px rgba(21,128,61,0.18);
          animation: driverPulse 2.5s infinite;
        }
        /* CHANGE 4: Full driver — RED circle */
        .driver-marker-wrap.driver-full {
          background: radial-gradient(circle at 40% 35%, #f87171, #dc2626) !important;
          box-shadow: 0 4px 14px rgba(220,38,38,0.55), 0 0 0 5px rgba(220,38,38,0.18) !important;
        }
        @keyframes driverPulse {
          0%,100% { box-shadow: 0 4px 14px rgba(21,128,61,0.55), 0 0 0 5px rgba(21,128,61,0.18); }
          50%      { box-shadow: 0 4px 14px rgba(21,128,61,0.75), 0 0 0 9px rgba(21,128,61,0.28); }
        }
        @keyframes fullPulse {
          0%,100% { box-shadow: 0 4px 14px rgba(220,38,38,0.55), 0 0 0 5px rgba(220,38,38,0.18); }
          50%      { box-shadow: 0 4px 14px rgba(220,38,38,0.75), 0 0 0 9px rgba(220,38,38,0.28); }
        }

        /* CHANGE 1: Jeep markers (other jeeps seen by passengers) — GREEN circle with jeepney */
        .jeep-marker {
          display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px;
          background: radial-gradient(circle at 40% 35%, #22c55e, #15803d);
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 4px 12px rgba(21,128,61,0.45);
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .jeep-marker:hover { transform: scale(1.12); }
        /* CHANGE 4: Full jeep — RED circle */
        .jeep-marker.jeep-full {
          background: radial-gradient(circle at 40% 35%, #f87171, #dc2626) !important;
          box-shadow: 0 4px 12px rgba(220,38,38,0.5) !important;
          animation: fullBounce 1s ease infinite;
        }
        @keyframes fullBounce {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }

        /* Tooltip on jeep hover */
        .jeep-tooltip {
          background: white; border-radius: 8px; padding: 6px 10px;
          font-size: 12px; font-weight: 700; color: #111;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          white-space: nowrap;
        }

        /* CHANGE 5: Commuter count badge */
        .commuter-badge {
          position: absolute; top: -6px; right: -6px;
          background: #8b5cf6; color: white;
          border-radius: 50%; width: 18px; height: 18px;
          font-size: 10px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          border: 2px solid white;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: false,
          attributionControl: false,
          preferCanvas: true
        }).setView([16.4023, 120.5960], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(map);

        // Add zoom control in bottom-right
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        var userMarker = null;
        var jeepMarkers = {};
        var commuterMarkers = {}; // CHANGE 3
        var routeSegments = [];
        var passengerViewRoutes = [];
        var isDriverMode = false;
        var hasActiveRoute = false;
        var jeepsData = {};
        var currentDriverFull = false; // CHANGE 4

        var ROUTE_POINTS = {
          TOWN:       [16.414019, 120.593455],
          SHELL:      [16.393590, 120.579564],
          JUNCTION:   [16.388988, 120.575658],
          INTERIOR_A: [16.386876, 120.576439],
          CENTRO:     [16.380109, 120.579936],
          FRIENDSHIP: [16.378661, 120.580563],
          TIERRA:     [16.378759, 120.586049],
        };

        var ROUTE_WAYPOINTS_FWD = [
          ROUTE_POINTS.TOWN, ROUTE_POINTS.SHELL, ROUTE_POINTS.JUNCTION,
          ROUTE_POINTS.INTERIOR_A, ROUTE_POINTS.CENTRO, ROUTE_POINTS.FRIENDSHIP, ROUTE_POINTS.TIERRA,
        ];

        setTimeout(function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
          }
        }, 500);

        // ── CHANGE 1: Jeepney SVG icon (realistic jeepney top-view) ─────────────
        function makeJeepneySVG(isFull) {
          var bodyColor = isFull ? '#fff' : '#fff';
          return '<svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">'
            // Body
            + '<rect x="9" y="4" width="14" height="24" rx="3" fill="' + bodyColor + '" opacity="0.95"/>'
            // Front hood
            + '<rect x="11" y="2" width="10" height="5" rx="2" fill="' + bodyColor + '" opacity="0.8"/>'
            // Windshield
            + '<rect x="12" y="3" width="8" height="3" rx="1" fill="#bae6fd" opacity="0.9"/>'
            // Side windows
            + '<rect x="9.5" y="9" width="3" height="4" rx="1" fill="#bae6fd" opacity="0.8"/>'
            + '<rect x="9.5" y="15" width="3" height="4" rx="1" fill="#bae6fd" opacity="0.8"/>'
            + '<rect x="19.5" y="9" width="3" height="4" rx="1" fill="#bae6fd" opacity="0.8"/>'
            + '<rect x="19.5" y="15" width="3" height="4" rx="1" fill="#bae6fd" opacity="0.8"/>'
            // Wheels
            + '<rect x="6" y="7" width="4" height="6" rx="2" fill="' + bodyColor + '" opacity="0.7"/>'
            + '<rect x="22" y="7" width="4" height="6" rx="2" fill="' + bodyColor + '" opacity="0.7"/>'
            + '<rect x="6" y="18" width="4" height="6" rx="2" fill="' + bodyColor + '" opacity="0.7"/>'
            + '<rect x="22" y="18" width="4" height="6" rx="2" fill="' + bodyColor + '" opacity="0.7"/>'
            // Rear lights
            + '<rect x="10" y="26" width="4" height="2" rx="1" fill="#fca5a5" opacity="0.9"/>'
            + '<rect x="18" y="26" width="4" height="2" rx="1" fill="#fca5a5" opacity="0.9"/>'
            + '</svg>';
        }

        function makeDriverMarkerHtml(isFull) {
          return '<div class="driver-marker-wrap' + (isFull ? ' driver-full' : '') + '">'
            + makeJeepneySVG(isFull)
            + '</div>';
        }

        function makeJeepMarkerHtml(isFull) {
          return '<div class="jeep-marker' + (isFull ? ' jeep-full' : '') + '">'
            + makeJeepneySVG(isFull)
            + '</div>';
        }

        // ── Polyline helpers ─────────────────────────────────────────────────────
        function hexToRgb(hex) {
          var r = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
          return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : { r:0,g:0,b:0 };
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

        function fetchFullRoute(waypoints) {
          var coordStr = waypoints.map(function(p) { return p[1] + ',' + p[0]; }).join(';');
          var url = 'https://router.project-osrm.org/route/v1/driving/' + coordStr
                  + '?overview=full&geometries=geojson&annotations=false';
          return fetch(url)
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (!data.routes || !data.routes[0]) return null;
              return data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
            })
            .catch(function(e) { console.log('OSRM error:', e); return null; });
        }

        function splitRouteIntoZones(allCoords, boundaryLatLngs) {
          var segments = [];
          var remaining = allCoords.slice();
          for (var b = 0; b < boundaryLatLngs.length; b++) {
            var target = boundaryLatLngs[b];
            var bestIdx = 0, bestDist = Infinity;
            for (var i = 0; i < remaining.length; i++) {
              var d = Math.pow(remaining[i][0]-target[0],2) + Math.pow(remaining[i][1]-target[1],2);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            segments.push(remaining.slice(0, bestIdx + 1));
            remaining = remaining.slice(bestIdx);
          }
          segments.push(remaining);
          return segments;
        }

        function buildAndDrawRoute(originLat, originLng, destination, zoneColors, layerArray) {
          var orderedWaypoints = destination === 'Balacbac'
            ? ROUTE_WAYPOINTS_FWD.slice()
            : ROUTE_WAYPOINTS_FWD.slice().reverse();
          var allWaypoints = [[originLat, originLng]].concat(orderedWaypoints);
          var boundaries = allWaypoints.slice(1, allWaypoints.length - 1);

          return fetchFullRoute(allWaypoints).then(function(allCoords) {
            if (!allCoords) return;
            var rawSegments = splitRouteIntoZones(allCoords, boundaries);
            rawSegments.forEach(function(seg, idx) {
              var colorIdx = Math.min(idx, zoneColors.length - 1);
              drawNavRoute(seg, zoneColors[colorIdx], layerArray);
            });
            if (layerArray.length > 0) {
              var fills = layerArray.filter(function(_, i) { return i % 3 === 2; });
              if (fills.length > 0) map.fitBounds(L.featureGroup(fills).getBounds(), { padding: [50, 50] });
            }
          });
        }

        function updateNavigatorRoute(lat, lng) {
          var fills = routeSegments.filter(function(_, i) { return i % 3 === 2; });
          if (fills.length === 0 || !hasActiveRoute) return;
          var currentFill = fills[0];
          var points = currentFill.getLatLngs();
          if (!points || points.length === 0) return;
          var lastDist = map.distance([lat, lng], points[points.length - 1]);
          if (lastDist < 40) {
            for (var t = 0; t < 3; t++) {
              if (routeSegments[0]) { map.removeLayer(routeSegments[0]); routeSegments.shift(); }
            }
            return;
          }
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

          buildAndDrawRoute(jeep.latitude, jeep.longitude, destination, zoneColors, passengerViewRoutes)
            .then(function() {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'SHOW_FARE_MODAL', jeepId: jeepId, destination: destination
                }));
              }
            });
        }

        // ── CHANGE 3: Show commuter/passenger markers ────────────────────────────
        function updateCommuterMarkers(commuters) {
          // Remove old markers not in new list
          Object.keys(commuterMarkers).forEach(function(id) {
            if (!commuters[id]) {
              map.removeLayer(commuterMarkers[id]);
              delete commuterMarkers[id];
            }
          });
          // Add/update
          Object.keys(commuters).forEach(function(id) {
            var c = commuters[id];
            if (!c.latitude || !c.longitude) return;
            var icon = L.divIcon({
              className: '',
              html: '<div class="commuter-dot"></div>',
              iconSize: [16, 16], iconAnchor: [8, 8]
            });
            if (commuterMarkers[id]) {
              commuterMarkers[id].setLatLng([c.latitude, c.longitude]);
            } else {
              commuterMarkers[id] = L.marker([c.latitude, c.longitude], { icon: icon })
                .bindTooltip('<div class="jeep-tooltip">🧍 Commuter</div>', { permanent: false, direction: 'top' })
                .addTo(map);
            }
          });
        }

        function handleMessage(event) {
          try {
            var m = JSON.parse(event.data);

            if (m.type === "SET_LOCATION") {
              var prevDriverMode = isDriverMode;
              isDriverMode = m.isDriver;
              hasActiveRoute = m.hasActiveRoute || false;
              var isFull = m.isFull || false;

              if (!userMarker) {
                var icon;
                if (isDriverMode) {
                  icon = L.divIcon({ className: '', html: makeDriverMarkerHtml(isFull), iconSize: [46,46], iconAnchor: [23,23] });
                } else {
                  icon = L.divIcon({ className: '', html: '<div class="passenger-dot"></div>', iconSize: [18,18], iconAnchor: [9,9] });
                }
                userMarker = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
                map.panTo([m.lat, m.lng]);
              } else {
                if (prevDriverMode !== isDriverMode || currentDriverFull !== isFull) {
                  currentDriverFull = isFull;
                  var newIcon;
                  if (isDriverMode) {
                    newIcon = L.divIcon({ className: '', html: makeDriverMarkerHtml(isFull), iconSize: [46,46], iconAnchor: [23,23] });
                  } else {
                    newIcon = L.divIcon({ className: '', html: '<div class="passenger-dot"></div>', iconSize: [18,18], iconAnchor: [9,9] });
                  }
                  userMarker.setIcon(newIcon);
                }
                userMarker.setLatLng([m.lat, m.lng]);
                if (isDriverMode && hasActiveRoute) map.panTo([m.lat, m.lng], { animate: true, duration: 0.5 });
              }
              if (isDriverMode && hasActiveRoute) updateNavigatorRoute(m.lat, m.lng);
            }

            // CHANGE 4: Handle explicit driver status update
            if (m.type === "SET_DRIVER_STATUS") {
              currentDriverFull = m.isFull;
              if (userMarker && isDriverMode) {
                userMarker.setIcon(L.divIcon({
                  className: '',
                  html: makeDriverMarkerHtml(m.isFull),
                  iconSize: [46,46], iconAnchor: [23,23]
                }));
              }
            }

            if (m.type === "DRAW_ZONES") {
              routeSegments.forEach(function(s) { map.removeLayer(s); });
              routeSegments = [];
              var originLat = m.driverLat, originLng = m.driverLng;
              if (originLat === null || originLat === undefined) {
                var fallback = m.destination === 'Balacbac'
                  ? ROUTE_WAYPOINTS_FWD[0]
                  : ROUTE_WAYPOINTS_FWD[ROUTE_WAYPOINTS_FWD.length - 1];
                originLat = fallback[0]; originLng = fallback[1];
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
                if (!newJeepsData[id]) { map.removeLayer(jeepMarkers[id]); delete jeepMarkers[id]; }
              });
              jeepsData = newJeepsData;

              m.jeeps.forEach(function(j) {
                var isFull = (j.status === 'full');
                var markerHtml = makeJeepMarkerHtml(isFull);
                var icon = L.divIcon({ className: '', html: markerHtml, iconSize: [44,44], iconAnchor: [22,22] });
                if (jeepMarkers[j.id]) {
                  jeepMarkers[j.id].setLatLng([j.latitude, j.longitude]);
                  jeepMarkers[j.id].setIcon(icon); // CHANGE 4: always refresh icon
                } else {
                  var marker = L.marker([j.latitude, j.longitude], { icon: icon }).addTo(map);
                  marker.jeepId = j.id;
                  // CHANGE 5: Tooltip with destination
                  var tooltipText = j.destination
                    ? ('🚌 To ' + j.destination + (isFull ? ' — FULL' : ' — Available'))
                    : '🚌 Jeepney';
                  marker.bindTooltip('<div class="jeep-tooltip">' + tooltipText + '</div>', { permanent: false, direction: 'top', offset: [0, -24] });
                  marker.on('click', function() {
                    var jd = jeepsData[this.jeepId];
                    showJeepRoute(this.jeepId);
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
                // Update tooltip content dynamically (CHANGE 5)
                if (jeepMarkers[j.id]) {
                  var newTooltip = j.destination
                    ? ('🚌 To ' + j.destination + (isFull ? ' — FULL' : ' — Available'))
                    : '🚌 Jeepney';
                  jeepMarkers[j.id].unbindTooltip();
                  jeepMarkers[j.id].bindTooltip('<div class="jeep-tooltip">' + newTooltip + '</div>', { permanent: false, direction: 'top', offset: [0, -24] });
                }
              });
            }

            // CHANGE 3: Commuter locations from React Native
            if (m.type === "SET_COMMUTERS") {
              updateCommuterMarkers(m.commuters || {});
            }

          } catch(e) {
            console.error('Message error:', e);
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
        onLoad={() => setWebViewLoaded(true)}
        onError={(syntheticEvent) => console.error('WebView error:', syntheticEvent.nativeEvent)}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'MAP_READY') setWebViewLoaded(true);
            if (message.type === 'SHOW_FARE_MODAL') setFareModalVisible(true);
            if (message.type === 'JEEP_TAPPED') {
              const { jeepId, destination, status } = message;
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
        onHttpError={(syntheticEvent) => console.error('HTTP Error:', syntheticEvent.nativeEvent.statusCode)}
        {...(Platform.OS === 'android' && {
          androidHardwareAccelerationDisabled: false,
          androidLayerType: 'hardware',
        })}
      />

      {/* CHANGE 2: Draggable fare calculator bubble */}
      <Animated.View
        style={[styles.fareBubble, { transform: bubblePosition.getTranslateTransform() }]}
        {...bubblePanResponder.panHandlers}
      >
        <TouchableOpacity onPress={() => setFareCalcVisible(!fareCalcVisible)} style={styles.fareBubbleBtn} activeOpacity={0.85}>
          <Calculator color="white" size={20} />
        </TouchableOpacity>
        {fareCalcVisible && (
          <View style={styles.fareBubbleCard}>
            <Text style={styles.fareBubbleTitle}>💰 Fare Calc</Text>
            <Text style={styles.fareBubbleLabel}>Distance (km)</Text>
            <TextInput
              style={styles.fareBubbleInput}
              placeholder="e.g. 3.5"
              value={fareDistance}
              onChangeText={setFareDistance}
              keyboardType="decimal-pad"
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity
              style={styles.fareBubbleCalcBtn}
              onPress={() => {
                const dist = parseFloat(fareDistance);
                if (isNaN(dist) || dist <= 0) {
                  Alert.alert('Invalid', 'Please enter a valid distance.');
                  return;
                }
                setFareResult(computeFare(dist));
              }}
            >
              <Text style={styles.fareBubbleCalcText}>Calculate</Text>
            </TouchableOpacity>
            {fareResult !== null && (
              <View style={styles.fareBubbleResult}>
                <Text style={styles.fareBubbleResultLabel}>Estimated Fare</Text>
                <Text style={styles.fareBubbleResultAmount}>₱{fareResult}</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => { setFareCalcVisible(false); setFareResult(null); setFareDistance(''); }}>
              <Text style={styles.fareBubbleClose}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

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

      {/* Departure banner */}
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

      {/* Jeep info bottom sheet */}
      {jeepInfoVisible && (
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeJeepInfoSheet} />
          <Animated.View style={[styles.jeepInfoSheet, { transform: [{ translateY: jeepSheetAnim }] }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetDriverHeader}>
              {selectedJeepInfo?.profilePic ? (
                <Image source={{ uri: selectedJeepInfo.profilePic }} style={styles.sheetDriverAvatar} />
              ) : (
                <View style={styles.sheetDriverAvatarFallback}>
                  <User color="#6B7280" size={28} />
                </View>
              )}
              <View style={{ marginLeft: 14 }}>
                <Text style={styles.sheetTitle}>{selectedJeepInfo?.driverName ?? 'Jeep Info'}</Text>
                <Text style={styles.sheetDriverPlate}>{selectedJeepInfo?.plateNumber ?? ''}</Text>
              </View>
              {/* CHANGE 4: Full badge on sheet */}
              {selectedJeepInfo?.status === 'full' && (
                <View style={styles.fullBadge}>
                  <Text style={styles.fullBadgeText}>FULL</Text>
                </View>
              )}
            </View>

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

      {/* Driver profile modal */}
      <Modal visible={profileModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Set Up Your Profile</Text>
            <Text style={styles.profileSubtitle}>Passengers will see this info when they tap your jeep.</Text>
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

      {/* Destination modal */}
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

  // CHANGE 2: Draggable fare bubble
  fareBubble: {
    position: 'absolute',
    zIndex: 200,
    alignItems: 'flex-start',
  },
  fareBubbleBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#15803d',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 8,
  },
  fareBubbleCard: {
    marginTop: 8,
    backgroundColor: 'white', borderRadius: 16, padding: 14,
    width: 180,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
  },
  fareBubbleTitle: { fontSize: 13, fontWeight: '800', color: '#111827', marginBottom: 8 },
  fareBubbleLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600', marginBottom: 4 },
  fareBubbleInput: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 14, color: '#111827', marginBottom: 8,
  },
  fareBubbleCalcBtn: {
    backgroundColor: '#15803d', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center', marginBottom: 8,
  },
  fareBubbleCalcText: { color: 'white', fontWeight: '700', fontSize: 13 },
  fareBubbleResult: {
    backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10,
    alignItems: 'center', marginBottom: 8,
  },
  fareBubbleResultLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
  fareBubbleResultAmount: { fontSize: 22, fontWeight: '900', color: '#15803d' },
  fareBubbleClose: { textAlign: 'center', color: '#9ca3af', fontSize: 12, fontWeight: '600' },

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
  departureBanner: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: '#15803d',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 52 : 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 10, zIndex: 999,
  },
  departureBannerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  departureBannerTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  departureBannerMsg: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
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
  sheetDriverHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  sheetDriverAvatar: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#E5E7EB',
  },
  sheetDriverAvatarFallback: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E5E7EB',
  },
  sheetDriverPlate: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  // CHANGE 4: Full badge
  fullBadge: {
    marginLeft: 'auto', backgroundColor: '#FEE2E2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  fullBadgeText: { color: '#DC2626', fontWeight: '800', fontSize: 12 },
  sheetCloseBtn: {
    marginTop: 20, backgroundColor: '#F3F4F6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  sheetCloseBtnText: { color: '#374151', fontWeight: '700', fontSize: 15 },
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
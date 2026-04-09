import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Modal, Alert, Animated, Platform, TextInput, KeyboardAvoidingView, Image, ScrollView } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { Navigation as NavIcon, MapPin, Circle, XCircle, User, Truck, ChevronRight, X, Calculator, Hand } from "lucide-react-native";
import { ref, onValue, update, get, remove, push } from "firebase/database"; // ← added push
import { auth, db } from "../../services/firebase";
import { FARE_ZONES } from "../../constants/routes";
import PassengerCountModal from "../../components/PassengerCountModal";
import { recordTripRevenue } from "../../hooks/useRevenue";

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

const FARE_STOPS = ['Town', 'Shell', 'Junction', 'Centro', 'Friendship', 'Balacbac'];
const STOP_ORDER: Record<string, number> = {
  'Town': 0, 'Shell': 1, 'Junction': 2, 'Centro': 3, 'Friendship': 4, 'Balacbac': 5,
};

function getZoneFare(from: string, to: string): number {
  const diff = Math.abs((STOP_ORDER[from] ?? 0) - (STOP_ORDER[to] ?? 0));
  if (diff === 0) return 0;
  if (diff === 1) return 13;
  if (diff === 2) return 15;
  if (diff === 3) return 17;
  return 20;
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) { console.error('Background task error:', error); return; }
  if (data) {
    const { locations } = data;
    const { latitude, longitude } = locations[0].coords;
    if (auth.currentUser) {
      try {
        await update(ref(db, `jeeps/${auth.currentUser.uid}`), { latitude, longitude });
      } catch (err) { console.log('Background Firebase update error:', err); }
    }
  }
});

interface ExtendedZone {
  originalIndex: number; id: string; label: string; color: string; pts: number[][];
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
  const currentTripIdRef = useRef<string | null>(null);

  // ── Driver profile ───────────────────────────────────────────────────────
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [pendingDestination, setPendingDestination] = useState<'Town' | 'Balacbac' | null>(null);

  // ── Jeep info bottom sheet ───────────────────────────────────────────────
  const [jeepInfoVisible, setJeepInfoVisible] = useState(false);
  const [selectedJeepInfo, setSelectedJeepInfo] = useState<{
    driverName: string; plateNumber: string; profilePic: string | null;
    status: string; destination: string | null;
  } | null>(null);
  const jeepSheetAnim = useRef(new Animated.Value(300)).current;

  // ── Departure banner ─────────────────────────────────────────────────────
  const [departureBanner, setDepartureBanner] = useState<{
    visible: boolean; message: string; terminal: string;
  }>({ visible: false, message: '', terminal: '' });
  const bannerAnim = useRef(new Animated.Value(-100)).current;
  const departedJeepsRef = useRef<Set<string>>(new Set());

  // ── Fare calculator (place-based, non-drivers only) ────────────────
  const [fareCalcVisible, setFareCalcVisible] = useState(false);
  const [fareFrom, setFareFrom] = useState('');
  const [fareTo, setFareTo] = useState('');

  // ── Passenger/Guest ride request ─────────────────────────────────────────
  const [rideRequestModalVisible, setRideRequestModalVisible] = useState(false);
  const [activeRideRequest, setActiveRideRequest] = useState<{
    destination: string; lat: number; lng: number;
  } | null>(null);
  const notifiedRequestsRef = useRef<Set<string>>(new Set());
  const guestRideIdRef = useRef<string | null>(null);

  // ── History tracking ─────────────────────────────────────────────────────
  const currentHistoryKeyRef = useRef<string | null>(null);

  // ── Notification permission ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') console.log('Notification permission not granted');
    })();
  }, []);

// ──────────────────────────────────────────────
const [passengerModalVisible, setPassengerModalVisible] = useState(false);
 

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
      } else { setRole('guest'); }
      setLoading(false);
    };
    fetchRole();
  }, []);

  const postMessageToWebView = (message: any) => {
    if (webViewRef.current && webViewLoaded) {
      webViewRef.current.postMessage(JSON.stringify(message));
    }
  };

  const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
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
      content: { title, body, sound: true }, trigger: null,
    });
  };

  const openJeepInfoSheet = (info: typeof selectedJeepInfo) => {
    setSelectedJeepInfo(info);
    setJeepInfoVisible(true);
    Animated.spring(jeepSheetAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
  };

  const closeJeepInfoSheet = () => {
    Animated.timing(jeepSheetAnim, { toValue: 400, duration: 280, useNativeDriver: true })
      .start(() => setJeepInfoVisible(false));
  };

  const submitRideRequest = async (destination: 'Town' | 'Balacbac') => {
    if (!currentLocationRef.current) {
      Alert.alert('Location unavailable', 'Please wait for your location to load.');
      return;
    }
    const { lat, lng } = currentLocationRef.current;
    let requestId: string;
    if (auth.currentUser) {
      requestId = auth.currentUser.uid;
    } else {
      if (!guestRideIdRef.current) {
        guestRideIdRef.current = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }
      requestId = guestRideIdRef.current;
    }
    await update(ref(db, `ride_requests/${requestId}`), {
      lat, lng, destination, timestamp: Date.now(), status: 'waiting',
    });
    setActiveRideRequest({ destination, lat, lng });
    postMessageToWebView({ type: 'SET_RIDE_REQUESTS', requests: { [requestId]: { lat, lng, destination } } });
    setRideRequestModalVisible(false);
    Alert.alert('Request Sent! 🙋', `Drivers heading to ${destination} can see your location.`);
  };

  const cancelRideRequest = async () => {
    const requestId = auth.currentUser ? auth.currentUser.uid : guestRideIdRef.current;
    if (requestId) {
      await remove(ref(db, `ride_requests/${requestId}`));
      if (!auth.currentUser) guestRideIdRef.current = null;
    }
    setActiveRideRequest(null);
    postMessageToWebView({ type: 'SET_RIDE_REQUESTS', requests: {} });
  };

const endTripSilent = async () => {
  setCurrentDest(null);
  postMessageToWebView({ type: "CLEAR_ZONES" });
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (isTracking) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (auth.currentUser) {
    await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
    // Log trip end
    if (currentTripIdRef.current) {
      update(
        ref(db, `driver_trips/${auth.currentUser.uid}/${currentTripIdRef.current}`),
        { endTime: Date.now() }
      ).catch(() => {});
      currentTripIdRef.current = null;
    }
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
          accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5,
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
      type: "DRAW_ZONES", destination,
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
        const msg = `A jeep has departed from ${terminalLabel} heading to ${destination}`;
        sendPushNotification('\uD83D\uDE8C Jeep Departed!', msg);
        showDepartureBanner(msg, terminalLabel);
      }
    }
if (auth.currentUser) {
  update(ref(db, `jeeps/${auth.currentUser.uid}`), {
    destination, status: isFull ? 'full' : 'available',
  });
  // Log trip start
  const tripRef = push(ref(db, `driver_trips/${auth.currentUser.uid}`));
  currentTripIdRef.current = tripRef.key;
  update(tripRef, {
    destination,
    startTime: Date.now(),
    date: new Date().toISOString().split('T')[0],
    endTime: null,
  }).catch(() => {});

  // ── Save history entry on trip start ─────────────────────────────────
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const historyRef = push(ref(db, `history/${auth.currentUser.uid}/${dateKey}`));
  currentHistoryKeyRef.current = historyRef.key;
  await update(historyRef, {
    route: `To ${destination}`,
    startTime: timeStr,
    endTime: timeStr,
    distance: 0,
    timestamp: Date.now(),
  });
}
  };

  const saveProfileAndStart = async () => {
    if (!driverName.trim()) { Alert.alert('Required', 'Please enter your name.'); return; }
    if (!plateNumber.trim()) { Alert.alert('Required', 'Please enter your plate number.'); return; }
    if (auth.currentUser) {
      await update(ref(db, `jeep_info/${auth.currentUser.uid}`), {
        driverName: driverName.trim(), plate: plateNumber.trim().toUpperCase(),
        route: 'Balacbac To Town', updatedAt: Date.now(),
      });
    }
    setProfileModalVisible(false);
    if (pendingDestination) { await _executeStartTrip(pendingDestination); setPendingDestination(null); }
  };

  const endTrip = () => {
    setPassengerModalVisible(true);
    Alert.alert("End Trip", "Are you sure you want to end the current trip?", [
      { text: "Cancel", style: "cancel" },
      { text: "End Trip", style: "destructive", onPress: async () => {
        setCurrentDest(null);
        postMessageToWebView({ type: "CLEAR_ZONES" });
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (isTracking) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (auth.currentUser) {
          await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
          if (currentHistoryKeyRef.current) {
            const now = new Date();
            const dateKey = now.toISOString().split('T')[0];
            const endTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            await update(
              ref(db, `history/${auth.currentUser.uid}/${dateKey}/${currentHistoryKeyRef.current}`),
              { endTime: endTimeStr }
            );
            currentHistoryKeyRef.current = null;
          }
        }
      }}
    ]);
  };

  const toggleStatus = (newStatus: boolean) => {
    setIsFull(newStatus);
    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), { status: newStatus ? 'full' : 'available' });
    }
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
              type: "SET_LOCATION", lat: latitude, lng: longitude,
              isDriver: liveRole === 'driver', hasActiveRoute: liveDest !== null, isFull: liveIsFull,
            }));
          }
          if (liveRole === 'driver' && auth.currentUser) {
            update(ref(db, `jeeps/${auth.currentUser.uid}`), { latitude, longitude })
              .catch(err => console.log('Firebase update error:', err));
          }
        }
      );
    })();
    return () => { if (locationSub.current) { locationSub.current.remove(); locationSub.current = null; } };
  }, []);

  useEffect(() => {
    if (!webViewLoaded) return;
    const jeepsRef = ref(db, 'jeeps');
    const unsubscribe = onValue(jeepsRef, (snapshot) => {
      const jeepsArray = snapshot.exists()
        ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] })) : [];
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
              sendPushNotification('\uD83D\uDE8C Jeep Departed!', msg);
              showDepartureBanner(msg, terminalLabel);
            }
            departedJeepsRef.current.add(jeep.id);
          }
        });
        const activeIds = new Set(jeepsArray.map((j: any) => j.id));
        departedJeepsRef.current.forEach(id => { if (!activeIds.has(id)) departedJeepsRef.current.delete(id); });
      }
    }, (error) => console.log('Firebase listener error:', error));
    return () => unsubscribe();
  }, [webViewLoaded]);

  useEffect(() => {
    if (!webViewLoaded || role !== 'driver') return;
    const requestsRef = ref(db, 'ride_requests');
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      if (!snapshot.exists()) {
        postMessageToWebView({ type: 'SET_RIDE_REQUESTS', requests: {} });
        return;
      }
      const requests = snapshot.val();
      const currentDestination = currentDestRef.current;
      postMessageToWebView({ type: 'SET_RIDE_REQUESTS', requests });
      Object.keys(requests).forEach(uid => {
        const r = requests[uid];
        if (r.status === 'waiting' && r.destination === currentDestination && !notifiedRequestsRef.current.has(uid)) {
          notifiedRequestsRef.current.add(uid);
          sendPushNotification('\uD83D\uDE4B Ride Request!', `Passenger needs a ride to ${r.destination}`);
          showDepartureBanner(`Passenger needs a ride to ${r.destination}`, 'Nearby');
        }
      });
      const activeIds = new Set(Object.keys(requests));
      notifiedRequestsRef.current.forEach(id => { if (!activeIds.has(id)) notifiedRequestsRef.current.delete(id); });
    }, (error) => console.log('Ride requests listener error:', error));
    return () => unsubscribe();
  }, [webViewLoaded, role]);

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

        .passenger-dot {
          width: 18px; height: 18px; background: #3b82f6;
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 2px 8px rgba(59,130,246,0.5), 0 0 0 6px rgba(59,130,246,0.15);
          animation: passengerPulse 2s infinite;
        }
        @keyframes passengerPulse {
          0%,100% { box-shadow: 0 2px 8px rgba(59,130,246,0.5), 0 0 0 6px rgba(59,130,246,0.15); }
          50%      { box-shadow: 0 2px 8px rgba(59,130,246,0.7), 0 0 0 10px rgba(59,130,246,0.25); }
        }

        .driver-marker-wrap {
          display: flex; align-items: center; justify-content: center;
          width: 48px; height: 48px;
          background: radial-gradient(circle at 40% 35%, #22c55e, #15803d);
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 4px 14px rgba(21,128,61,0.55), 0 0 0 5px rgba(21,128,61,0.18);
          animation: driverPulse 2.5s infinite;
        }
        .driver-marker-wrap.driver-full {
          background: radial-gradient(circle at 40% 35%, #f87171, #dc2626) !important;
          box-shadow: 0 4px 14px rgba(220,38,38,0.55), 0 0 0 5px rgba(220,38,38,0.18) !important;
          animation: fullPulse 1.5s infinite !important;
        }
        @keyframes driverPulse {
          0%,100% { box-shadow: 0 4px 14px rgba(21,128,61,0.55), 0 0 0 5px rgba(21,128,61,0.18); }
          50%      { box-shadow: 0 4px 14px rgba(21,128,61,0.75), 0 0 0 9px rgba(21,128,61,0.28); }
        }
        @keyframes fullPulse {
          0%,100% { box-shadow: 0 4px 14px rgba(220,38,38,0.55), 0 0 0 5px rgba(220,38,38,0.18); }
          50%      { box-shadow: 0 4px 14px rgba(220,38,38,0.75), 0 0 0 9px rgba(220,38,38,0.28); }
        }

        .jeep-marker {
          display: flex; align-items: center; justify-content: center;
          width: 48px; height: 48px;
          background: radial-gradient(circle at 40% 35%, #22c55e, #15803d);
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 4px 12px rgba(21,128,61,0.45);
          cursor: pointer; transition: transform 0.2s ease;
        }
        .jeep-marker:hover { transform: scale(1.12); }
        .jeep-marker.jeep-full {
          background: radial-gradient(circle at 40% 35%, #f87171, #dc2626) !important;
          box-shadow: 0 4px 12px rgba(220,38,38,0.5) !important;
          animation: fullBounce 1.2s ease infinite;
        }
        @keyframes fullBounce {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.1); }
        }

        .ride-request-marker {
          width: 40px; height: 40px;
          background: linear-gradient(135deg, #15803d, #15803d);
          border: 3px solid white; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; line-height: 1;
          box-shadow: 0 4px 12px rgba(48, 175, 36, 0.5);
          animation: ridePulse 1.4s ease infinite;
          cursor: pointer;
        }
        @keyframes ridePulse {
          0%,100% { transform: scale(1); box-shadow: 0 4px 12px rgba(9, 96, 21, 0.5); }
          50%      { transform: scale(1.12); box-shadow: 0 6px 20px rgba(22, 107, 18, 0.75); }
        }

        .jeep-tooltip {
          background: white; border-radius: 8px; padding: 6px 10px;
          font-size: 12px; font-weight: 700; color: #111;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15); white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: false, attributionControl: false, preferCanvas: true
        }).setView([16.4023, 120.5960], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        var userMarker = null;
        var jeepMarkers = {};
        var rideRequestMarkers = {};
        var routeSegments = [];
        var passengerViewRoutes = [];
        var isDriverMode = false;
        var hasActiveRoute = false;
        var jeepsData = {};
        var currentDriverFull = false;

        var ROUTE_WAYPOINTS_FWD = [
          [16.414019, 120.593455],
          [16.393590, 120.579564],
          [16.388988, 120.575658],
          [16.386876, 120.576439],
          [16.380109, 120.579936],
          [16.378661, 120.580563],
          [16.378759, 120.586049],
        ];

        setTimeout(function() {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
  }
}, 500);

// ── Static Balacbac → Town route (Grab-style) ──────────────────
var staticRouteLayers = [];

function drawStaticRoute(coords) {
  staticRouteLayers.forEach(function(l) { map.removeLayer(l); });
  staticRouteLayers = [];
  if (!coords || coords.length === 0) return;

  // Outer white border for visibility
  staticRouteLayers.push(
    L.polyline(coords, {
      color: 'rgba(255,255,255,0.9)',
      weight: 14,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1,
    }).addTo(map)
  );

  // Soft dark shadow layer
  staticRouteLayers.push(
    L.polyline(coords, {
      color: 'rgba(21,128,61,0.25)',
      weight: 12,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1,
    }).addTo(map)
  );

  // Main route line — #15803d (your existing green)
  staticRouteLayers.push(
    L.polyline(coords, {
      color: '#15803d',
      weight: 7,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1,
    }).addTo(map)
  );

  // Directional dash overlay for movement feel
  staticRouteLayers.push(
    L.polyline(coords, {
      color: 'rgba(255,255,255,0.55)',
      weight: 3,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1,
      dashArray: '1, 18',
    }).addTo(map)
  );
}

function fetchAndDrawStaticRoute() {
  var waypoints = ROUTE_WAYPOINTS_FWD;
  var coordStr = waypoints.map(function(p) { return p[1] + ',' + p[0]; }).join(';');
  fetch('https://router.project-osrm.org/route/v1/driving/' + coordStr + '?overview=full&geometries=geojson&annotations=false')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.routes || !data.routes[0]) return;
      var coords = data.routes[0].geometry.coordinates.map(function(c) {
        return [c[1], c[0]];
      });
      drawStaticRoute(coords);
    })
    .catch(function(e) { console.log('Static route fetch error:', e); });
}

fetchAndDrawStaticRoute();

        function makeJeepneySVG() {
          return '<svg width="30" height="28" viewBox="0 0 38 34" fill="none" xmlns="http://www.w3.org/2000/svg">'
            + '<rect x="0" y="4" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
            + '<rect x="32" y="4" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
            + '<rect x="0" y="20" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
            + '<rect x="32" y="20" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
            + '<rect x="5" y="1" width="28" height="32" rx="4" fill="rgba(255,255,255,0.96)"/>'
            + '<rect x="7" y="2" width="24" height="8" rx="2.5" fill="#7dd3fc" opacity="0.88"/>'
            + '<rect x="14" y="0" width="10" height="2.5" rx="1.25" fill="rgba(255,255,255,0.95)"/>'
            + '<rect x="5" y="14" width="28" height="3" fill="rgba(255,255,255,0.38)"/>'
            + '<rect x="6" y="18" width="5" height="13" rx="1.5" fill="rgba(255,255,255,0.3)"/>'
            + '<rect x="27" y="18" width="5" height="13" rx="1.5" fill="rgba(255,255,255,0.3)"/>'
            + '<rect x="13" y="19" width="12" height="11" rx="1" fill="rgba(255,255,255,0.1)"/>'
            + '<rect x="8" y="27" width="22" height="5" rx="2" fill="#7dd3fc" opacity="0.55"/>'
            + '<rect x="6" y="29" width="6" height="3" rx="1.5" fill="#fca5a5" opacity="0.95"/>'
            + '<rect x="26" y="29" width="6" height="3" rx="1.5" fill="#fca5a5" opacity="0.95"/>'
            + '</svg>';
        }

        function makeDriverMarkerHtml(isFull) {
          return '<div class="driver-marker-wrap' + (isFull ? ' driver-full' : '') + '">' + makeJeepneySVG() + '</div>';
        }
        function makeJeepMarkerHtml(isFull) {
          return '<div class="jeep-marker' + (isFull ? ' jeep-full' : '') + '">' + makeJeepneySVG() + '</div>';
        }

        function hexToRgb(hex) {
          var r = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
          return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : {r:0,g:0,b:0};
        }
        function darkenColor(hex, factor) {
          var c = hexToRgb(hex);
          return 'rgb('+Math.round(c.r*factor)+','+Math.round(c.g*factor)+','+Math.round(c.b*factor)+')';
        }
        function drawNavRoute(coords, color, layerArray) {
          if (!coords || coords.length === 0) return;
          var opts = { lineCap: 'round', lineJoin: 'round', smoothFactor: 1 };
          layerArray.push(
            L.polyline(coords, Object.assign({}, opts, { color: 'rgba(255,255,255,0.95)', weight: 16, opacity: 1 })).addTo(map),
            L.polyline(coords, Object.assign({}, opts, { color: darkenColor(color, 0.55), weight: 12, opacity: 0.6 })).addTo(map),
            L.polyline(coords, Object.assign({}, opts, { color: color, weight: 8, opacity: 1 })).addTo(map)
          );
        }

        function fetchFullRoute(waypoints) {
          var coordStr = waypoints.map(function(p) { return p[1] + ',' + p[0]; }).join(';');
          return fetch('https://router.project-osrm.org/route/v1/driving/' + coordStr + '?overview=full&geometries=geojson&annotations=false')
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (!data.routes || !data.routes[0]) return null;
              return data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
            })
            .catch(function(e) { console.log('OSRM error:', e); return null; });
        }

        function splitRouteIntoZones(allCoords, boundaryLatLngs) {
          var segments = [], remaining = allCoords.slice();
          for (var b = 0; b < boundaryLatLngs.length; b++) {
            var target = boundaryLatLngs[b], bestIdx = 0, bestDist = Infinity;
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
            ? ROUTE_WAYPOINTS_FWD.slice() : ROUTE_WAYPOINTS_FWD.slice().reverse();
          var allWaypoints = [[originLat, originLng]].concat(orderedWaypoints);
          var boundaries = allWaypoints.slice(1, allWaypoints.length - 1);
          return fetchFullRoute(allWaypoints).then(function(allCoords) {
            if (!allCoords) return;
            var rawSegments = splitRouteIntoZones(allCoords, boundaries);
            rawSegments.forEach(function(seg, idx) {
              drawNavRoute(seg, zoneColors[Math.min(idx, zoneColors.length - 1)], layerArray);
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
            if (routeSegments.length === 0 && hasActiveRoute) {
              hasActiveRoute = false;
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ROUTE_COMPLETED' }));
              }
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
          var originalColors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
          var zoneColors = jeep.destination === 'Town' ? originalColors.slice().reverse() : originalColors;
          buildAndDrawRoute(jeep.latitude, jeep.longitude, jeep.destination, zoneColors, passengerViewRoutes)
            .then(function() {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'SHOW_FARE_MODAL', jeepId: jeepId, destination: jeep.destination
                }));
              }
            });
        }

        function updateRideRequestMarkers(requests) {
          Object.keys(rideRequestMarkers).forEach(function(id) {
            if (!requests[id]) { map.removeLayer(rideRequestMarkers[id]); delete rideRequestMarkers[id]; }
          });
          Object.keys(requests).forEach(function(id) {
            var r = requests[id];
            if (!r.lat || !r.lng) return;
            var icon = L.divIcon({
              className: '',
              html: '<div class="ride-request-marker">\uD83D\uDE4B</div>',
              iconSize: [40, 40], iconAnchor: [20, 20]
            });
            if (rideRequestMarkers[id]) {
              rideRequestMarkers[id].setLatLng([r.lat, r.lng]);
            } else {
              rideRequestMarkers[id] = L.marker([r.lat, r.lng], { icon: icon })
                .bindTooltip('<div class="jeep-tooltip">\uD83D\uDE4B Needs a ride to ' + (r.destination || '?') + '</div>',
                  { permanent: false, direction: 'top', offset: [0, -22] })
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
              function makeUserIcon() {
                if (isDriverMode) return L.divIcon({ className: '', html: makeDriverMarkerHtml(isFull), iconSize: [48,48], iconAnchor: [24,24] });
                return L.divIcon({ className: '', html: '<div class="passenger-dot"></div>', iconSize: [18,18], iconAnchor: [9,9] });
              }
              if (!userMarker) {
                userMarker = L.marker([m.lat, m.lng], { icon: makeUserIcon() }).addTo(map);
                map.panTo([m.lat, m.lng]);
              } else {
                if (prevDriverMode !== isDriverMode || currentDriverFull !== isFull) {
                  currentDriverFull = isFull;
                  userMarker.setIcon(makeUserIcon());
                }
                userMarker.setLatLng([m.lat, m.lng]);
                if (isDriverMode && hasActiveRoute) map.panTo([m.lat, m.lng], { animate: true, duration: 0.5 });
              }
              if (isDriverMode && hasActiveRoute) updateNavigatorRoute(m.lat, m.lng);
            }

            if (m.type === "SET_DRIVER_STATUS") {
              currentDriverFull = m.isFull;
              if (userMarker && isDriverMode) {
                userMarker.setIcon(L.divIcon({ className: '', html: makeDriverMarkerHtml(m.isFull), iconSize: [48,48], iconAnchor: [24,24] }));
              }
            }

            if (m.type === "DRAW_ZONES") {
              routeSegments.forEach(function(s) { map.removeLayer(s); });
              routeSegments = [];
              var originLat = m.driverLat, originLng = m.driverLng;
              if (originLat === null || originLat === undefined) {
                var fallback = m.destination === 'Balacbac' ? ROUTE_WAYPOINTS_FWD[0] : ROUTE_WAYPOINTS_FWD[ROUTE_WAYPOINTS_FWD.length - 1];
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
                var icon = L.divIcon({ className: '', html: makeJeepMarkerHtml(isFull), iconSize: [48,48], iconAnchor: [24,24] });
                if (jeepMarkers[j.id]) {
                  jeepMarkers[j.id].setLatLng([j.latitude, j.longitude]);
                  jeepMarkers[j.id].setIcon(icon);
                } else {
                  var marker = L.marker([j.latitude, j.longitude], { icon: icon }).addTo(map);
                  marker.jeepId = j.id;
                  marker.bindTooltip('<div class="jeep-tooltip">\uD83D\uDE8C To ' + (j.destination || '?') + (isFull ? ' \u2014 FULL' : ' \u2014 Available') + '</div>',
                    { permanent: false, direction: 'top', offset: [0, -26] });
                  marker.on('click', function() {
                    var jd = jeepsData[this.jeepId];
                    showJeepRoute(this.jeepId);
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'JEEP_TAPPED', jeepId: this.jeepId,
                        destination: jd ? jd.destination : null,
                        status: jd ? jd.status : 'available',
                      }));
                    }
                  });
                  jeepMarkers[j.id] = marker;
                }
                jeepMarkers[j.id].unbindTooltip();
                jeepMarkers[j.id].bindTooltip('<div class="jeep-tooltip">\uD83D\uDE8C To ' + (j.destination || '?') + (isFull ? ' \u2014 FULL' : ' \u2014 Available') + '</div>',
                  { permanent: false, direction: 'top', offset: [0, -26] });
              });
            }

            if (m.type === "SET_RIDE_REQUESTS") {
              updateRideRequestMarkers(m.requests || {});
            }

          } catch(e) { console.error('Message error:', e); }
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
        onError={(e) => console.error('WebView error:', e.nativeEvent)}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'MAP_READY') setWebViewLoaded(true);
            if (message.type === 'SHOW_FARE_MODAL') setFareModalVisible(true);
            if (message.type === 'JEEP_TAPPED') {
              const { jeepId, destination, status } = message;
              get(ref(db, `jeep_info/${jeepId}`)).then(snap => {
                const d = snap.exists() ? snap.val() : {};
                openJeepInfoSheet({
                  driverName: d.driverName || 'Unknown Driver',
                  plateNumber: d.plate || 'Not set',
                  profilePic: d.profilePic || null,
                  status: status || 'available',
                  destination: destination || null,
                });
              }).catch(() => openJeepInfoSheet({
                driverName: 'Unknown Driver', plateNumber: 'Not set',
                profilePic: null, status: status || 'available', destination: destination || null,
              }));
            }
            if (message.type === 'ROUTE_COMPLETED') {
              Alert.alert(
                '\uD83C\uDFC1 Route Complete!',
                'You have reached the end of the route.',
                [
                  { text: 'End Trip', style: 'destructive', onPress: endTripSilent },
                  { text: 'Start New Trip', onPress: async () => { await endTripSilent(); setTimeout(() => setRouteModalVisible(true), 400); } },
                ],
                { cancelable: false }
              );
            }
          } catch (e) { console.error('Message parse error:', e); }
        }}
        onHttpError={(e) => console.error('HTTP Error:', e.nativeEvent.statusCode)}
        {...(Platform.OS === 'android' && {
          androidHardwareAccelerationDisabled: false,
          androidLayerType: 'hardware',
        })}
      />

      {/* FARE CALCULATOR BUTTON (non-drivers only) */}
      {role !== 'driver' && (
        <TouchableOpacity style={styles.fareCalcFab} onPress={() => setFareCalcVisible(true)} activeOpacity={0.85}>
          <Calculator color="white" size={22} />
        </TouchableOpacity>
      )}

      {/* PASSENGER / GUEST RIDE REQUEST PANEL */}
      {role !== 'driver' && (
        <View style={styles.passengerPanel}>
          {activeRideRequest ? (
            <View style={styles.activeRequestCard}>
              <View style={styles.activeRequestInfo}>
                <Text style={styles.activeRequestEmoji}>🙋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeRequestTitle}>Requesting a ride</Text>
                  <Text style={styles.activeRequestSub}>To {activeRideRequest.destination} — Drivers can see you</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.cancelRequestBtn} onPress={cancelRideRequest}>
                <X color="#DC2626" size={16} />
                <Text style={styles.cancelRequestText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.rideRequestBtn} onPress={() => setRideRequestModalVisible(true)} activeOpacity={0.85}>
              <Hand color="white" size={20} />
              <Text style={styles.rideRequestBtnText}>Request a Ride</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* DRIVER PANEL */}
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
                <TouchableOpacity onPress={() => toggleStatus(false)} style={[styles.statusButton, styles.availableButton, !isFull && styles.statusButtonActive]}>
                  <Circle size={10} color={!isFull ? '#10B981' : '#9CA3AF'} fill={!isFull ? '#10B981' : '#9CA3AF'} />
                  <Text style={[styles.statusButtonText, !isFull && styles.statusButtonTextActive]}>Available</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleStatus(true)} style={[styles.statusButton, styles.fullButton, isFull && styles.statusButtonActive]}>
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
                <View style={styles.startIconContainer}><NavIcon color="white" size={24} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.startTripTitle}>Start a Trip</Text>
                  <Text style={styles.startTripSubtitle}>Choose your destination</Text>
                </View>
                <View style={styles.arrowContainer}><Text style={{ color: 'white', fontSize: 20 }}>→</Text></View>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* DEPARTURE BANNER */}
      {departureBanner.visible && (
        <Animated.View style={[styles.departureBanner, { transform: [{ translateY: bannerAnim }] }]}>
          <View style={styles.departureBannerIcon}><Text style={{ fontSize: 20 }}>🚌</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.departureBannerTitle}>Jeep Departed!</Text>
            <Text style={styles.departureBannerMsg} numberOfLines={2}>{departureBanner.message}</Text>
          </View>
          <TouchableOpacity onPress={() => setDepartureBanner(p => ({ ...p, visible: false }))}>
            <X color="#fff" size={18} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* JEEP INFO BOTTOM SHEET */}
      {jeepInfoVisible && (
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeJeepInfoSheet} />
          <Animated.View style={[styles.jeepInfoSheet, { transform: [{ translateY: jeepSheetAnim }] }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetDriverHeader}>
              {selectedJeepInfo?.profilePic ? (
                <Image source={{ uri: selectedJeepInfo.profilePic }} style={styles.sheetDriverAvatar} />
              ) : (
                <View style={styles.sheetDriverAvatarFallback}><User color="#6B7280" size={28} /></View>
              )}
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={styles.sheetTitle}>{selectedJeepInfo?.driverName ?? 'Jeep Info'}</Text>
                <Text style={styles.sheetDriverPlate}>{selectedJeepInfo?.plateNumber ?? ''}</Text>
              </View>
              {selectedJeepInfo?.status === 'full' && (
                <View style={styles.fullBadge}><Text style={styles.fullBadgeText}>FULL</Text></View>
              )}
            </View>
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, { backgroundColor: '#DBEAFE' }]}><MapPin color="#3B82F6" size={20} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Heading To</Text>
                <Text style={styles.sheetRowValue}>{selectedJeepInfo?.destination ?? 'Not started'}</Text>
              </View>
            </View>
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, { backgroundColor: selectedJeepInfo?.status === 'full' ? '#FEE2E2' : '#D1FAE5' }]}>
                <Circle size={20} color={selectedJeepInfo?.status === 'full' ? '#EF4444' : '#10B981'} fill={selectedJeepInfo?.status === 'full' ? '#EF4444' : '#10B981'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Status</Text>
                <Text style={[styles.sheetRowValue, { color: selectedJeepInfo?.status === 'full' ? '#EF4444' : '#10B981' }]}>
                  {selectedJeepInfo?.status === 'full' ? 'Full' : 'Available'}
                </Text>
              </View>
            </View>
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, { backgroundColor: '#F3F4F6' }]}><Truck color="#6B7280" size={20} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Route</Text>
                <Text style={styles.sheetRowValue}>Balacbac To Town</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.sheetCloseBtn} onPress={closeJeepInfoSheet}>
              <Text style={styles.sheetCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* DRIVER PROFILE SETUP MODAL */}
      <Modal visible={profileModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Set Up Your Profile</Text>
            <Text style={styles.profileSubtitle}>Passengers will see this when they tap your jeep.</Text>
            <Text style={styles.inputLabel}>Your Name</Text>
            <TextInput style={styles.textInput} placeholder="e.g. Juan dela Cruz" value={driverName} onChangeText={setDriverName} autoCapitalize="words" placeholderTextColor="#9CA3AF" />
            <Text style={styles.inputLabel}>Plate Number</Text>
            <TextInput style={styles.textInput} placeholder="e.g. ABC 1234" value={plateNumber} onChangeText={setPlateNumber} autoCapitalize="characters" placeholderTextColor="#9CA3AF" />
            <TouchableOpacity style={styles.saveProfileBtn} onPress={saveProfileAndStart}>
              <Text style={styles.saveProfileBtnText}>Save & Start Trip</Text>
              <ChevronRight color="white" size={20} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setProfileModalVisible(false); setPendingDestination(null); }}>
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
              <View style={[styles.destinationIcon, { backgroundColor: '#DBEAFE' }]}><MapPin color="#15803d" size={24} /></View>
              <View style={{ flex: 1 }}><Text style={styles.destinationTitle}>Balacbac to Town</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => startTrip('Balacbac')} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: '#FEF3C7' }]}><MapPin color="#D97706" size={24} /></View>
              <View style={{ flex: 1 }}><Text style={styles.destinationTitle}>Town to Balacbac</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRouteModalVisible(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RIDE REQUEST MODAL */}
      <Modal visible={rideRequestModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Where are you going?</Text>
            <Text style={styles.profileSubtitle}>Drivers heading your way will see your location on the map. No account needed.</Text>
            <TouchableOpacity onPress={() => submitRideRequest('Town')} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: '#DBEAFE' }]}><MapPin color="#15803d" size={24} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.destinationTitle}>Going to Town</Text>
                <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>Notifies drivers heading to Town</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => submitRideRequest('Balacbac')} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: '#FEF3C7' }]}><MapPin color="#D97706" size={24} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.destinationTitle}>Going to Balacbac</Text>
                <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>Notifies drivers heading to Balacbac</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRideRequestModalVisible(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FARE CALCULATOR MODAL */}
      <Modal visible={fareCalcVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={styles.modalTitle}>Fare Calculator</Text>
              <TouchableOpacity onPress={() => { setFareCalcVisible(false); setFareFrom(''); setFareTo(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>From</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
              {['Town', 'Shell', 'Junction', 'Centro', 'Friendship', 'Balacbac'].map(stop => (
                <TouchableOpacity key={'from-' + stop} onPress={() => setFareFrom(stop)} style={[styles.stopChip, fareFrom === stop && styles.stopChipActive]}>
                  <Text style={[styles.stopChipText, fareFrom === stop && styles.stopChipTextActive]}>{stop}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.inputLabel}>To</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
              {['Town', 'Shell', 'Junction', 'Centro', 'Friendship', 'Balacbac'].map(stop => (
                <TouchableOpacity key={'to-' + stop} onPress={() => setFareTo(stop)} style={[styles.stopChip, fareTo === stop && styles.stopChipActive]}>
                  <Text style={[styles.stopChipText, fareTo === stop && styles.stopChipTextActive]}>{stop}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {fareFrom && fareTo && fareFrom !== fareTo ? (
              <View style={styles.fareResult}>
                <Text style={styles.fareResultRoute}>{fareFrom} To {fareTo}</Text>
                <Text style={styles.fareResultAmount}>₱{getZoneFare(fareFrom, fareTo)}</Text>
                <Text style={styles.fareResultNote}>Senior/Student: ₱{Math.ceil(getZoneFare(fareFrom, fareTo) * 0.8)} (20% off)</Text>
              </View>
            ) : fareFrom && fareTo && fareFrom === fareTo ? (
              <View style={[styles.fareResult, { backgroundColor: '#FEF3C7' }]}>
                <Text style={{ color: '#92400E', fontWeight: '700', textAlign: 'center' }}>Please select different stops</Text>
              </View>
            ) : (
              <View style={[styles.fareResult, { backgroundColor: '#F3F4F6' }]}>
                <Text style={{ color: '#9CA3AF', textAlign: 'center', fontWeight: '600' }}>Select From and To stops above</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      <PassengerCountModal
  visible={passengerModalVisible}
  destination={currentDest}
  onCancel={() => setPassengerModalVisible(false)}
  onConfirm={async (passengerCount , farePerPassenger) => {
    setPassengerModalVisible(false);
 
    // Save revenue to Firebase
    if (auth.currentUser) {
      const jeepInfoSnap = await get(ref(db, `jeep_info/${auth.currentUser.uid}`));
      const driverName = jeepInfoSnap.exists()
        ? (jeepInfoSnap.val().driverName ?? "Unknown Driver")
        : "Unknown Driver";
 
      await recordTripRevenue({
        driverId: auth.currentUser.uid,
        driverName,
        passengerCount,
        farePerPassenger,
        route: currentDest === "Town" ? "Balacbac–Town" : "Town–Balacbac",
        tripId: currentTripIdRef.current ?? `trip_${Date.now()}`,
      });
    }
    await endTripSilent();
  }}
/>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  fareCalcFab: {
    position: 'absolute', bottom: 100, right: 16,
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#15803d',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 8, zIndex: 50,
  },
  stopChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  stopChipActive: { backgroundColor: '#15803d', borderColor: '#15803d' },
  stopChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  stopChipTextActive: { color: 'white' },
  fareResult: { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 18, alignItems: 'center', marginBottom: 8 },
  fareResultRoute: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  fareResultAmount: { fontSize: 36, fontWeight: '900', color: '#15803d' },
  fareResultNote: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  passengerPanel: { position: 'absolute', bottom: 20, left: 16, right: 16, zIndex: 40 },
  rideRequestBtn: {
    backgroundColor: '#0b600f', borderRadius: 18, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#04350a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  rideRequestBtnText: { color: 'white', fontWeight: '800', fontSize: 16 },
  activeRequestCard: { backgroundColor: 'white', borderRadius: 18, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  activeRequestInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  activeRequestEmoji: { fontSize: 28 },
  activeRequestTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  activeRequestSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cancelRequestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 10 },
  cancelRequestText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  driverPanel: { position: 'absolute', bottom: 20, left: 16, right: 16 },
  activeTripCard: { backgroundColor: 'white', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
  tripHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  tripIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tripLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },
  tripDestination: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  statusButtonsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statusButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 14, gap: 8, borderWidth: 2, borderColor: '#E5E7EB' },
  statusButtonActive: { borderColor: '#15803d' },
  availableButton: { backgroundColor: '#F0FDF4' },
  fullButton: { backgroundColor: '#FEF2F2' },
  statusButtonText: { fontSize: 15, fontWeight: '700', color: '#6B7280' },
  statusButtonTextActive: { color: '#1F2937' },
  endTripBtn: { backgroundColor: '#FEE2E2', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  endTripText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
  startTripCard: { backgroundColor: 'white', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.15, elevation: 8 },
  startTripContent: { flexDirection: 'row', alignItems: 'center' },
  startIconContainer: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#15803d', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  startTripTitle: { fontSize: 18, fontWeight: '700' },
  startTripSubtitle: { fontSize: 14, color: '#6B7280' },
  arrowContainer: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#15803d', alignItems: 'center', justifyContent: 'center' },
  departureBanner: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#15803d', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, paddingTop: Platform.OS === 'ios' ? 52 : 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10, zIndex: 999 },
  departureBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  departureBannerTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  departureBannerMsg: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 100 },
  jeepInfoSheet: { backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#E5E7EB', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  sheetIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetRowLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  sheetRowValue: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  sheetDriverHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  sheetDriverAvatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#E5E7EB' },
  sheetDriverAvatarFallback: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E5E7EB' },
  sheetDriverPlate: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  fullBadge: { marginLeft: 'auto', backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  fullBadgeText: { color: '#DC2626', fontWeight: '800', fontSize: 12 },
  sheetCloseBtn: { marginTop: 20, backgroundColor: '#F3F4F6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sheetCloseBtnText: { color: '#374151', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 5, backgroundColor: '#E5E7EB', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  destinationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, marginBottom: 12 },
  destinationIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  destinationTitle: { fontSize: 16, fontWeight: '700' },
  cancelBtn: { marginTop: 12, paddingVertical: 16, alignItems: 'center' },
  cancelText: { color: '#6B7280', fontSize: 16, fontWeight: '600' },
  profileSubtitle: { color: '#6B7280', fontSize: 14, marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  textInput: { backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111827', marginBottom: 16 },
  saveProfileBtn: { backgroundColor: '#15803d', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  saveProfileBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
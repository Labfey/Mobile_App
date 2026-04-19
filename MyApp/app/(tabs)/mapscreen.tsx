import React, { useEffect, useRef, useState } from "react";
import {
  View, StyleSheet, Text, TouchableOpacity, Modal, Alert,
  Animated, Platform, TextInput, KeyboardAvoidingView, Image, ScrollView, ActivityIndicator
} from "react-native";
import { useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import {
  Navigation as NavIcon, MapPin, Circle, XCircle, User,
  Truck, ChevronRight, X, Calculator, Hand
} from "lucide-react-native";
import { ref, onValue, update, get, remove, push } from "firebase/database";
import { auth, db,} from "../../services/firebase";
import { FARE_ZONES } from "../../constants/routes";
import PassengerCountModal, { FareGroup } from "../../components/PassengerCountModal";
import { recordTripRevenue } from "../../hooks/useRevenue";
import { Clock } from "lucide-react-native";

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────


const TERMINALS = {
  TOWN:   { lat: 16.414019, lng: 120.593455, label: "Town Terminal" },
  TIERRA: { lat: 16.378759, lng: 120.586049, label: "Balacbac Terminal" },
};
const TERMINAL_RADIUS_METERS = 80;
const LOCATION_TASK_NAME = "background-location-task";

interface Fares {
    zone1: number; zone1Disc: number;
    zone2: number; zone2Disc: number;
    zone3: number; zone3Disc: number;
    zone4: number; zone4Disc: number;
}
 
const DEFAULT_FARES: Fares = {
    zone1: 13, zone1Disc: 10,
    zone2: 15, zone2Disc: 12,
    zone3: 17, zone3Disc: 14,
    zone4: 20, zone4Disc: 16,
};
 
// ─────────────────────────────────────────────────────────────────────────────
// FARE CALCULATOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const STOP_ORDER: Record<string, number> = {
    Town: 0, Shell: 1, Junction: 2, Centro: 3, Friendship: 4, Balacbac: 5,
};
 
// Returns the correct zone fare from the live Firebase fares object.
// discounted = true  → Student / Senior / PWD rate (zone1Disc, zone2Disc, …)
// discounted = false → Regular rate (zone1, zone2, …)
function getFareForDiff(diff: number, fares: Fares, discounted = false): number {
    if (diff <= 0) return 0;
    if (diff === 1) return discounted ? fares.zone1Disc : fares.zone1;
    if (diff === 2) return discounted ? fares.zone2Disc : fares.zone2;
    if (diff === 3) return discounted ? fares.zone3Disc : fares.zone3;
    return discounted ? fares.zone4Disc : fares.zone4;
}
 
function getZoneFare(from: string, to: string, fares: Fares, discounted = false): number {
    const diff = Math.abs((STOP_ORDER[from] ?? 0) - (STOP_ORDER[to] ?? 0));
    return getFareForDiff(diff, fares, discounted);
}
// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND LOCATION TASK
// ─────────────────────────────────────────────────────────────────────────────

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) { console.error("Background task error:", error); return; }
  if (data) {
    const { locations } = data;
    const { latitude, longitude } = locations[0].coords;
    if (auth.currentUser) {
      try {
        await update(ref(db, `jeeps/${auth.currentUser.uid}`), { latitude, longitude });
      } catch (err) { console.log("Background Firebase update error:", err); }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ExtendedZone {
  originalIndex: number; id: string; label: string; color: string; pts: number[][];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function MapScreen() {

const router = useRouter();

  useEffect(() => {
    const checkOperatingHours = () => {
      const currentHour = new Date().getHours();
      
      // Check if time is between 9 PM (21) and 4 AM (4)
      if (currentHour >= 21 || currentHour < 4) {
        Alert.alert(
          "Service Unavailable",
          "There are no jeeps available at this time. Operating hours are 4:00 AM to 9:00 PM.",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
      }
    };

    checkOperatingHours();
  }, []);


  const webViewRef = useRef<WebView>(null);
  // Live fare rates from Firebase — synced with admin settings
const [fares, setFares] = useState<Fares>(DEFAULT_FARES);
 
useEffect(() => {
    const unsub = onValue(ref(db, "config/fares"), snap => {
        if (snap.exists()) {
            setFares({ ...DEFAULT_FARES, ...snap.val() });
        }
    });
    return () => unsub();
}, []);
 

  // ── Core state ──────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [role, setRole]                     = useState<"driver" | "passenger" | "guest">("guest");
  const [isFull, setIsFull]                 = useState(false);
  const [routeModalVisible, setRouteModalVisible] = useState(false);
  const [currentDest, setCurrentDest]       = useState<"Town" | "Balacbac" | null>(null);
  const [fareModalVisible, setFareModalVisible]   = useState(false);
  const [webViewLoaded, setWebViewLoaded]   = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const activeZonesRef        = useRef<ExtendedZone[]>([]);
  const locationSub           = useRef<any>(null);
  const currentLocationRef    = useRef<{ lat: number; lng: number } | null>(null);
  const pulseAnim             = useRef(new Animated.Value(1)).current;
  const currentTripIdRef      = useRef<string | null>(null);
  const currentHistoryKeyRef  = useRef<string | null>(null);

  // ── Driver profile ──────────────────────────────────────────────────────────
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [driverName, setDriverName]   = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [pendingDestination, setPendingDestination] = useState<"Town" | "Balacbac" | null>(null);

  // ── Jeep info bottom sheet ──────────────────────────────────────────────────
  const [jeepInfoVisible, setJeepInfoVisible] = useState(false);
  const [selectedJeepInfo, setSelectedJeepInfo] = useState<{
    driverName: string; plateNumber: string; profilePic: string | null;
    status: string; destination: string | null;
  } | null>(null);
  const jeepSheetAnim = useRef(new Animated.Value(300)).current;

  // ── Departure banner ────────────────────────────────────────────────────────
  const [departureBanner, setDepartureBanner] = useState<{
    visible: boolean; message: string; terminal: string;
  }>({ visible: false, message: "", terminal: "" });
  const bannerAnim        = useRef(new Animated.Value(-100)).current;
  const departedJeepsRef  = useRef<Set<string>>(new Set());

   // ── Fare calculator ─────────────────────────────────────────────────────────
  const [fareCalcVisible, setFareCalcVisible] = useState(false);
  const [fareFrom, setFareFrom] = useState("");
  const [fareTo, setFareTo]     = useState("");

  // ── Ride request ────────────────────────────────────────────────────────────
  const [rideRequestModalVisible, setRideRequestModalVisible] = useState(false);
  const [activeRideRequest, setActiveRideRequest] = useState<{
    destination: string; lat: number; lng: number;
  } | null>(null);
  const notifiedRequestsRef = useRef<Set<string>>(new Set());
  const guestRideIdRef      = useRef<string | null>(null);

  // ── Revenue / passenger modal ───────────────────────────────────────────────
  const [passengerModalVisible, setPassengerModalVisible] = useState(false);
  //ETA for passenger jeep info sheet ───────────────────────────────────────────────
    const [etaMinutes, setEtaMinutes]   = useState<number | null>(null);
    const [etaLoading, setEtaLoading]   = useState(false);

  // ── Stable role/dest/etc refs for closures ──────────────────────────────────
  const roleRef         = useRef(role);
  const currentDestRef  = useRef(currentDest);
  const webViewLoadedRef= useRef(webViewLoaded);
  const isFullRef       = useRef(isFull);
  useEffect(() => { roleRef.current        = role;         }, [role]);
  useEffect(() => { currentDestRef.current = currentDest;  }, [currentDest]);
  useEffect(() => { webViewLoadedRef.current= webViewLoaded;}, [webViewLoaded]);
  useEffect(() => { isFullRef.current      = isFull;       }, [isFull]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────────────────────────────────────

  // Notification permission
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") console.log("Notification permission not granted");
    })();
  }, []);

  // Pulse animation while trip is active
  useEffect(() => {
    if (currentDest) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [currentDest]);

  // Fetch user role on mount
  useEffect(() => {
    const fetchRole = async () => {
      if (auth.currentUser) {
        const snap = await get(ref(db, `users/${auth.currentUser.uid}`));
        if (snap.exists()) setRole(snap.val().role);
      } else {
        setRole("guest");
      }
      setLoading(false);
    };
    fetchRole();
  }, []);

  // Foreground location watch
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { console.log("Location permission denied"); return; }
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (pos) => {
          const { latitude, longitude } = pos.coords;
          currentLocationRef.current = { lat: latitude, lng: longitude };
          const liveRole    = roleRef.current;
          const liveDest    = currentDestRef.current;
          const liveLoaded  = webViewLoadedRef.current;
          const liveIsFull  = isFullRef.current;
          if (liveLoaded && webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({
              type: "SET_LOCATION", lat: latitude, lng: longitude,
              isDriver: liveRole === "driver", hasActiveRoute: liveDest !== null, isFull: liveIsFull,
            }));
          }
          if (liveRole === "driver" && auth.currentUser) {
            update(ref(db, `jeeps/${auth.currentUser.uid}`), { latitude, longitude })
              .catch(err => console.log("Firebase update error:", err));
          }
        }
      );
    })();
    return () => { if (locationSub.current) { locationSub.current.remove(); locationSub.current = null; } };
  }, []);

  // Live jeep markers
  useEffect(() => {
    if (!webViewLoaded) return;
    const unsub = onValue(ref(db, "jeeps"), (snapshot) => {
      const jeepsArray = snapshot.exists()
        ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] })) : [];
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: "SET_JEEPS", jeeps: jeepsArray }));
      }
      if (roleRef.current !== "driver") {
        jeepsArray.forEach((jeep: any) => {
          if (!departedJeepsRef.current.has(jeep.id) && jeep.latitude && jeep.longitude && jeep.destination) {
            const nearTown   = haversineMeters(jeep.latitude, jeep.longitude, TERMINALS.TOWN.lat,   TERMINALS.TOWN.lng)   < TERMINAL_RADIUS_METERS;
            const nearTierra = haversineMeters(jeep.latitude, jeep.longitude, TERMINALS.TIERRA.lat, TERMINALS.TIERRA.lng) < TERMINAL_RADIUS_METERS;
            const terminalLabel = nearTown ? TERMINALS.TOWN.label : nearTierra ? TERMINALS.TIERRA.label : null;
            if (terminalLabel) {
              const msg = `A jeep has departed from ${terminalLabel} heading to ${jeep.destination}`;
              sendPushNotification("🚌 Jeep Departed!", msg);
              showDepartureBanner(msg, terminalLabel);
            }
            departedJeepsRef.current.add(jeep.id);
          }
        });
        const activeIds = new Set(jeepsArray.map((j: any) => j.id));
        departedJeepsRef.current.forEach(id => { if (!activeIds.has(id)) departedJeepsRef.current.delete(id); });
      }
    }, (error) => console.log("Firebase listener error:", error));
    return () => unsub();
  }, [webViewLoaded]);

  // Ride requests (drivers only)
  useEffect(() => {
    if (!webViewLoaded || role !== "driver") return;
    const unsub = onValue(ref(db, "ride_requests"), (snapshot) => {
      if (!snapshot.exists()) {
        postMessageToWebView({ type: "SET_RIDE_REQUESTS", requests: {} });
        return;
      }
      const requests = snapshot.val();
      const currentDestination = currentDestRef.current;
      postMessageToWebView({ type: "SET_RIDE_REQUESTS", requests });
      Object.keys(requests).forEach(uid => {
        const r = requests[uid];
        if (r.status === "waiting" && r.destination === currentDestination && !notifiedRequestsRef.current.has(uid)) {
          notifiedRequestsRef.current.add(uid);
          sendPushNotification("🙋 Ride Request!", `Passenger needs a ride to ${r.destination}`);
          showDepartureBanner(`Passenger needs a ride to ${r.destination}`, "Nearby");
        }
      });
      const activeIds = new Set(Object.keys(requests));
      notifiedRequestsRef.current.forEach(id => { if (!activeIds.has(id)) notifiedRequestsRef.current.delete(id); });
    }, (error) => console.log("Ride requests listener error:", error));
    return () => unsub();
  }, [webViewLoaded, role]);

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  const postMessageToWebView = (message: any) => {
    if (webViewRef.current && webViewLoaded) {
      webViewRef.current.postMessage(JSON.stringify(message));
    }
  };

  const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  // ─────────────────────────────────────────────────────────────────────────────
  // RIDE REQUEST
  // ─────────────────────────────────────────────────────────────────────────────

  const submitRideRequest = async (destination: "Town" | "Balacbac") => {
    if (!currentLocationRef.current) {
      Alert.alert("Location unavailable", "Please wait for your location to load.");
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
    await update(ref(db, `ride_requests/${requestId}`), { lat, lng, destination, timestamp: Date.now(), status: "waiting" });
    setActiveRideRequest({ destination, lat, lng });
    postMessageToWebView({ type: "SET_RIDE_REQUESTS", requests: { [requestId]: { lat, lng, destination } } });
    setRideRequestModalVisible(false);
    Alert.alert("Request Sent! 🙋", `Drivers heading to ${destination} can see your location.`);
  };

  const cancelRideRequest = async () => {
    const requestId = auth.currentUser ? auth.currentUser.uid : guestRideIdRef.current;
    if (requestId) {
      await remove(ref(db, `ride_requests/${requestId}`));
      if (!auth.currentUser) guestRideIdRef.current = null;
    }
    setActiveRideRequest(null);
    postMessageToWebView({ type: "SET_RIDE_REQUESTS", requests: {} });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIP CONTROL
  // ─────────────────────────────────────────────────────────────────────────────

  const endTripSilent = async () => {
    setCurrentDest(null);
    postMessageToWebView({ type: "CLEAR_ZONES" });
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (auth.currentUser) {
      await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
      if (currentTripIdRef.current) {
        update(ref(db, `driver_trips/${auth.currentUser.uid}/${currentTripIdRef.current}`), { endTime: Date.now() }).catch(() => {});
        currentTripIdRef.current = null;
      }
      if (currentHistoryKeyRef.current) {
        const now = new Date();
        const dateKey    = now.toISOString().split("T")[0];
        const endTimeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
        await update(
          ref(db, `history/${auth.currentUser.uid}/${dateKey}/${currentHistoryKeyRef.current}`),
          { endTime: endTimeStr }
        ).catch(() => {});
        currentHistoryKeyRef.current = null;
      }
    }
  };

  const endTrip = () => {
    setPassengerModalVisible(true);
  };

  const startTrip = async (destination: "Town" | "Balacbac") => {
    if (auth.currentUser) {
      const snap = await get(ref(db, `jeep_info/${auth.currentUser.uid}`));
      const jeepData = snap.exists() ? snap.val() : {};
      if (!jeepData.driverName || !jeepData.plate) {
        setDriverName(jeepData.driverName || "");
        setPlateNumber(jeepData.plate || "");
        setPendingDestination(destination);
        setRouteModalVisible(false);
        setProfileModalVisible(true);
        return;
      }
    }
    await _executeStartTrip(destination);
  };

  const _executeStartTrip = async (destination: "Town" | "Balacbac") => {
    postMessageToWebView({ type: "CLEAR_ZONES" });

    if (role === "driver") {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus === "granted") {
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

    const originalColors = ["#22c55e", "#eab308", "#f97316", "#ef4444"];
    postMessageToWebView({
      type: "DRAW_ZONES",
      destination,
      driverLat: currentLocationRef.current?.lat ?? null,
      driverLng: currentLocationRef.current?.lng ?? null,
      zoneColors: destination === "Town" ? [...originalColors].reverse() : originalColors,
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
        sendPushNotification("🚌 Jeep Departed!", msg);
        showDepartureBanner(msg, terminalLabel);
      }
    }

    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), { destination, status: isFull ? "full" : "available" });

      const tripRef = push(ref(db, `driver_trips/${auth.currentUser.uid}`));
      currentTripIdRef.current = tripRef.key;
      update(tripRef, {
        destination,
        startTime: Date.now(),
        date: new Date().toISOString().split("T")[0],
        endTime: null,
      }).catch(() => {});

      const now        = new Date();
      const dateKey    = now.toISOString().split("T")[0];
      const timeStr    = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
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
    if (!driverName.trim())  { Alert.alert("Required", "Please enter your name."); return; }
    if (!plateNumber.trim()) { Alert.alert("Required", "Please enter your plate number."); return; }
    if (auth.currentUser) {
      await update(ref(db, `jeep_info/${auth.currentUser.uid}`), {
        driverName: driverName.trim(),
        plate: plateNumber.trim().toUpperCase(),
        route: "Balacbac To Town",
        updatedAt: Date.now(),
      });
    }
    setProfileModalVisible(false);
    if (pendingDestination) { await _executeStartTrip(pendingDestination); setPendingDestination(null); }
  };

  const toggleStatus = (newStatus: boolean) => {
    setIsFull(newStatus);
    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), { status: newStatus ? "full" : "available" });
    }
    postMessageToWebView({ type: "SET_DRIVER_STATUS", isFull: newStatus });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // MAP HTML
  // Changes from v1:
  //  • NO static route drawn on load — clean blank map until a driver starts
  //  • Passenger taps jeep marker → showJeepRoute draws the route for that jeep
  //  • Driver starts trip → initDriverRoute draws Grab-style consumed/remaining
  //  • Redesigned markers: pill for active driver, bubble for other jeeps,
  //    blue pulsing dot for passengers
  // ─────────────────────────────────────────────────────────────────────────────

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { height: 100vh; width: 100vw; background: #f0f4f0; }

        /* ── Passenger dot (self, non-driver) ─────────────────────────────── */
        .passenger-dot {
          width: 20px; height: 20px; background: #3b82f6;
          border: 3px solid white; border-radius: 50%;
          box-shadow: 0 2px 10px rgba(59,130,246,0.55), 0 0 0 8px rgba(59,130,246,0.12);
          animation: passPulse 2s infinite;
        }
        @keyframes passPulse {
          0%,100% { box-shadow: 0 2px 10px rgba(59,130,246,0.55), 0 0 0 8px rgba(59,130,246,0.12); }
          50%      { box-shadow: 0 2px 10px rgba(59,130,246,0.7), 0 0 0 14px rgba(59,130,246,0.18); }
        }

        /* ── Driver pill (self, ACTIVE trip) ──────────────────────────────── */
        .driver-pill {
          background: linear-gradient(135deg,#22c55e,#15803d);
          border: 2.5px solid white; border-radius: 22px;
          padding: 7px 12px 7px 9px;
          display: flex; align-items: center; gap: 6px;
          box-shadow: 0 4px 14px rgba(21,128,61,0.6);
          white-space: nowrap; animation: pillPulse 2.5s infinite;
        }
        .driver-pill.full {
          background: linear-gradient(135deg,#f87171,#dc2626) !important;
          box-shadow: 0 4px 14px rgba(220,38,38,0.6) !important;
          animation: pillPulseFull 1.5s infinite !important;
        }
        @keyframes pillPulse {
          0%,100% { box-shadow: 0 4px 14px rgba(21,128,61,0.6); }
          50%      { box-shadow: 0 6px 20px rgba(21,128,61,0.8); }
        }
        @keyframes pillPulseFull {
          0%,100% { box-shadow: 0 4px 14px rgba(220,38,38,0.6); }
          50%      { box-shadow: 0 6px 20px rgba(220,38,38,0.8); }
        }
        .driver-live-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #86efac; flex-shrink: 0;
          animation: liveBlink 1.2s ease infinite;
        }
        .driver-pill.full .driver-live-dot { background: #fca5a5; }
        @keyframes liveBlink { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
        .driver-pill-label {
          color: white; font-size: 11px; font-weight: 900; letter-spacing: 0.4px;
        }

        /* ── Driver circle (self, IDLE / no active trip) ────────────────────── */
        .driver-idle {
          width: 46px; height: 46px;
          background: linear-gradient(145deg,#22c55e,#15803d);
          border: 2.5px solid white; border-radius: 23px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 12px rgba(21,128,61,0.5);
          animation: idlePulse 3s infinite;
        }
        @keyframes idlePulse {
          0%,100% { box-shadow: 0 4px 12px rgba(21,128,61,0.5); }
          50%      { box-shadow: 0 4px 18px rgba(21,128,61,0.7); }
        }

        /* ── Other jeep bubbles ─────────────────────────────────────────────── */
        .jeep-bubble {
          width: 44px; height: 44px;
          background: linear-gradient(145deg,#22c55e,#15803d);
          border: 2.5px solid white; border-radius: 22px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 3px 10px rgba(21,128,61,0.45);
          cursor: pointer; transition: transform 0.15s ease;
        }
        .jeep-bubble:hover { transform: scale(1.1); }
        .jeep-bubble.full {
          background: linear-gradient(145deg,#f87171,#dc2626) !important;
          box-shadow: 0 3px 10px rgba(220,38,38,0.5) !important;
          animation: fullBounce 1.2s ease infinite;
        }
        @keyframes fullBounce { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }

        /* ── Ride request pin ──────────────────────────────────────────────── */
        .ride-request-marker {
          width: 42px; height: 42px;
          background: #2563eb; border: 3px solid white; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; line-height: 1;
          box-shadow: 0 4px 12px rgba(37,99,235,0.55);
          animation: ridePulse 1.4s ease infinite; cursor: pointer;
        }
        @keyframes ridePulse {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.12); }
        }

        .jeep-tooltip {
          background: white; border-radius: 10px; padding: 7px 12px;
          font-size: 12px; font-weight: 700; color: #111;
          box-shadow: 0 3px 12px rgba(0,0,0,0.18); white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // ── MAP INIT ──────────────────────────────────────────────────────────
        var map = L.map('map', {
          zoomControl: false, attributionControl: false, preferCanvas: true
        }).setView([16.4023, 120.5960], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // ── STATE ─────────────────────────────────────────────────────────────
        var userMarker         = null;
        var jeepMarkers        = {};
        var rideRequestMarkers = {};
        var jeepsData          = {};
        var isDriverMode       = false;
        var hasActiveRoute     = false;
        var currentDriverFull  = false;
        var passengerViewRoutes = [];

        // Route state — only the road AHEAD of the driver is drawn.
        // fullRouteCoords holds the full fixed corridor geometry from OSRM.
        // On every location tick, updateDynamicRoute() slices it from the
        // driver's snapped position forward — the passed section simply isn't
        // in the array anymore, so it vanishes automatically (Grab-style).
        var fullRouteCoords = [];
        var remainingBorder = null;
        var remainingLayer  = null;
        var remainingDashes = null;

        // Fixed waypoints for the Balacbac ↔ Town corridor
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

        // ── OSRM FETCH ────────────────────────────────────────────────────────
        function fetchRoute(waypoints, callback) {
          var coordStr = waypoints.map(function(p) { return p[1]+','+p[0]; }).join(';');
          fetch('https://router.project-osrm.org/route/v1/driving/'+coordStr
                +'?overview=full&geometries=geojson&annotations=false')
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (!data.routes || !data.routes[0]) { callback(null); return; }
              var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1],c[0]]; });
              callback(coords);
            })
            .catch(function() { callback(null); });
        }

        // ── HAVERSINE (metres) ────────────────────────────────────────────────
        function haversineM(lat1, lng1, lat2, lng2) {
          var R = 6371000;
          var dLat = (lat2-lat1)*Math.PI/180;
          var dLng = (lng2-lng1)*Math.PI/180;
          var a = Math.sin(dLat/2)*Math.sin(dLat/2)
                + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)
                  *Math.sin(dLng/2)*Math.sin(dLng/2);
          return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
        }

        // ── SNAP-TO-ROAD ──────────────────────────────────────────────────────
        function snapToRoute(dLat, dLng) {
          if (!fullRouteCoords.length) return null;
          var bestIdx  = 0;
          var bestDist = Infinity;
          for (var i = 0; i < fullRouteCoords.length; i++) {
            var d = haversineM(dLat, dLng, fullRouteCoords[i][0], fullRouteCoords[i][1]);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          }
          if (bestIdx > 0) {
            var A = fullRouteCoords[bestIdx-1];
            var B = fullRouteCoords[bestIdx];
            var abLat = B[0]-A[0], abLng = B[1]-A[1];
            var len2  = abLat*abLat + abLng*abLng;
            if (len2 > 0) {
              var t = ((dLat-A[0])*abLat + (dLng-A[1])*abLng) / len2;
              t = Math.max(0, Math.min(1, t));
              var sLat = A[0]+t*abLat, sLng = A[1]+t*abLng;
              var sDist = haversineM(dLat, dLng, sLat, sLng);
              if (sDist < bestDist) {
                return { idx: bestIdx, lat: sLat, lng: sLng, dist: sDist };
              }
            }
          }
          return { idx: bestIdx, lat: fullRouteCoords[bestIdx][0], lng: fullRouteCoords[bestIdx][1], dist: bestDist };
        }

        // ── DYNAMIC ROUTE UPDATE (Grab-style) ────────────────────────────────────
        // Called on every GPS tick while a trip is active.
        //
        // How the "line behind vanishes" effect works:
        //   1. snapToRoute() finds the nearest point on fullRouteCoords to the
        //      driver's current GPS → returns splitIdx (the index of that point).
        //   2. 'remaining' is built as:
        //        [snappedDriverPos].concat(fullRouteCoords.slice(splitIdx))
        //      — it starts exactly at the driver and contains ONLY the coords
        //      ahead of them. The coords behind are simply not included, so
        //      those polylines shrink from the rear on every tick.
        //   3. No grey "consumed" layer is drawn at all — nothing behind the
        //      driver is ever painted.
        function updateDynamicRoute(driverLat, driverLng) {
          if (!fullRouteCoords.length || !hasActiveRoute) return null;

          var snap = snapToRoute(driverLat, driverLng);
          if (!snap) return null;

          var SNAP_THRESHOLD = 80;
          var sLat = snap.dist < SNAP_THRESHOLD ? snap.lat : driverLat;
          var sLng = snap.dist < SNAP_THRESHOLD ? snap.lng : driverLng;

          // Remaining route: driver's snapped position → destination.
          // No consumed/grey layer — the road behind simply isn't drawn.
          var remaining = [[sLat, sLng]].concat(fullRouteCoords.slice(snap.idx));

          if (remaining.length >= 2) {
            if (!remainingBorder) {
              remainingBorder = L.polyline(remaining, {
                color: 'rgba(255,255,255,0.92)', weight: 12,
                lineCap: 'round', lineJoin: 'round', smoothFactor: 1,
              }).addTo(map);
              remainingLayer = L.polyline(remaining, {
                color: '#15803d', weight: 7, opacity: 0.96,
                lineCap: 'round', lineJoin: 'round', smoothFactor: 1,
              }).addTo(map);
              remainingDashes = L.polyline(remaining, {
                color: 'rgba(255,255,255,0.5)', weight: 3,
                dashArray: '1, 16', lineCap: 'round', lineJoin: 'round', smoothFactor: 1,
              }).addTo(map);
            } else {
              remainingBorder.setLatLngs(remaining);
              remainingLayer.setLatLngs(remaining);
              remainingDashes.setLatLngs(remaining);
            }
          }

          // Route completion — within 40 m of the final corridor waypoint
          var end     = fullRouteCoords[fullRouteCoords.length - 1];
          var distEnd = haversineM(sLat, sLng, end[0], end[1]);
          if (distEnd < 40 && hasActiveRoute) {
            hasActiveRoute = false;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ROUTE_COMPLETED' }));
            }
          }

          return [sLat, sLng];
        }

        // ── CLEAR DYNAMIC LAYERS ──────────────────────────────────────────────
        function clearDynamicRoute() {
          if (remainingBorder) { map.removeLayer(remainingBorder); remainingBorder = null; }
          if (remainingLayer)  { map.removeLayer(remainingLayer);  remainingLayer  = null; }
          if (remainingDashes) { map.removeLayer(remainingDashes); remainingDashes = null; }
          fullRouteCoords = [];
        }

        // ── INIT DRIVER TRIP ROUTE ────────────────────────────────────────────
        // Called when DRAW_ZONES message arrives (driver starts trip).
        //
        // IMPORTANT: We do NOT draw any polylines here directly.
        // We only fetch and store the route geometry, then immediately call
        // updateDynamicRoute() with the driver's starting position so that the
        // Grab-style consumed/remaining system is the single source of truth for
        // all route rendering — from the very first frame.
        //
        // This eliminates the "static green line" that used to appear at trip start
        // before the driver moved, because nothing is ever drawn outside of
        // updateDynamicRoute().
        // ── initDriverRoute ───────────────────────────────────────────────────────
        // Driver starts a trip. We always fetch the FIXED jeepney corridor
        // (ROUTE_WAYPOINTS_FWD) — never the driver's live GPS as an OSRM origin.
        // Using live GPS as the OSRM origin caused it to route via whatever
        // nearby road it found, diverging from the real jeepney path.
        //
        // The driver's GPS is passed to updateDynamicRoute() only for snapping:
        // it finds the nearest point ON the corridor so the consumed/remaining
        // split is accurate without distorting the polyline path itself.
        function initDriverRoute(originLat, originLng, destination) {
          clearDynamicRoute();
          passengerViewRoutes.forEach(function(l) { map.removeLayer(l); });
          passengerViewRoutes = [];

          var corridorWaypoints = destination === 'Balacbac'
            ? ROUTE_WAYPOINTS_FWD.slice()
            : ROUTE_WAYPOINTS_FWD.slice().reverse();

          fetchRoute(corridorWaypoints, function(coords) {
            if (!coords) return;
            fullRouteCoords = coords;
            hasActiveRoute  = true;
            updateDynamicRoute(originLat, originLng);
            map.fitBounds(L.polyline(coords).getBounds(), { padding: [50, 50] });
          });
        }

        // ── PASSENGER JEEP-TAP ROUTE ──────────────────────────────────────────
        // When a passenger taps a jeep bubble, draw a zone-coloured route for
        // that specific jeep. Previous passenger routes are cleared first.
        function hexToRgb(hex) {
          var r = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
          return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : {r:0,g:0,b:0};
        }
        function darkenColor(hex, factor) {
          var c = hexToRgb(hex);
          return 'rgb('+Math.round(c.r*factor)+','+Math.round(c.g*factor)+','+Math.round(c.b*factor)+')';
        }
        function drawNavRoute(coords, color, layerArray) {
          if (!coords || !coords.length) return;
          var o = { lineCap: 'round', lineJoin: 'round', smoothFactor: 1 };
          layerArray.push(
            L.polyline(coords, Object.assign({}, o, { color: 'rgba(255,255,255,0.95)', weight: 16, opacity: 1 })).addTo(map),
            L.polyline(coords, Object.assign({}, o, { color: darkenColor(color, 0.55), weight: 12, opacity: 0.6 })).addTo(map),
            L.polyline(coords, Object.assign({}, o, { color: color, weight: 8, opacity: 1 })).addTo(map)
          );
        }
        function splitRouteIntoZones(allCoords, boundaries) {
          var segs = [], remaining = allCoords.slice();
          for (var b = 0; b < boundaries.length; b++) {
            var tgt = boundaries[b], bestIdx = 0, bestDist = Infinity;
            for (var i = 0; i < remaining.length; i++) {
              var d = Math.pow(remaining[i][0]-tgt[0],2)+Math.pow(remaining[i][1]-tgt[1],2);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            segs.push(remaining.slice(0, bestIdx+1));
            remaining = remaining.slice(bestIdx);
          }
          segs.push(remaining);
          return segs;
        }
        // ── showJeepRoute (passenger taps a jeep bubble) ────────────────────────
        //
        // What the passenger sees:
        //   • A green route line that starts exactly at the driver's current GPS
        //     position and follows the fixed jeepney corridor to the destination.
        //   • Only the road AHEAD of the driver is drawn — nothing behind.
        //   • Zone colours split the route by fare zones along the corridor.
        //
        // How it works:
        //   1. Get the full corridor in the right direction (Balacbac→Town or
        //      Town→Balacbac) from ROUTE_WAYPOINTS_FWD.
        //   2. Walk the corridor waypoints and find the one nearest to the jeep's
        //      current GPS position — this is where the driver is on the corridor.
        //   3. Slice the corridor FROM that nearest waypoint to the destination
        //      (the "remaining" portion of the route).
        //   4. Prepend the driver's actual GPS lat/lng as the very first point.
        //      OSRM receives: [driver GPS, nearestWaypoint, ..., destination].
        //      Because the driver is physically close to the corridor, OSRM
        //      snaps immediately onto the real road and follows it — the line
        //      starts at the driver and traces the correct jeepney path.
        //   5. Zone boundaries are the intermediate remaining waypoints so the
        //      colour split still matches the fare zones ahead of the driver.
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

          // Step 1 — corridor in the correct direction for this jeep
          var corridor = jeep.destination === 'Balacbac'
            ? ROUTE_WAYPOINTS_FWD.slice()
            : ROUTE_WAYPOINTS_FWD.slice().reverse();

          // Step 2 — find the corridor waypoint nearest to the driver's GPS
          var nearestIdx  = 0;
          var nearestDist = Infinity;
          for (var i = 0; i < corridor.length; i++) {
            var d = haversineM(jeep.latitude, jeep.longitude, corridor[i][0], corridor[i][1]);
            if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
          }

          // Step 3 — slice: only the corridor waypoints FROM nearest → destination
          var remainingCorridor = corridor.slice(nearestIdx);

          // Step 4 — prepend driver's real GPS so the line starts there visually
          var fetchWaypoints = [[jeep.latitude, jeep.longitude]].concat(remainingCorridor);

          // Step 5 — zone boundaries: intermediate remaining corridor waypoints
          //   (skip the first — that's the driver GPS — and skip the last — destination)
          var boundaries = remainingCorridor.slice(1, remainingCorridor.length - 1);

          var colors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
          var zc = jeep.destination === 'Town' ? colors.slice().reverse() : colors;

          fetchRoute(fetchWaypoints, function(coords) {
            if (!coords) return;
            var rawSegs = splitRouteIntoZones(coords, boundaries);
            rawSegs.forEach(function(seg, idx) {
              drawNavRoute(seg, zc[Math.min(idx, zc.length - 1)], passengerViewRoutes);
            });
            if (passengerViewRoutes.length > 0) {
              var fills = passengerViewRoutes.filter(function(_, i) { return i % 3 === 2; });
              if (fills.length) {
                map.fitBounds(L.featureGroup(fills).getBounds(), { padding: [50, 50] });
              }
            }
          });

          setTimeout(function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SHOW_FARE_MODAL', jeepId: jeepId, destination: jeep.destination
              }));
            }
          }, 1500);
        }

        // ── RIDE REQUEST MARKERS ──────────────────────────────────────────────
        function updateRideRequestMarkers(requests) {
          Object.keys(rideRequestMarkers).forEach(function(id) {
            if (!requests[id]) { map.removeLayer(rideRequestMarkers[id]); delete rideRequestMarkers[id]; }
          });
          Object.keys(requests).forEach(function(id) {
            var r = requests[id];
            if (!r.lat || !r.lng) return;
            var icon = L.divIcon({ className: '', html: '<div class="ride-request-marker">\\uD83D\\uDE4B</div>', iconSize: [42,42], iconAnchor: [21,21] });
            if (rideRequestMarkers[id]) {
              rideRequestMarkers[id].setLatLng([r.lat, r.lng]);
            } else {
              rideRequestMarkers[id] = L.marker([r.lat, r.lng], { icon: icon })
                .bindTooltip('<div class="jeep-tooltip">\\uD83D\\uDE4B Needs a ride to '+(r.destination||'?')+'</div>', { permanent: false, direction: 'top', offset: [0,-24] })
                .addTo(map);
            }
          });
        }

        // ── JEEP SVG ──────────────────────────────────────────────────────────
        function makeJeepneySVG() {
          return '<svg width="26" height="24" viewBox="0 0 38 34" fill="none" xmlns="http://www.w3.org/2000/svg">'
            +'<rect x="0" y="4" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
            +'<rect x="32" y="4" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
            +'<rect x="0" y="20" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
            +'<rect x="32" y="20" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
            +'<rect x="5" y="1" width="28" height="32" rx="4" fill="rgba(255,255,255,0.96)"/>'
            +'<rect x="7" y="2" width="24" height="8" rx="2.5" fill="#7dd3fc" opacity="0.88"/>'
            +'<rect x="14" y="0" width="10" height="2.5" rx="1.25" fill="rgba(255,255,255,0.95)"/>'
            +'<rect x="5" y="14" width="28" height="3" fill="rgba(255,255,255,0.38)"/>'
            +'<rect x="6" y="18" width="5" height="13" rx="1.5" fill="rgba(255,255,255,0.3)"/>'
            +'<rect x="27" y="18" width="5" height="13" rx="1.5" fill="rgba(255,255,255,0.3)"/>'
            +'<rect x="13" y="19" width="12" height="11" rx="1" fill="rgba(255,255,255,0.1)"/>'
            +'<rect x="8" y="27" width="22" height="5" rx="2" fill="#7dd3fc" opacity="0.55"/>'
            +'<rect x="6" y="29" width="6" height="3" rx="1.5" fill="#fca5a5" opacity="0.95"/>'
            +'<rect x="26" y="29" width="6" height="3" rx="1.5" fill="#fca5a5" opacity="0.95"/>'
            +'</svg>';
        }

        // ── MARKER HTML BUILDERS ──────────────────────────────────────────────
        // Driver self marker:
        //   isActive=true  → pill with LIVE/FULL label (Grab-style)
        //   isActive=false → idle circle
        function makeDriverMarkerHtml(isFull, isActive) {
          if (isActive) {
            return '<div class="driver-pill'+(isFull?' full':'')+'"><div class="driver-live-dot"></div>'+makeJeepneySVG()+'<div class="driver-pill-label">'+(isFull?'FULL':'LIVE')+'</div></div>';
          }
          return '<div class="driver-idle">'+makeJeepneySVG()+'</div>';
        }

        // Other jeep markers — round bubble, red when full
        function makeJeepMarkerHtml(isFull) {
          return '<div class="jeep-bubble'+(isFull?' full':'')+'">'+makeJeepneySVG()+'</div>';
        }

        // ── MESSAGE HANDLER ───────────────────────────────────────────────────
        function handleMessage(event) {
          try {
            var m = JSON.parse(event.data);

            // ── SET_LOCATION ─────────────────────────────────────────────────
            if (m.type === 'SET_LOCATION') {
              var prevDriverMode = isDriverMode;
              isDriverMode   = m.isDriver;
              hasActiveRoute = m.hasActiveRoute || false;
              var isFull     = m.isFull || false;

              var displayLat = m.lat, displayLng = m.lng;
              if (isDriverMode && hasActiveRoute && fullRouteCoords.length > 0) {
                var snapped = updateDynamicRoute(m.lat, m.lng);
                if (snapped) { displayLat = snapped[0]; displayLng = snapped[1]; }
              }

              function makeUserIcon() {
                if (isDriverMode) {
                  var html = makeDriverMarkerHtml(isFull, hasActiveRoute);
                  // Pill is wider; idle is square
                  if (hasActiveRoute) {
                    return L.divIcon({ className: '', html: html, iconSize: [120, 36], iconAnchor: [60, 18] });
                  }
                  return L.divIcon({ className: '', html: html, iconSize: [46, 46], iconAnchor: [23, 23] });
                }
                return L.divIcon({ className: '', html: '<div class="passenger-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
              }

              if (!userMarker) {
                userMarker = L.marker([displayLat, displayLng], { icon: makeUserIcon() }).addTo(map);
                map.panTo([displayLat, displayLng]);
              } else {
                if (prevDriverMode !== isDriverMode || currentDriverFull !== isFull || hasActiveRoute !== m.hasActiveRoute) {
                  currentDriverFull = isFull;
                  userMarker.setIcon(makeUserIcon());
                }
                userMarker.setLatLng([displayLat, displayLng]);
                if (isDriverMode && hasActiveRoute) map.panTo([displayLat, displayLng], { animate: true, duration: 0.5 });
              }
            }

            // ── SET_DRIVER_STATUS ────────────────────────────────────────────
            if (m.type === 'SET_DRIVER_STATUS') {
              currentDriverFull = m.isFull;
              if (userMarker && isDriverMode) {
                var html = makeDriverMarkerHtml(m.isFull, hasActiveRoute);
                var sz   = hasActiveRoute ? [120,36] : [46,46];
                var anc  = hasActiveRoute ? [60,18]  : [23,23];
                userMarker.setIcon(L.divIcon({ className: '', html: html, iconSize: sz, iconAnchor: anc }));
              }
            }

            // ── DRAW_ZONES — driver starts a trip ────────────────────────────
            if (m.type === 'DRAW_ZONES') {
              var originLat = m.driverLat, originLng = m.driverLng;
              if (originLat === null || originLat === undefined) {
                var fallback = m.destination === 'Balacbac' ? ROUTE_WAYPOINTS_FWD[0] : ROUTE_WAYPOINTS_FWD[ROUTE_WAYPOINTS_FWD.length-1];
                originLat = fallback[0]; originLng = fallback[1];
              }
              initDriverRoute(originLat, originLng, m.destination);
            }

            // ── CLEAR_ZONES — trip ended ─────────────────────────────────────
            // Removes all route layers; map stays clean (no static route re-drawn)
            if (m.type === 'CLEAR_ZONES') {
              clearDynamicRoute();
              passengerViewRoutes.forEach(function(l) { map.removeLayer(l); });
              passengerViewRoutes = [];
              hasActiveRoute = false;
            }

            // ── SET_JEEPS ────────────────────────────────────────────────────
            if (m.type === 'SET_JEEPS') {
              var newData = {};
              m.jeeps.forEach(function(j) { newData[j.id] = j; });
              Object.keys(jeepMarkers).forEach(function(id) {
                if (!newData[id]) { map.removeLayer(jeepMarkers[id]); delete jeepMarkers[id]; }
              });
              jeepsData = newData;
              m.jeeps.forEach(function(j) {
                var full = (j.status === 'full');
                var icon = L.divIcon({ className: '', html: makeJeepMarkerHtml(full), iconSize: [44,44], iconAnchor: [22,22] });
                if (jeepMarkers[j.id]) {
                  jeepMarkers[j.id].setLatLng([j.latitude, j.longitude]);
                  jeepMarkers[j.id].setIcon(icon);
                } else {
                  var marker = L.marker([j.latitude, j.longitude], { icon: icon }).addTo(map);
                  marker.jeepId = j.id;
                  marker.on('click', function() {
                    var jd = jeepsData[this.jeepId];
                    // Show route for this jeep (passenger interaction)
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
                jeepMarkers[j.id].bindTooltip(
                  '<div class="jeep-tooltip">\\uD83D\\uDE8C To '+(j.destination||'?')+(full?' \\u2014 FULL':' \\u2014 Available')+'</div>',
                  { permanent: false, direction: 'top', offset: [0,-28] }
                );
              });
            }

            // ── SET_RIDE_REQUESTS ────────────────────────────────────────────
            if (m.type === 'SET_RIDE_REQUESTS') {
              updateRideRequestMarkers(m.requests || {});
            }

          } catch(e) { console.error('Message error:', e); }
        }

        window.addEventListener('message', handleMessage);
        document.addEventListener('message', handleMessage);
      </script>
    </body>
    </html>
  `;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: mapHtml }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        cacheEnabled={false}
        onLoad={() => setWebViewLoaded(true)}
        onError={(e) => console.error("WebView error:", e.nativeEvent)}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === "MAP_READY")       setWebViewLoaded(true);
            if (message.type === "SHOW_FARE_MODAL") setFareModalVisible(true);

if (message.type === "JEEP_TAPPED") {
     const { jeepId, destination, status } = message;
     setEtaMinutes(null); // reset
     get(ref(db, `jeep_info/${jeepId}`)).then(snap => {
       const d = snap.exists() ? snap.val() : {};
       openJeepInfoSheet({
         driverName:  d.driverName  || "Unknown Driver",
         plateNumber: d.plate       || "Not set",
         profilePic:  d.profilePic  || null,
         status:      status        || "available",
         destination: destination   || null,
       });
     }).catch(() => openJeepInfoSheet({
       driverName: "Unknown Driver", plateNumber: "Not set",
       profilePic: null, status: status || "available", destination: destination || null,
     }));

     // Fetch ETA via OSRM from jeep's current position to passenger's position
     if (currentLocationRef.current) {
       const passengerLat = currentLocationRef.current.lat;
       const passengerLng = currentLocationRef.current.lng;
       setEtaLoading(true);
       get(ref(db, `jeeps/${jeepId}`)).then(jeepSnap => {
         if (!jeepSnap.exists()) { setEtaLoading(false); return; }
         const jeep = jeepSnap.val();
         if (!jeep.latitude || !jeep.longitude) { setEtaLoading(false); return; }
         const url = `https://router.project-osrm.org/route/v1/driving/`
           + `${jeep.longitude},${jeep.latitude};${passengerLng},${passengerLat}`
           + `?overview=false&annotations=false`;
         fetch(url)
           .then(r => r.json())
           .then(data => {
             if (data.routes && data.routes[0]) {
               const secs = data.routes[0].duration;
               setEtaMinutes(Math.ceil(secs / 60));
             }
           })
           .catch(() => {})
           .finally(() => setEtaLoading(false));
       }).catch(() => setEtaLoading(false));
     }
   }
            if (message.type === "ROUTE_COMPLETED") {
              Alert.alert(
                "🏁 Route Complete!",
                "You have reached the end of the route.",
                [
                  { text: "End Trip",      style: "destructive", onPress: endTripSilent },
                  { text: "Start New Trip", onPress: async () => { await endTripSilent(); setTimeout(() => setRouteModalVisible(true), 400); } },
                ],
                { cancelable: false }
              );
            }
          } catch (e) { console.error("Message parse error:", e); }
        }}
        onHttpError={(e) => console.error("HTTP Error:", e.nativeEvent.statusCode)}
        {...(Platform.OS === "android" && {
          androidHardwareAccelerationDisabled: false,
          androidLayerType: "hardware",
        })}
      />

      {/* ── FARE CALCULATOR FAB ──────────────────────────────────────────── */}
      {role !== "driver" && (
        <TouchableOpacity style={styles.fareCalcFab} onPress={() => setFareCalcVisible(true)} activeOpacity={0.85}>
          <Calculator color="white" size={22} />
        </TouchableOpacity>
      )}


      {/* ── PASSENGER / GUEST RIDE REQUEST PANEL ────────────────────────── */}
      {role !== "driver" && (
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

      {/* ── DRIVER PANEL ─────────────────────────────────────────────────── */}
      {role === "driver" && (
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
                  <Circle size={10} color={!isFull ? "#10B981" : "#9CA3AF"} fill={!isFull ? "#10B981" : "#9CA3AF"} />
                  <Text style={[styles.statusButtonText, !isFull && styles.statusButtonTextActive]}>Available</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleStatus(true)} style={[styles.statusButton, styles.fullButton, isFull && styles.statusButtonActive]}>
                  <Circle size={10} color={isFull ? "#EF4444" : "#9CA3AF"} fill={isFull ? "#EF4444" : "#9CA3AF"} />
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
                <View style={styles.arrowContainer}><Text style={{ color: "white", fontSize: 20 }}>→</Text></View>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── DEPARTURE BANNER ─────────────────────────────────────────────── */}
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

      {/* ── JEEP INFO BOTTOM SHEET ───────────────────────────────────────── */}
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
                <Text style={styles.sheetTitle}>{selectedJeepInfo?.driverName ?? "Jeep Info"}</Text>
                <Text style={styles.sheetDriverPlate}>{selectedJeepInfo?.plateNumber ?? ""}</Text>
              </View>
              {selectedJeepInfo?.status === "full" && (
                <View style={styles.fullBadge}><Text style={styles.fullBadgeText}>FULL</Text></View>
              )}
            </View>
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, { backgroundColor: "#DBEAFE" }]}><MapPin color="#3B82F6" size={20} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Heading To</Text>
                <Text style={styles.sheetRowValue}>{selectedJeepInfo?.destination ?? "Not started"}</Text>
              </View>
            </View>
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, { backgroundColor: selectedJeepInfo?.status === "full" ? "#FEE2E2" : "#D1FAE5" }]}>
                <Circle size={20} color={selectedJeepInfo?.status === "full" ? "#EF4444" : "#10B981"} fill={selectedJeepInfo?.status === "full" ? "#EF4444" : "#10B981"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Status</Text>
                <Text style={[styles.sheetRowValue, { color: selectedJeepInfo?.status === "full" ? "#EF4444" : "#10B981" }]}>
                  {selectedJeepInfo?.status === "full" ? "Full" : "Available"}
                </Text>
              </View>
            </View>
            <View style={styles.sheetRow}>
              <View style={[styles.sheetIconBox, { backgroundColor: "#F3F4F6" }]}><Truck color="#6B7280" size={20} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>Route</Text>
              <View style={styles.sheetRow}>
                <View style={[styles.sheetIconBox, { backgroundColor: "#FEF3C7" }]}>
                  <Clock color="#D97706" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetRowLabel}>ETA to You</Text>
                  {etaLoading ? (
                    <ActivityIndicator size="small" color="#15803d" style={{ alignSelf: "flex-start", marginTop: 4 }} />
                  ) : etaMinutes !== null ? (
                    <Text style={[styles.sheetRowValue, { color: etaMinutes <= 3 ? "#15803d" : etaMinutes <= 8 ? "#D97706" : "#111827" }]}>
                      {etaMinutes <= 1 ? "Arriving now" : `~${etaMinutes} min away`}
                    </Text>
                  ) : (
                    <Text style={[styles.sheetRowValue, { color: "#9CA3AF" }]}>
                      {currentLocationRef.current ? "Calculating…" : "Enable location for ETA"}
                    </Text>
                  )}
                </View>
              </View>
                <Text style={styles.sheetRowValue}>Balacbac To Town</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.sheetCloseBtn} onPress={closeJeepInfoSheet}>
              <Text style={styles.sheetCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* ── DRIVER PROFILE SETUP MODAL ───────────────────────────────────── */}
      <Modal visible={profileModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
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

      {/* ── DESTINATION SELECTION MODAL ──────────────────────────────────── */}
      <Modal visible={routeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Destination</Text>
            <TouchableOpacity onPress={() => startTrip("Town")} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: "#DBEAFE" }]}><MapPin color="#15803d" size={24} /></View>
              <View style={{ flex: 1 }}><Text style={styles.destinationTitle}>Balacbac to Town</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => startTrip("Balacbac")} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: "#FEF3C7" }]}><MapPin color="#D97706" size={24} /></View>
              <View style={{ flex: 1 }}><Text style={styles.destinationTitle}>Town to Balacbac</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRouteModalVisible(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── RIDE REQUEST MODAL ───────────────────────────────────────────── */}
      <Modal visible={rideRequestModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Where are you going?</Text>
            <Text style={styles.profileSubtitle}>Drivers heading your way will see your location. No account needed.</Text>
            <TouchableOpacity onPress={() => submitRideRequest("Town")} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: "#DBEAFE" }]}><MapPin color="#15803d" size={24} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.destinationTitle}>Going to Town</Text>
                <Text style={{ color: "#6B7280", fontSize: 13, marginTop: 2 }}>Notifies drivers heading to Town</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => submitRideRequest("Balacbac")} style={styles.destinationCard}>
              <View style={[styles.destinationIcon, { backgroundColor: "#FEF3C7" }]}><MapPin color="#D97706" size={24} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.destinationTitle}>Going to Balacbac</Text>
                <Text style={{ color: "#6B7280", fontSize: 13, marginTop: 2 }}>Notifies drivers heading to Balacbac</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRideRequestModalVisible(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


{/* ── FARE CALCULATOR MODAL ────────────────────────────────────────────────── */}
{/* REPLACE the entire existing <Modal visible={fareCalcVisible}> block with this */}
<Modal visible={fareCalcVisible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={styles.modalTitle}>Fare Calculator</Text>
                <TouchableOpacity
                    onPress={() => { setFareCalcVisible(false); setFareFrom(""); setFareTo(""); }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <X color="#6B7280" size={24} />
                </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>From</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
                {["Town", "Shell", "Junction", "Centro", "Friendship", "Balacbac"].map(stop => (
                    <TouchableOpacity
                        key={"from-" + stop}
                        onPress={() => setFareFrom(stop)}
                        style={[styles.stopChip, fareFrom === stop && styles.stopChipActive]}
                    >
                        <Text style={[styles.stopChipText, fareFrom === stop && styles.stopChipTextActive]}>{stop}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <Text style={styles.inputLabel}>To</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
                {["Town", "Shell", "Junction", "Centro", "Friendship", "Balacbac"].map(stop => (
                    <TouchableOpacity
                        key={"to-" + stop}
                        onPress={() => setFareTo(stop)}
                        style={[styles.stopChip, fareTo === stop && styles.stopChipActive]}
                    >
                        <Text style={[styles.stopChipText, fareTo === stop && styles.stopChipTextActive]}>{stop}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* ── RESULT ── */}
            {fareFrom && fareTo && fareFrom !== fareTo ? (
                <View style={styles.fareResult}>
                    <Text style={styles.fareResultRoute}>{fareFrom} → {fareTo}</Text>

                    {/* Regular fare */}
                    <View style={fareCalcStyles.fareRow}>
                        <Text style={fareCalcStyles.fareTypeLabel}>Regular</Text>
                        <Text style={fareCalcStyles.fareAmount}>
                            ₱{getZoneFare(fareFrom, fareTo, fares, false)}
                        </Text>
                    </View>

                    {/* Discounted fare (Student / Senior / PWD) */}
                    <View style={[fareCalcStyles.fareRow, fareCalcStyles.discountedRow]}>
                        <View>
                            <Text style={fareCalcStyles.fareTypeLabel}>Discounted</Text>
                            <Text style={fareCalcStyles.fareTypeDesc}>Student · Senior · PWD</Text>
                        </View>
                        <Text style={[fareCalcStyles.fareAmount, fareCalcStyles.discountedAmount]}>
                            ₱{getZoneFare(fareFrom, fareTo, fares, true)}
                        </Text>
                    </View>
                </View>
            ) : fareFrom && fareTo && fareFrom === fareTo ? (
                <View style={[styles.fareResult, { backgroundColor: "#FEF3C7" }]}>
                    <Text style={{ color: "#92400E", fontWeight: "700", textAlign: "center" }}>
                        Please select different stops
                    </Text>
                </View>
            ) : (
                <View style={[styles.fareResult, { backgroundColor: "#F3F4F6" }]}>
                    <Text style={{ color: "#9CA3AF", textAlign: "center", fontWeight: "600" }}>
                        Select From and To stops above
                    </Text>
                </View>
            )}
        </View>
    </View>
</Modal>
      {/* ── PASSENGER COUNT / REVENUE MODAL ─────────────────────────────── */}
      <PassengerCountModal
        visible={passengerModalVisible}
        destination={currentDest}
        onCancel={() => setPassengerModalVisible(false)}
        onConfirm={async (groups: FareGroup[]) => {
          setPassengerModalVisible(false);
          if (auth.currentUser) {
            const snap = await get(ref(db, `jeep_info/${auth.currentUser.uid}`));
            const dName = snap.exists() ? (snap.val().driverName ?? "Unknown Driver") : "Unknown Driver";
            await recordTripRevenue({
              driverId:   auth.currentUser.uid,
              driverName: dName,
              groups,
              route:      currentDest === "Town" ? "Balacbac–Town" : "Town–Balacbac",
              tripId:     currentTripIdRef.current ?? `trip_${Date.now()}`,
            });
          }
          await endTripSilent();
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },

  

  fareCalcFab: {
    position: "absolute", bottom: 100, right: 16,
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#15803d",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 8, zIndex: 50,
  },

  stopChip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  stopChipActive:    { backgroundColor: "#15803d", borderColor: "#15803d" },
  stopChipText:      { fontSize: 13, fontWeight: "600", color: "#374151" },
  stopChipTextActive:{ color: "white" },
  fareResult:        { backgroundColor: "#F0FDF4", borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 8 },
  fareResultRoute:   { fontSize: 13, color: "#6B7280", fontWeight: "600", marginBottom: 4 },
  fareResultAmount:  { fontSize: 36, fontWeight: "900", color: "#15803d" },
  fareResultNote:    { fontSize: 12, color: "#6B7280", marginTop: 4 },

  passengerPanel:      { position: "absolute", bottom: 20, left: 16, right: 16, zIndex: 40 },
  rideRequestBtn:      {
    backgroundColor: "#0b600f", borderRadius: 18, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: "#04350a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  rideRequestBtnText:  { color: "white", fontWeight: "800", fontSize: 16 },
  activeRequestCard:   { backgroundColor: "white", borderRadius: 18, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  activeRequestInfo:   { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  activeRequestEmoji:  { fontSize: 28 },
  activeRequestTitle:  { fontSize: 15, fontWeight: "700", color: "#111827" },
  activeRequestSub:    { fontSize: 12, color: "#6B7280", marginTop: 2 },
  cancelRequestBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FEE2E2", borderRadius: 12, paddingVertical: 10 },
  cancelRequestText:   { color: "#DC2626", fontWeight: "700", fontSize: 14 },

  driverPanel:      { position: "absolute", bottom: 20, left: 16, right: 16 },
  activeTripCard:   { backgroundColor: "white", borderRadius: 20, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
  tripHeader:       { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  tripIconContainer:{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  tripLabel:        { fontSize: 12, color: "#6B7280", fontWeight: "600", textTransform: "uppercase" },
  tripDestination:  { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  statusButtonsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statusButton:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 18, borderRadius: 14, gap: 8, borderWidth: 2, borderColor: "#E5E7EB" },
  statusButtonActive:    { borderColor: "#15803d" },
  availableButton:       { backgroundColor: "#F0FDF4" },
  fullButton:            { backgroundColor: "#FEF2F2" },
  statusButtonText:      { fontSize: 15, fontWeight: "700", color: "#6B7280" },
  statusButtonTextActive:{ color: "#1F2937" },
  endTripBtn:       { backgroundColor: "#FEE2E2", borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  endTripText:      { color: "#DC2626", fontWeight: "700", fontSize: 15 },
  startTripCard:    { backgroundColor: "white", borderRadius: 20, padding: 20, shadowColor: "#000", shadowOpacity: 0.15, elevation: 8 },
  startTripContent: { flexDirection: "row", alignItems: "center" },
  startIconContainer:{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#15803d", alignItems: "center", justifyContent: "center", marginRight: 16 },
  startTripTitle:   { fontSize: 18, fontWeight: "700" },
  startTripSubtitle:{ fontSize: 14, color: "#6B7280" },
  arrowContainer:   { width: 32, height: 32, borderRadius: 16, backgroundColor: "#15803d", alignItems: "center", justifyContent: "center" },

  departureBanner: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "#15803d", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, paddingTop: Platform.OS === "ios" ? 52 : 14, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10, zIndex: 999 },
  departureBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  departureBannerTitle:{ color: "#fff", fontWeight: "700", fontSize: 14 },
  departureBannerMsg:  { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },

  sheetOverlay:    { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", zIndex: 100 },
  jeepInfoSheet:   { backgroundColor: "white", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20 },
  sheetHandle:     { width: 40, height: 5, backgroundColor: "#E5E7EB", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
  sheetTitle:      { fontSize: 20, fontWeight: "800", color: "#111827" },
  sheetRow:        { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  sheetIconBox:    { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sheetRowLabel:   { fontSize: 11, color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase", marginBottom: 2 },
  sheetRowValue:   { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  sheetDriverHeader:{ flexDirection: "row", alignItems: "center", marginBottom: 20 },
  sheetDriverAvatar:{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: "#E5E7EB" },
  sheetDriverAvatarFallback:{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#E5E7EB" },
  sheetDriverPlate:{ fontSize: 13, color: "#6B7280", fontWeight: "600", marginTop: 2 },
  fullBadge:       { marginLeft: "auto", backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  fullBadgeText:   { color: "#DC2626", fontWeight: "800", fontSize: 12 },
  sheetCloseBtn:   { marginTop: 20, backgroundColor: "#F3F4F6", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  sheetCloseBtnText:{ color: "#374151", fontWeight: "700", fontSize: 15 },

  modalOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent:    { backgroundColor: "white", borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
  modalHandle:     { width: 40, height: 5, backgroundColor: "#E5E7EB", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
  modalTitle:      { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  destinationCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 16, padding: 16, marginBottom: 12 },
  destinationIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginRight: 16 },
  destinationTitle:{ fontSize: 16, fontWeight: "700" },
  cancelBtn:       { marginTop: 12, paddingVertical: 16, alignItems: "center" },
  cancelText:      { color: "#6B7280", fontSize: 16, fontWeight: "600" },
  profileSubtitle: { color: "#6B7280", fontSize: 14, marginBottom: 20 },
  inputLabel:      { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  textInput:       { backgroundColor: "#F9FAFB", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#111827", marginBottom: 16 },
  saveProfileBtn:  { backgroundColor: "#15803d", borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  saveProfileBtnText:{ color: "white", fontWeight: "700", fontSize: 16 },
});


const fareCalcStyles = StyleSheet.create({
    fareRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: "rgba(21,128,61,0.12)",
        marginTop: 8,
    },
    discountedRow: {
        backgroundColor: "rgba(21,128,61,0.06)",
        borderRadius: 10,
        paddingHorizontal: 10,
        marginHorizontal: -10,
        borderTopWidth: 0,
        marginTop: 4,
    },
    fareTypeLabel: {
        fontSize: 13,
        fontWeight: "700",
        color: "#374151",
    },
    fareTypeDesc: {
        fontSize: 11,
        color: "#6B7280",
        marginTop: 1,
    },
    fareAmount: {
        fontSize: 28,
        fontWeight: "900",
        color: "#15803d",
    },
    discountedAmount: {
        fontSize: 24,
        color: "#2563eb",
    },
});
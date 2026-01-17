import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Modal, Alert } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Users, Navigation as NavIcon, RefreshCw, Crosshair } from "lucide-react-native"; 
import { ref, onValue, update, remove, get } from "firebase/database";
import { auth, db } from "../../services/firebase"; 
import { FARE_ZONES } from "../../constants/routes"; 

interface ExtendedZone {
  originalIndex: number;
  id: string;
  label: string;
  color: string;
  pts: number[][];
  targetNode?: number[];
}

// Distance helper for the Vanishing Line logic
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; 
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default function MapsScreen() {
  const navigation = useNavigation();
  const webViewRef = useRef<WebView>(null);
  
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [role, setRole] = useState('guest');
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [currentDest, setCurrentDest] = useState<'Town' | 'Balacbac' | null>(null);
  const [isJeepFull, setIsJeepFull] = useState(false);
  const [isRouteModalVisible, setIsRouteModalVisible] = useState(false);

  const activeZonesRef = useRef<ExtendedZone[]>([]); 
  const locationSub = useRef<any>(null);

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        #map { height: 100vh; width: 100vw; margin: 0; padding: 0; background: #f3f4f6; }
        .user-dot { width: 14px; height: 14px; background: #3B82F6; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.5); }
        .jeep-marker { width: 32px; height: 32px; background: #15803D; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; transition: background 0.3s; }
        .jeep-full { background: #DC2626 !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {zoomControl: false}).setView([16.4023, 120.5931], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        var userMarker = null;
        var jeepMarkers = {};
        var segments = [];

        window.addEventListener("message", (event) => {
          const m = JSON.parse(event.data);
          
          if (m.type === "SET_LOCATION") {
            if (!userMarker) userMarker = L.marker([m.lat, m.lng], {icon: L.divIcon({className: 'user-dot', iconSize: [14, 14]})}).addTo(map);
            else userMarker.setLatLng([m.lat, m.lng]);
          }
          
          if (m.type === "FOCUS") map.flyTo([m.lat, m.lng], 16);
          
          if (m.type === "CLEAR_ZONES") { 
            segments.forEach(s => map.removeLayer(s)); 
            segments = []; 
          }
          
          if (m.type === "SHIFT_ZONE") { 
            if (segments.length > 0) { map.removeLayer(segments.shift()); } 
          }
          
          if (m.type === "DRAW_ZONES") {
            segments.forEach(s => map.removeLayer(s));
            segments = [];
            m.zones.forEach((z) => {
              var poly = L.polyline(z.coords, { color: z.color, weight: 8, opacity: 0.8, lineCap: 'round' }).addTo(map);
              segments.push(poly);
            });
          }

          if (m.type === "SET_JEEPS") {
            m.jeeps.forEach(j => {
              if (jeepMarkers[j.id]) {
                jeepMarkers[j.id].setLatLng([j.lat, j.lng]);
                jeepMarkers[j.id].getElement().classList.toggle('jeep-full', j.isFull);
              } else {
                jeepMarkers[j.id] = L.marker([j.lat, j.lng], {
                    icon: L.divIcon({
                        className: 'jeep-marker' + (j.isFull ? ' jeep-full' : ''), 
                        iconSize: [32, 32], 
                        html: '🚕'
                    })
                }).addTo(map);
              }
            });
          }
        });
      </script>
    </body>
    </html>
  `;

  const drawSegmentedRoute = async (destination: 'Town' | 'Balacbac') => {
    webViewRef.current?.postMessage(JSON.stringify({ type: "CLEAR_ZONES" }));
    const baseZones: ExtendedZone[] = FARE_ZONES.map((z, i) => ({ ...z, originalIndex: i }));
    const zonesToProcess = destination === 'Town' ? [...baseZones].reverse() : [...baseZones];

    const zoneData = await Promise.all(zonesToProcess.map(async (zone) => {
      const start = destination === 'Town' ? zone.pts[1] : zone.pts[0];
      const end = destination === 'Town' ? zone.pts[0] : zone.pts[1];
      zone.targetNode = end; 

      try {
        const resp = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`);
        const data = await resp.json();
        return { coords: data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]), color: zone.color };
      } catch (e) { 
        return { coords: [], color: zone.color }; 
      }
    }));

    activeZonesRef.current = zonesToProcess;
    webViewRef.current?.postMessage(JSON.stringify({ type: "DRAW_ZONES", zones: zoneData }));
  };

  const endTrip = () => {
    if (auth.currentUser) remove(ref(db, `jeeps/${auth.currentUser.uid}`));
    setIsDriverOnline(false);
    setIsJeepFull(false);
    setCurrentDest(null);
    activeZonesRef.current = [];
    webViewRef.current?.postMessage(JSON.stringify({ type: "CLEAR_ZONES" }));
  };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation(loc.coords);
      setLoading(false);

      if (auth.currentUser) {
        const snap = await get(ref(db, `users/${auth.currentUser.uid}`));
        if (snap.exists()) setRole(snap.val().role);
      }

      locationSub.current = await Location.watchPositionAsync({ accuracy: 3, distanceInterval: 5 }, (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation(pos.coords);
        webViewRef.current?.postMessage(JSON.stringify({ type: "SET_LOCATION", lat: latitude, lng: longitude }));

        // Vanishing logic: Remove route segments as driver passes them
        if (activeZonesRef.current.length > 0) {
            const nextZone = activeZonesRef.current[0];
            if (nextZone.targetNode && getDistance(latitude, longitude, nextZone.targetNode[0], nextZone.targetNode[1]) < 100) {
                webViewRef.current?.postMessage(JSON.stringify({ type: "SHIFT_ZONE" }));
                activeZonesRef.current.shift(); 
            }
        }

        if (isDriverOnline && auth.currentUser) {
            update(ref(db, `jeeps/${auth.currentUser.uid}`), { 
                lat: latitude, 
                lng: longitude, 
                isFull: isJeepFull, 
                route: currentDest 
            });
        }
      });

      // Passenger Logic: Sync all online jeeps
      if (role !== 'driver') {
        onValue(ref(db, 'jeeps'), (snap) => {
           if (snap.exists()) {
             const data = snap.val();
             const jeeps = Object.keys(data).map(id => ({ id, ...data[id] }));
             webViewRef.current?.postMessage(JSON.stringify({ type: "SET_JEEPS", jeeps }));
           }
        });
      }
    })();
    return () => locationSub.current?.remove();
  }, [isDriverOnline, isJeepFull, currentDest, role]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#15803D" /></View>;

  return (
    <View style={s.container}>
      <WebView ref={webViewRef} source={{ html: mapHtml }} style={s.map} />
      
      <TouchableOpacity 
        style={s.centerBtn} 
        onPress={() => userLocation && webViewRef.current?.postMessage(JSON.stringify({ type: "FOCUS", lat: userLocation.latitude, lng: userLocation.longitude }))}
      >
        <Crosshair color="#374151" size={24} />
      </TouchableOpacity>
      
      {/* Driver Controls */}
      {role === 'driver' && (
        <View style={s.driverPanel}>
          {isDriverOnline && (
            <View style={s.subRow}>
              <TouchableOpacity onPress={() => currentDest && drawSegmentedRoute(currentDest)} style={s.subBtn}>
                <RefreshCw color="white" size={16} />
                <Text style={s.subBtnText}> RE-ROUTE</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => setIsJeepFull(!isJeepFull)} style={[s.subBtn, isJeepFull ? s.btnRed : s.btnGray]}>
                <Users color="white" size={16} />
                <Text style={s.subBtnText}>{isJeepFull ? " FULL" : " AVAILABLE"}</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={[s.mainBtn, isDriverOnline ? s.btnRed : s.btnGreen]} onPress={() => isDriverOnline ? endTrip() : setIsRouteModalVisible(true)}>
            <NavIcon color="white" size={18} />
            <Text style={s.mainBtnText}>{isDriverOnline ? " END TRIP" : " START DRIVING"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Route Selector Modal */}
      <Modal animationType="slide" transparent visible={isRouteModalVisible}>
        <View style={s.modalOverlay}><View style={s.modalContent}>
            <Text style={s.modalTitle}>Select Direction</Text>
            <TouchableOpacity style={[s.routeChoice, {backgroundColor: '#15803D'}]} onPress={() => { setIsRouteModalVisible(false); setIsDriverOnline(true); setCurrentDest('Town'); drawSegmentedRoute('Town'); }}>
                <Text style={s.routeChoiceText}>To Town</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.routeChoice, {backgroundColor: '#1D4ED8'}]} onPress={() => { setIsRouteModalVisible(false); setIsDriverOnline(true); setCurrentDest('Balacbac'); drawSegmentedRoute('Balacbac'); }}>
                <Text style={s.routeChoiceText}>To Balacbac</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsRouteModalVisible(false)} style={s.cancelArea}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><ArrowLeft color="black" /></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 }, map: { flex: 1 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  back: { position: 'absolute', top: 50, left: 20, backgroundColor: 'white', padding: 10, borderRadius: 10, elevation: 5 },
  centerBtn: { position: 'absolute', top: 110, right: 20, backgroundColor: 'white', padding: 10, borderRadius: 10, elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: 'white', padding: 25, borderRadius: 30, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  routeChoice: { width: '100%', padding: 18, borderRadius: 15, marginBottom: 12, alignItems: 'center' },
  routeChoiceText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cancelArea: { marginTop: 10 },
  cancelText: { color: '#9CA3AF', fontWeight: 'bold' },
  driverPanel: { position: 'absolute', bottom: 30, left: 20, right: 20 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  subBtn: { flex: 0.48, padding: 16, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#374151' },
  subBtnText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  mainBtn: { padding: 20, borderRadius: 20, alignItems: 'center', elevation: 5, flexDirection: 'row', justifyContent: 'center' },
  btnGreen: { backgroundColor: '#15803D' }, btnRed: { backgroundColor: '#DC2626' }, btnGray: { backgroundColor: '#4B5563' },
  mainBtnText: { color: 'white', fontWeight: 'bold', marginLeft: 10, fontSize: 16 },
});
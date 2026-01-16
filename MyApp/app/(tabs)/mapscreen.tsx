import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Modal } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Users, Navigation as NavIcon, RefreshCw, Crosshair } from "lucide-react-native"; 
import { ref, onValue, update, remove, get } from "firebase/database";
import { auth, db } from "../../services/firebase"; 
import { FARE_ZONES } from "../../constants/routes"; 

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
  const locationSub = useRef<any>(null);

  const mapHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" /><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" /><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>#map { height: 100vh; width: 100vw; margin: 0; padding: 0; } .user-dot { width: 14px; height: 14px; background: #3B82F6; border: 2px solid white; border-radius: 50%; } .jeep-marker { width: 32px; height: 32px; background: #15803D; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; } .jeep-full { background: #DC2626 !important; }</style></head><body><div id="map"></div><script>var map = L.map('map', {zoomControl: false}).setView([16.4023, 120.5931], 14); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map); var userMarker = null; var jeepMarkers = {}; window.addEventListener("message", (event) => { const m = JSON.parse(event.data); if (m.type === "SET_LOCATION") { if (!userMarker) userMarker = L.marker([m.lat, m.lng], {icon: L.divIcon({className: 'user-dot', iconSize: [14, 14]})}).addTo(map); else userMarker.setLatLng([m.lat, m.lng]); } if (m.type === "FOCUS") map.flyTo([m.lat, m.lng], 16); if (m.type === "SET_JEEPS") { m.jeeps.forEach(j => { if (jeepMarkers[j.id]) { jeepMarkers[j.id].setLatLng([j.lat, j.lng]); jeepMarkers[j.id].getElement().classList.toggle('jeep-full', j.isFull); } else { jeepMarkers[j.id] = L.marker([j.lat, j.lng], {icon: L.divIcon({className: 'jeep-marker', iconSize: [32, 32], html: '🚕'})}).addTo(map); } }); } });</script></body></html>`;

  const endTrip = () => {
    if (auth.currentUser) remove(ref(db, `jeeps/${auth.currentUser.uid}`));
    setIsDriverOnline(false);
    setCurrentDest(null);
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

        if (isDriverOnline && auth.currentUser) {
            update(ref(db, `jeeps/${auth.currentUser.uid}`), { lat: latitude, lng: longitude, isFull: isJeepFull, route: currentDest });
        }
      });
    })();
    return () => locationSub.current?.remove();
  }, [isDriverOnline, isJeepFull, currentDest]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#15803D" /></View>;

  return (
    <View style={s.container}>
      <WebView ref={webViewRef} source={{ html: mapHtml }} style={s.map} />
      <TouchableOpacity style={s.centerBtn} onPress={() => userLocation && webViewRef.current?.postMessage(JSON.stringify({ type: "FOCUS", lat: userLocation.latitude, lng: userLocation.longitude }))}><Crosshair color="#374151" size={24} /></TouchableOpacity>
      
      <Modal animationType="slide" transparent visible={isRouteModalVisible}>
        <View style={s.modalOverlay}><View style={s.modalContent}>
            <TouchableOpacity style={s.routeChoice} onPress={() => { setIsRouteModalVisible(false); setIsDriverOnline(true); setCurrentDest('Town'); }}><Text>To Town</Text></TouchableOpacity>
            <TouchableOpacity style={s.routeChoice} onPress={() => { setIsRouteModalVisible(false); setIsDriverOnline(true); setCurrentDest('Balacbac'); }}><Text>To Balacbac</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setIsRouteModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {role === 'driver' && (
        <View style={s.driverPanel}>
          <TouchableOpacity style={[s.mainBtn, isDriverOnline ? s.btnRed : s.btnGreen]} onPress={() => isDriverOnline ? endTrip() : setIsRouteModalVisible(true)}>
            <Text style={{color: 'white'}}>{isDriverOnline ? "END TRIP" : "START DRIVING"}</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><ArrowLeft color="black" /></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 }, map: { flex: 1 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  back: { position: 'absolute', top: 50, left: 20, backgroundColor: 'white', padding: 10, borderRadius: 10 },
  centerBtn: { position: 'absolute', top: 110, right: 20, backgroundColor: 'white', padding: 10, borderRadius: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: 'white', padding: 20, borderRadius: 20 },
  routeChoice: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  driverPanel: { position: 'absolute', bottom: 30, left: 20, right: 20 },
  mainBtn: { padding: 18, borderRadius: 20, alignItems: 'center' },
  btnGreen: { backgroundColor: '#15803D' }, btnRed: { backgroundColor: '#DC2626' },
});
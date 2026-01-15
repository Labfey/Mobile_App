import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Modal, ScrollView } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { auth, db, ref, onValue, update, remove, get } from "../../services/firebase"; 
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Calculator, Users, Navigation as NavIcon, RefreshCw, Crosshair, Gauge } from "lucide-react-native"; 
import { BALACBAC_COORD, SHAGEM_COORD } from "../../constants/routes"; 

const FARE_MATRIX = [
  { label: "Town to Shell (Min)", reg: 13.00, disc: 10.50 },
  { label: "After Shell to Junction", reg: 15.00, disc: 12.00 },
  { label: "Interior A to Centro", reg: 16.50, disc: 13.25 },
  { label: "Friendship Ville to Tierra", reg: 18.50, disc: 15.00 },
];

export default function MapsScreen() {
  const navigation = useNavigation();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [role, setRole] = useState('guest');
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [isJeepFull, setIsJeepFull] = useState(false);
  const [isRouteModalVisible, setIsRouteModalVisible] = useState(false);
  const [currentDestType, setCurrentDestType] = useState<any>(null);
  const [selectedJeep, setSelectedJeep] = useState<any>(null); 
  const [selectedFareIndex, setSelectedFareIndex] = useState(0);
  const [isDiscounted, setIsDiscounted] = useState(false);
  const locationSub = useRef<any>(null);

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        #map { height: 100vh; width: 100vw; margin: 0; padding: 0; background: #e0e0e0; }
        .user-dot { width: 14px; height: 14px; background: #3B82F6; border: 2px solid white; border-radius: 50%; }
        .jeep-marker { width: 30px; height: 30px; background: #15803D; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .jeep-full { background: #DC2626 !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {zoomControl: false}).setView([16.4023, 120.5931], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        var jeepMarkers = {};
        var userMarker = null; 
        var routeLine = L.polyline([], {color: '#15803D', weight: 5, opacity: 0.7}).addTo(map);
        window.addEventListener("message", (event) => {
          const m = JSON.parse(event.data);
          if (m.type === "FOCUS") map.flyTo([m.lat, m.lng], 16);
          if (m.type === "SET_LOCATION") {
            if (!userMarker) {
               userMarker = L.marker([m.lat, m.lng], {icon: L.divIcon({className: 'user-dot', iconSize: [14, 14]})}).addTo(map);
            } else { userMarker.setLatLng([m.lat, m.lng]); }
          }
          if (m.type === "SET_JEEPS") {
            m.jeeps.forEach(j => {
              if (jeepMarkers[j.id]) {
                jeepMarkers[j.id].setLatLng([j.lat, j.lng]);
                jeepMarkers[j.id].getElement().classList.toggle('jeep-full', j.isFull);
              } else {
                jeepMarkers[j.id] = L.marker([j.lat, j.lng], {
                  icon: L.divIcon({className: 'jeep-marker', iconSize: [30, 30], html: '🚕'})
                }).addTo(map).on('click', () => {
                  window.ReactNativeWebView.postMessage(JSON.stringify({type: 'SELECT_JEEP', jeep: j}));
                });
              }
            });
          }
          if (m.type === "SET_ROUTE") routeLine.setLatLngs(m.coords);
        });
      </script>
    </body>
    </html>
  `;

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
        (loc) => setUserLocation(loc.coords)
      );
      setLoading(false);
      if (auth.currentUser) {
        const snap = await get(ref(db, `users/${auth.currentUser.uid}`));
        if (snap.exists()) setRole(snap.val().role);
      }
    })();
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(db, 'jeeps/'), (s) => {
      const d = s.val();
      const jeepList = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
      webViewRef.current?.postMessage(JSON.stringify({ type: "SET_JEEPS", jeeps: jeepList }));
      if (selectedJeep) {
        const updated = jeepList.find(j => j.id === selectedJeep.id);
        if (updated) setSelectedJeep(updated);
      }
    });
    return () => unsub();
  }, [selectedJeep]);

  useEffect(() => {
    if (userLocation && webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: "SET_LOCATION", lat: userLocation.latitude, lng: userLocation.longitude
      }));
    }
  }, [userLocation]);

  const fetchRouteLine = async (start: any, end: any) => {
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`);
      const data = await response.json();
      if (data.routes?.[0]) {
        const points = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
        webViewRef.current?.postMessage(JSON.stringify({ type: "SET_ROUTE", coords: points }));
      }
    } catch (e) { console.log(e); }
  };

  const startDriverTracking = async (destination: 'Balacbac' | 'Town') => {
    if (!auth.currentUser) return;
    setCurrentDestType(destination);
    const destCoord = destination === 'Balacbac' ? BALACBAC_COORD : SHAGEM_COORD;
    if (userLocation) fetchRouteLine(userLocation, destCoord);
    locationSub.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10 }, (loc) => {
      const { latitude, longitude, speed } = loc.coords;
      const currentSpeed = speed && speed > 0 ? Math.round(speed * 3.6) : 0;
      update(ref(db, `jeeps/${auth.currentUser?.uid}`), { 
        lat: latitude, lng: longitude, speed: currentSpeed, 
        route: destination === 'Balacbac' ? "Town ➡️ Balacbac" : "Balacbac ➡️ Town", isFull: isJeepFull 
      });
    });
  };

  if (loading) return <ActivityIndicator size="large" style={s.center} color="#15803d" />;

  return (
    <View style={s.container}>
      <WebView 
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHtml }}
        onMessage={(e) => {
          const data = JSON.parse(e.nativeEvent.data);
          if (data.type === 'SELECT_JEEP') setSelectedJeep(data.jeep);
        }}
        style={s.map}
      />

      <TouchableOpacity style={s.centerBtn} onPress={() => userLocation && webViewRef.current?.postMessage(JSON.stringify({ type: "FOCUS", lat: userLocation.latitude, lng: userLocation.longitude }))}>
        <Crosshair color="#374151" size={24} />
      </TouchableOpacity>

      <Modal animationType="fade" transparent visible={isRouteModalVisible}>
        <View style={s.centeredView}>
          <View style={s.modalView}>
            <Text style={s.modalTitle}>Set Destination</Text>
            <TouchableOpacity style={[s.routeBtn, {backgroundColor: '#15803D'}]} onPress={() => { setIsRouteModalVisible(false); setIsDriverOnline(true); startDriverTracking('Town'); }}>
              <Text style={s.routeBtnText}>Town (Shagem St)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.routeBtn, {backgroundColor: '#1D4ED8'}]} onPress={() => { setIsRouteModalVisible(false); setIsDriverOnline(true); startDriverTracking('Balacbac'); }}>
              <Text style={s.routeBtnText}>Balacbac Terminal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {role === 'driver' && (
        <View style={s.driverControls}>
          {isDriverOnline && (
            <View style={s.subRow}>
              <TouchableOpacity onPress={() => currentDestType && userLocation && fetchRouteLine(userLocation, currentDestType === 'Balacbac' ? BALACBAC_COORD : SHAGEM_COORD)} style={s.subBtn}>
                <View style={s.row}><RefreshCw color="white" size={16} /><Text style={s.subBtnText}> RE-ROUTE</Text></View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                  const newState = !isJeepFull; setIsJeepFull(newState);
                  if (auth.currentUser) update(ref(db, `jeeps/${auth.currentUser.uid}`), { isFull: newState });
                }} style={[s.subBtn, isJeepFull ? s.btnRed : s.btnGray]}>
                <View style={s.row}><Users color="white" size={16} /><Text style={s.subBtnText}>{isJeepFull ? " FULL" : " AVAILABLE"}</Text></View>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity onPress={async () => {
            if (isDriverOnline) {
              locationSub.current?.remove();
              if (auth.currentUser) await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
              setIsDriverOnline(false); webViewRef.current?.postMessage(JSON.stringify({ type: "SET_ROUTE", coords: [] }));
            } else { setIsRouteModalVisible(true); }
          }} style={[s.mainBtn, isDriverOnline ? s.btnRed : s.btnGreen]}>
            <View style={s.row}><NavIcon color="white" size={20} /><Text style={s.mainBtnText}>{isDriverOnline ? " END TRIP" : " START TRIP"}</Text></View>
          </TouchableOpacity>
        </View>
      )}

      {selectedJeep && (
        <View style={s.infoCard}>
            <View style={s.cardHeader}>
               <View>
                 <Text style={s.cardTitle}>{selectedJeep.route}</Text>
                 <View style={s.speedBadge}>
                    <Gauge size={12} color="#15803D" />
                    <Text style={s.speedText}>{` ${selectedJeep.speed || 0} km/h`}</Text>
                 </View>
               </View>
               <TouchableOpacity onPress={() => setSelectedJeep(null)}>
                  <Text style={s.closeX}>✕</Text>
               </TouchableOpacity>
            </View>
            <View style={s.fareBox}>
               <View style={s.row}><Calculator size={14} color="#15803D" /><Text style={s.fareLabel}> Fare Estimator</Text></View>
               <ScrollView horizontal style={s.chipScroll}>
                  {FARE_MATRIX.map((f, i) => (
                    <TouchableOpacity key={i} onPress={() => setSelectedFareIndex(i)} style={[s.chip, selectedFareIndex === i && s.chipActive]}>
                      <Text style={[s.chipText, selectedFareIndex === i && {color: 'white'}]}>{f.label}</Text>
                    </TouchableOpacity>
                  ))}
               </ScrollView>
               <TouchableOpacity style={s.row} onPress={()=>setIsDiscounted(!isDiscounted)}>
                 <View style={[s.miniCheck, isDiscounted && {backgroundColor:'#15803D'}]}/>
                 <Text style={s.discText}>Discounted (Student/Senior)</Text>
               </TouchableOpacity>
               <Text style={s.total}>{`₱${(isDiscounted ? FARE_MATRIX[selectedFareIndex].disc : FARE_MATRIX[selectedFareIndex].reg).toFixed(2)}`}</Text>
            </View>
        </View>
      )}
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><ArrowLeft color="black" /></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  back: { position: 'absolute', top: 50, left: 20, backgroundColor: 'white', padding: 10, borderRadius: 10, elevation: 5 },
  centerBtn: { position: 'absolute', top: 110, left: 20, backgroundColor: 'white', padding: 10, borderRadius: 10, elevation: 5 },
  speedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, marginTop: 4 },
  speedText: { fontSize: 12, color: '#15803D', fontWeight: 'bold' },
  driverControls: { position: 'absolute', bottom: 30, left: 20, right: 20 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  subBtn: { flex: 0.48, padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#374151' },
  mainBtn: { padding: 18, borderRadius: 15, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  subBtnText: { color: 'white', fontWeight: 'bold', fontSize: 11 },
  mainBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  btnGreen: { backgroundColor: '#15803D' },
  btnRed: { backgroundColor: '#DC2626' },
  btnGray: { backgroundColor: '#4B5563' },
  infoCard: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: 'white', padding: 20, borderRadius: 25, elevation: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontWeight: 'bold', fontSize: 15, color: '#111827' },
  closeX: { fontSize: 22, color: '#9CA3AF' },
  fareBox: { marginTop: 12, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  fareLabel: { fontWeight: 'bold', color: '#15803D', fontSize: 13, marginLeft: 5 },
  chipScroll: { marginVertical: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#E5E7EB', borderRadius: 8, marginRight: 6 },
  chipActive: { backgroundColor: '#15803D' },
  chipText: { fontSize: 11, color: 'black' },
  discText: { fontSize: 12, color: '#374151' },
  miniCheck: { width: 14, height: 14, borderWidth: 1, borderColor: '#15803D', borderRadius: 3, marginRight: 8 },
  total: { fontSize: 26, fontWeight: 'bold', color: '#111827', textAlign: 'right', marginTop: 5 },
  centeredView: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalView: { margin: 30, backgroundColor: 'white', borderRadius: 25, padding: 30, alignItems: 'center', elevation: 20 },
  modalTitle: { fontSize: 19, fontWeight: 'bold', marginBottom: 20 },
  routeBtn: { width: '100%', padding: 16, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  routeBtnText: { color: 'white', fontWeight: 'bold' }
});
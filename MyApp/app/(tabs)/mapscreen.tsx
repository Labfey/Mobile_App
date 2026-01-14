import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Alert, Text, TouchableOpacity, Modal, ScrollView } from "react-native";
import MapView, { Marker, UrlTile, Polyline, Circle } from "react-native-maps";
import * as Location from "expo-location";
import { auth, db, ref, onValue, update, remove, get } from "../../services/firebase"; 
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Car, Calculator, Users, Navigation as NavIcon, RefreshCw, User } from "lucide-react-native"; 
import { BALACBAC_COORD, SHAGEM_COORD } from "../../constants/routes"; 

interface Coords {
  latitude: number;
  longitude: number;
}

const FARE_MATRIX = [
  { label: "Town to Shell (Min)", reg: 13.00, disc: 10.50 },
  { label: "After Shell to Junction", reg: 15.00, disc: 12.00 },
  { label: "Interior A to Centro", reg: 16.50, disc: 13.25 },
  { label: "Friendship Ville to Tierra", reg: 18.50, disc: 15.00 },
];

export default function MapsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [jeeps, setJeeps] = useState<any[]>([]);
  const [role, setRole] = useState<'passenger' | 'driver' | 'guest'>('guest');
  
  // DRIVER & ROUTE STATES
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [isJeepFull, setIsJeepFull] = useState(false);
  const [isRouteModalVisible, setIsRouteModalVisible] = useState(false);
  const [currentDestType, setCurrentDestType] = useState<'Balacbac' | 'Town' | null>(null);
  const [routeCoords, setRouteCoords] = useState<Coords[]>([]);
  
  // PASSENGER STATES
  const [selectedJeep, setSelectedJeep] = useState<any>(null); 
  const [selectedFareIndex, setSelectedFareIndex] = useState(0);
  const [isDiscounted, setIsDiscounted] = useState(false);
  
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const headingSub = useRef<Location.LocationSubscription | null>(null);

  // --- ROUTE LINE FETCHING ---
  const fetchRouteLine = async (start: Coords, end: Coords) => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`
      );
      const data = await response.json();
      if (data.routes && data.routes[0]) {
        const points = data.routes[0].geometry.coordinates.map((c: number[]) => ({
          latitude: c[1],
          longitude: c[0],
        }));
        setRouteCoords(points);
      }
    } catch (error) {
      console.log("Route Line Error:", error);
    }
  };

  // --- DRIVER TRACKING ---
  const startDriverTracking = async (destination: 'Balacbac' | 'Town') => {
    if (!auth.currentUser) return;
    setCurrentDestType(destination);
    const destCoord = destination === 'Balacbac' ? BALACBAC_COORD : SHAGEM_COORD;

    if (userLocation) fetchRouteLine(userLocation, destCoord);

    headingSub.current = await Location.watchHeadingAsync((h) => {
      if (isDriverOnline && auth.currentUser) {
        update(ref(db, `jeeps/${auth.currentUser.uid}`), { heading: h.magHeading });
      }
    });

    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      (location) => {
        const currentPos = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        setUserLocation(currentPos);
        update(ref(db, `jeeps/${auth.currentUser?.uid}`), {
          lat: currentPos.latitude,
          lng: currentPos.longitude,
          route: destination === 'Balacbac' ? "Town ➡️ Balacbac" : "Balacbac ➡️ Town",
          isFull: isJeepFull
        });
      }
    );
  };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      // Continuous background location for the passenger icon
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
      setJeeps(d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : []);
    });
    return () => unsub();
  }, []);

  if (loading) return <ActivityIndicator size="large" style={s.center} color="#15803d" />;

  return (
    <View style={s.container}>
      <Modal animationType="fade" transparent={true} visible={isRouteModalVisible}>
        <View style={s.centeredView}>
          <View style={s.modalView}>
            <Text style={s.modalTitle}>Where are you headed?</Text>
            <TouchableOpacity style={[s.routeBtn, {backgroundColor: '#15803D'}]} onPress={() => { setIsRouteModalVisible(false); setIsDriverOnline(true); startDriverTracking('Town'); }}>
              <Text style={s.routeBtnText}>Town (Shagem St)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.routeBtn, {backgroundColor: '#1D4ED8'}]} onPress={() => { setIsRouteModalVisible(false); setIsDriverOnline(true); startDriverTracking('Balacbac'); }}>
              <Text style={s.routeBtnText}>Balacbac Terminal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <MapView style={s.map} initialRegion={{ latitude: 16.4023, longitude: 120.5931, latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
        
        {/* PASSENGER / MY LOCATION MARKER */}
        {userLocation && (
          <Marker coordinate={userLocation} title="You are here" anchor={{x: 0.5, y: 0.5}}>
             <View style={s.userMarkerContainer}>
                <View style={s.userMarkerPulse} />
                <View style={s.userMarkerInner}>
                   <User size={14} color="white" fill="white" />
                </View>
             </View>
          </Marker>
        )}

        {/* ROUTE LINE (For Drivers) */}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeColor="#15803D" strokeWidth={5} />
        )}

        {/* JEEP MARKERS */}
        {jeeps.map((j) => (
           <Marker key={j.id} coordinate={{ latitude: j.lat, longitude: j.lng }} rotation={j.heading || 0} flat={true} onPress={() => setSelectedJeep(j)}>
              <View style={[s.jeepIcon, j.isFull && s.jeepFull]}>
                <Car size={20} color="white" fill="white" />
              </View>
           </Marker>
        ))}
      </MapView>

      {/* UI CONTROLS - RECALCULATE & CAPACITY */}
      {role === 'driver' && (
        <View style={s.driverControls}>
          {isDriverOnline && (
            <View style={s.subRow}>
              <TouchableOpacity onPress={() => {
                if (userLocation && currentDestType) {
                   const dest = currentDestType === 'Balacbac' ? BALACBAC_COORD : SHAGEM_COORD;
                   fetchRouteLine(userLocation, dest);
                }
              }} style={s.subBtn}>
                <RefreshCw color="white" size={16} /><Text style={s.subBtnText}> RE-ROUTE</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                  const newState = !isJeepFull;
                  setIsJeepFull(newState);
                  if (auth.currentUser) update(ref(db, `jeeps/${auth.currentUser.uid}`), { isFull: newState });
                }} style={[s.subBtn, isJeepFull ? s.btnRed : s.btnGray]}>
                <Users color="white" size={16} /><Text style={s.subBtnText}> {isJeepFull ? "FULL" : "AVAILABLE"}</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity onPress={async () => {
            if (isDriverOnline) {
              locationSub.current?.remove(); headingSub.current?.remove();
              if (auth.currentUser) await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
              setIsDriverOnline(false); setRouteCoords([]);
            } else { setIsRouteModalVisible(true); }
          }} style={[s.mainBtn, isDriverOnline ? s.btnRed : s.btnGreen]}>
            <NavIcon color="white" size={20} /><Text style={s.mainBtnText}>{isDriverOnline ? " END TRIP" : " START TRIP"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PASSENGER FARE CARD */}
      {selectedJeep && (
        <View style={s.infoCard}>
            <View style={s.cardHeader}>
               <Text style={s.cardTitle}>{selectedJeep.route}</Text>
               <TouchableOpacity onPress={() => setSelectedJeep(null)}><Text style={{fontSize: 22}}>✕</Text></TouchableOpacity>
            </View>
            <View style={s.fareBox}>
               <Text style={s.fareLabel}><Calculator size={14}/> Fare Estimator</Text>
               <ScrollView horizontal style={{marginVertical: 10}}>{FARE_MATRIX.map((f, i) => (
                  <TouchableOpacity key={i} onPress={() => setSelectedFareIndex(i)} style={[s.chip, selectedFareIndex === i && s.chipActive]}>
                    <Text style={{fontSize: 11, color: selectedFareIndex === i ? 'white' : 'black'}}>{f.label}</Text>
                  </TouchableOpacity>
                ))}</ScrollView>
               <TouchableOpacity style={{flexDirection:'row', alignItems:'center'}} onPress={()=>setIsDiscounted(!isDiscounted)}>
                 <View style={[s.miniCheck, isDiscounted && {backgroundColor:'#15803D'}]}/><Text style={{fontSize:12}}> Discounted (Student/Senior)</Text>
               </TouchableOpacity>
               <Text style={s.total}>₱{(isDiscounted ? FARE_MATRIX[selectedFareIndex].disc : FARE_MATRIX[selectedFareIndex].reg).toFixed(2)}</Text>
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
  back: { position: 'absolute', top: 50, left: 20, backgroundColor: 'white', padding: 10, borderRadius: 10, elevation: 5 },
  // USER MARKER STYLES
  userMarkerContainer: { alignItems: 'center', justifyContent: 'center' },
  userMarkerPulse: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(59, 130, 246, 0.3)' },
  userMarkerInner: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#3B82F6', borderWidth: 2, borderColor: 'white', alignItems: 'center', justifyContent: 'center' },
  // DRIVER UI
  driverControls: { position: 'absolute', bottom: 30, left: 20, right: 20 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  subBtn: { flex: 0.48, padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#374151' },
  mainBtn: { padding: 18, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  subBtnText: { color: 'white', fontWeight: 'bold', fontSize: 11 },
  mainBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  btnGreen: { backgroundColor: '#15803D' },
  btnRed: { backgroundColor: '#DC2626' },
  btnGray: { backgroundColor: '#4B5563' },
  // JEEP ICONS
  jeepIcon: { backgroundColor: '#15803D', padding: 6, borderRadius: 20, borderWidth: 2, borderColor: 'white', elevation: 5 },
  jeepFull: { backgroundColor: '#DC2626' },
  // INFO CARD
  infoCard: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: 'white', padding: 20, borderRadius: 25, elevation: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: 'bold', fontSize: 16, color: '#111827' },
  fareBox: { marginTop: 12, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  fareLabel: { fontWeight: 'bold', color: '#15803D', fontSize: 13 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#E5E7EB', borderRadius: 8, marginRight: 6 },
  chipActive: { backgroundColor: '#15803D' },
  total: { fontSize: 26, fontWeight: 'bold', color: '#111827', textAlign: 'right', marginTop: 5 },
  miniCheck: { width: 14, height: 14, borderWidth: 1, borderColor: '#15803D', borderRadius: 3, marginRight: 5 },
  centeredView: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalView: { margin: 30, backgroundColor: 'white', borderRadius: 25, padding: 30, alignItems: 'center', elevation: 20 },
  modalTitle: { fontSize: 19, fontWeight: 'bold', marginBottom: 20 },
  routeBtn: { width: '100%', padding: 16, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  routeBtnText: { color: 'white', fontWeight: 'bold' }
});
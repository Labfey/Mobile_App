import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Alert, Text, TouchableOpacity } from "react-native";
import MapView, { Marker, UrlTile, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { auth, db, ref, onValue, update, remove, get } from "../../services/firebase"; 
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Navigation, Star, Car } from "lucide-react-native"; 
import { BALACBAC_COORD, BURNHAM_COORD, FALLBACK_ROUTE } from "../../constants/routes"; 

export default function MapsScreen() {
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  
  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [userHeading, setUserHeading] = useState(0); 
  
  const [jeeps, setJeeps] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [role, setRole] = useState<'passenger' | 'driver' | 'guest'>('guest');
  
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>(FALLBACK_ROUTE);
  const [routeDistance, setRouteDistance] = useState<string>("");

  // Driver Status
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [isJeepFull, setIsJeepFull] = useState(false);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const headingSubscription = useRef<Location.LocationSubscription | null>(null);

  // 1. INITIAL SETUP
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need location access to show jeeps.');
        return;
      }

      // Get initial location
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation(location.coords);
      setLoading(false);

      // START WATCHING HEADING (Compass)
      headingSubscription.current = await Location.watchHeadingAsync((obj) => {
        setUserHeading(obj.magHeading);
      });

      if (auth.currentUser) {
        const userRef = ref(db, `users/${auth.currentUser.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setRole(snapshot.val().role);
        }
      }
      fetchRealRoute();
    })();

    return () => {
      if (locationSubscription.current) locationSubscription.current.remove();
      if (headingSubscription.current) headingSubscription.current.remove();
    };
  }, []);

  //  NEW: CLEANUP GHOST DATA
  //  If you are NOT a driver, remove any stale "Jeep" record 
  //  associated with your account to prevent map overlaps.
  useEffect(() => {
    if (auth.currentUser && role !== 'driver') {
       remove(ref(db, `jeeps/${auth.currentUser.uid}`))
         .catch(err => console.log("Cleanup error:", err));
    }
  }, [role]);

  // 2. FETCH REAL ROUTE
  const fetchRealRoute = async () => {
    try {
      const start = `${BALACBAC_COORD.longitude},${BALACBAC_COORD.latitude}`;
      const end = `${BURNHAM_COORD.longitude},${BURNHAM_COORD.latitude}`;
      const response = await fetch(
        `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`
      );
      const json = await response.json();
      if (json.routes && json.routes.length > 0) {
        const points = json.routes[0].geometry.coordinates.map((coord: number[]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        setRouteCoordinates(points);
        const meters = json.routes[0].distance;
        setRouteDistance((meters / 1000).toFixed(1) + " km");
      }
    } catch (error) { console.log(error); }
  };

  // 3. LISTENERS
  useEffect(() => {
    const jeepsRef = ref(db, 'jeeps/');
    const unsub = onValue(jeepsRef, (s) => {
      const d = s.val();
      setJeeps(d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : []);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (role !== 'driver') return;
    const passRef = ref(db, 'passengers/');
    const unsub = onValue(passRef, (s) => {
      const d = s.val();
      setPassengers(d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : []);
    });
    return () => unsub();
  }, [role]);

  // 4. DRIVER LOGIC
  const toggleDriverStatus = async () => {
      if (!auth.currentUser) return;
      if (isDriverOnline) {
        if (locationSubscription.current) locationSubscription.current.remove();
        await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
        setIsDriverOnline(false);
      } else {
        setIsDriverOnline(true);
        locationSubscription.current = await Location.watchPositionAsync(
          { distanceInterval: 10, accuracy: Location.Accuracy.High },
          (loc) => {
            update(ref(db, `jeeps/${auth.currentUser?.uid}`), {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              heading: loc.coords.heading || 0, 
              route: "Balacbac – Town",
              plate: "ABC-123",
              isFull: isJeepFull 
            });
          }
        );
      }
    };

  if (loading) return <ActivityIndicator size="large" style={s.center} color="#15803d" />;

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        initialRegion={{
          latitude: 16.4000, 
          longitude: 120.5900,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />

        {/* --- REAL ROUTE --- */}
        <Polyline 
          coordinates={routeCoordinates} 
          strokeColor="#0ea5e9" 
          strokeWidth={6}
          lineJoin="round"
          lineCap="round"
        />

        {/* --- DESTINATION --- */}
        <Marker coordinate={BURNHAM_COORD} title="Burnham Park" anchor={{x: 0.5, y: 1}}>
          <View style={s.pinContainer}>
            <View style={s.pinHead}>
              <Star size={12} color="white" fill="white" />
            </View>
            <View style={s.pinStick} />
          </View>
        </Marker>
        
        {/* --- ORIGIN --- */}
        <Marker coordinate={BALACBAC_COORD} title="Balacbac Terminal" anchor={{x: 0.5, y: 0.5}}>
           <View style={s.originDot} />
        </Marker>

        {/* --- 1. USER MARKER (ROTATING ARROW) --- */}
        {userLocation && (
          <Marker 
            coordinate={userLocation} 
            title="You" 
            anchor={{x: 0.5, y: 0.5}}
            flat={true}
            zIndex={999} // Always on top
          >
             <View style={s.haloCircle}>
               <View style={{ transform: [{ rotate: `${userHeading}deg` }] }}>
                  <Navigation size={28} color="#3b82f6" fill="#3b82f6" /> 
               </View>
             </View>
          </Marker>
        )}
        
        {/* --- 2. JEEPNEY MARKER --- */}
        {jeeps.map((j) => (
           j.lat && j.lng ? (
             <Marker
               key={j.id}
               coordinate={{ latitude: j.lat, longitude: j.lng }}
               anchor={{x: 0.5, y: 0.5}}
               title={j.route}
               flat={true} 
               zIndex={1} // Keep below user
             >
                <View style={s.haloCircle}>
                   <View style={{ transform: [{ rotate: `${j.heading || 0}deg` }] }}>
                      <Car size={32} color={j.isFull ? "#ef4444" : "#15803d"} fill={j.isFull ? "#ef4444" : "#15803d"} />
                   </View>
                </View>
             </Marker>
           ) : null
        ))}

      </MapView>
      
      {/* INFO BADGE */}
      <View style={s.distanceBadge}>
         <Text style={s.distanceText}>Balacbac ↔ Town • {routeDistance || "Calculating..."}</Text>
      </View>
      
      {/* DRIVER CONTROLS */}
      {role === 'driver' && (
        <View style={s.controlPanel}>
          <Text style={s.roleText}>Driver Controls</Text>
          <TouchableOpacity 
            onPress={toggleDriverStatus}
            style={[s.btn, isDriverOnline ? s.btnRed : s.btnGreen]}
          >
            <Car color="white" size={20} />
            <Text style={s.btnText}>{isDriverOnline ? " GO OFFLINE" : " START TRIP"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
        <ArrowLeft color="#1e293b" size={24} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  
  haloCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)',
  },

  pinContainer: { alignItems: 'center', width: 40, height: 40 },
  pinHead: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white', zIndex: 2 },
  pinStick: { width: 2, height: 12, backgroundColor: '#ef4444', marginTop: -2, zIndex: 1 },

  originDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: 'black', borderWidth: 3, borderColor: 'white' },

  backBtn: { position: 'absolute', top: 50, left: 20, backgroundColor: 'white', padding: 10, borderRadius: 12, elevation: 5 },
  distanceBadge: { position: 'absolute', top: 50, right: 20, backgroundColor: 'white', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, elevation: 5 },
  distanceText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  controlPanel: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: 'white', padding: 20, borderRadius: 20, elevation: 10 },
  roleText: { fontWeight: 'bold', color: 'gray', marginBottom: 10, textAlign: 'center'},
  btn: { padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnGreen: { backgroundColor: '#15803D' },
  btnRed: { backgroundColor: '#DC2626' },
  btnText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },
});
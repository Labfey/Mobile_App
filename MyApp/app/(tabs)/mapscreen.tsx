import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Alert } from "react-native";
import MapView, { Marker, UrlTile, Polyline, Callout } from "react-native-maps";
import * as Location from "expo-location";
import { auth, db, ref, onValue, update, set, remove, get } from "../../services/firebase"; 
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Users, UserPlus, Car } from "lucide-react-native";
import { BALACBAC_ROUTE } from "../../constants/routes"; 

export default function MapsScreen() {
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  
  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [jeeps, setJeeps] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [role, setRole] = useState<'passenger' | 'driver' | 'guest'>('guest');

  // Driver Status
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [isJeepFull, setIsJeepFull] = useState(false);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  // Passenger Status
  const [isHailing, setIsHailing] = useState(false);

  // 1. INITIAL SETUP
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need location access to show jeeps.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation(location.coords);
      setLoading(false);

      if (auth.currentUser) {
        const userRef = ref(db, `users/${auth.currentUser.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setRole(snapshot.val().role);
        }
      }
    })();

    // Cleanup on unmount
    return () => {
      if (locationSubscription.current) locationSubscription.current.remove();
    };
  }, []);

  // 2. FETCH JEEPS (Realtime) - Req #7
  useEffect(() => {
    const jeepsRef = ref(db, 'jeeps/');
    const unsub = onValue(jeepsRef, (snapshot) => {
      const data = snapshot.val();
      setJeeps(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
    });
    return () => unsub();
  }, []);

  // 3. FETCH PASSENGERS (Drivers Only) - Req #6
  useEffect(() => {
    if (role !== 'driver') return;
    const passRef = ref(db, 'passengers/');
    const unsub = onValue(passRef, (snapshot) => {
      const data = snapshot.val();
      setPassengers(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
    });
    return () => unsub();
  }, [role]);

  // 4. DRIVER LOGIC - Req #1
  const toggleDriverStatus = async () => {
    if (!auth.currentUser) return;

    if (isDriverOnline) {
      // GOING OFFLINE
      if (locationSubscription.current) locationSubscription.current.remove();
      await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
      setIsDriverOnline(false);
    } else {
      // GOING ONLINE
      setIsDriverOnline(true);
      
      // Start tracking
      locationSubscription.current = await Location.watchPositionAsync(
        { distanceInterval: 10, accuracy: Location.Accuracy.High },
        (loc) => {
          // Update location ONLY. Use a separate function for status updates to avoid closure staleness.
          update(ref(db, `jeeps/${auth.currentUser?.uid}`), {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            route: "Balacbac – Town", // Hardcoded for this demo
            plate: "ABC-123"
          });
        }
      );
    }
  };

  const toggleCapacity = async () => {
    // Immediate UI update
    const newStatus = !isJeepFull;
    setIsJeepFull(newStatus);
    
    // Immediate DB update
    if (isDriverOnline && auth.currentUser) {
      await update(ref(db, `jeeps/${auth.currentUser.uid}`), {
        isFull: newStatus
      });
    }
  };

  // 5. PASSENGER LOGIC
  const toggleHail = async () => {
    if (role === 'guest') {
      Alert.alert("Guest Mode", "Please log in to hail a jeep.");
      return;
    }
    if (!auth.currentUser || !userLocation) return;

    if (isHailing) {
      await remove(ref(db, `passengers/${auth.currentUser.uid}`));
      setIsHailing(false);
    } else {
      await set(ref(db, `passengers/${auth.currentUser.uid}`), {
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        name: "Waiting Passenger"
      });
      setIsHailing(true);
    }
  };

  if (loading) return <ActivityIndicator size="large" style={s.center} color="#15803d" />;

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        initialRegion={{
          latitude: 16.4023, // Centered on route
          longitude: 120.5960,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />

        {/* Req #2: Route Line */}
        <Polyline coordinates={BALACBAC_ROUTE} strokeColor="#15803d" strokeWidth={5} />

        {/* User Marker */}
        {userLocation && (
          <Marker coordinate={userLocation} title="You">
             <View style={s.userDot} />
          </Marker>
        )}

        {/* Jeep Markers */}
        {jeeps.map((j) => (
           j.lat && j.lng ? (
             <Marker
               key={j.id}
               coordinate={{ latitude: j.lat, longitude: j.lng }}
               pinColor={j.isFull ? "red" : "green"} // Red = Full, Green = Available
             >
                <Callout tooltip>
                  <View style={s.callout}>
                    <Text style={s.calloutTitle}>{j.route}</Text>
                    <Text style={{color: j.isFull ? 'red' : 'green', fontWeight:'bold'}}>
                      {j.isFull ? "FULL CAPACITY" : "SEATS AVAILABLE"}
                    </Text>
                  </View>
                </Callout>
             </Marker>
           ) : null
        ))}

        {/* Passenger Markers (Driver Only) */}
        {role === 'driver' && passengers.map((p) => (
           <Marker
             key={p.id}
             coordinate={{ latitude: p.lat, longitude: p.lng }}
             pinColor="orange"
             title="Passenger Here"
           />
        ))}
      </MapView>

      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
        <ArrowLeft color="black" size={24} />
      </TouchableOpacity>

      {/* DRIVER CONTROLS */}
      {role === 'driver' && (
        <View style={s.controlPanel}>
          <Text style={s.roleText}>Driver Controls</Text>
          <View style={s.row}>
            <TouchableOpacity 
              onPress={toggleDriverStatus}
              style={[s.btn, isDriverOnline ? s.btnRed : s.btnGreen, {flex: 1, marginRight: 8}]}
            >
              <Car color="white" size={20} />
              <Text style={s.btnText}>{isDriverOnline ? " GO OFFLINE" : " START TRIP"}</Text>
            </TouchableOpacity>

            {isDriverOnline && (
              <TouchableOpacity 
                onPress={toggleCapacity}
                style={[s.btn, isJeepFull ? s.btnGreen : s.btnOrange, {flex: 1}]}
              >
                <Users color="white" size={20} />
                <Text style={s.btnText}>{isJeepFull ? " SET: OPEN" : " SET: FULL"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* PASSENGER CONTROLS */}
      {(role === 'passenger' || role === 'guest') && (
        <View style={s.controlPanel}>
           <Text style={s.roleText}>Passenger Actions</Text>
           <TouchableOpacity 
              onPress={toggleHail}
              style={[s.btn, isHailing ? s.btnRed : s.btnBlue]}
            >
              <UserPlus color="white" size={20} />
              <Text style={s.btnText}>
                {isHailing ? " CANCEL HAIL" : role === 'guest' ? " LOGIN TO HAIL" : " HAIL JEEP"}
              </Text>
            </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  backBtn: { position: 'absolute', top: 50, left: 20, backgroundColor: 'white', padding: 10, borderRadius: 25, elevation: 5 },
  userDot: { width: 15, height: 15, borderRadius: 10, backgroundColor: '#2563EB', borderWidth: 2, borderColor: 'white' },
  controlPanel: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: 'white', padding: 20, borderRadius: 20, elevation: 10 },
  roleText: { fontWeight: 'bold', color: 'gray', marginBottom: 10, textAlign: 'center'},
  row: { flexDirection: 'row' },
  btn: { padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnGreen: { backgroundColor: '#15803D' },
  btnRed: { backgroundColor: '#DC2626' },
  btnBlue: { backgroundColor: '#2563EB' },
  btnOrange: { backgroundColor: '#F97316' },
  btnText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },
  callout: { backgroundColor: 'white', padding: 10, borderRadius: 8, width: 150, alignItems: 'center' },
  calloutTitle: { fontWeight: 'bold', marginBottom: 5 }
});
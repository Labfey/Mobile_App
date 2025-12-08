import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Alert, Image } from "react-native";
import MapView, { Marker, UrlTile, Polyline, Callout } from "react-native-maps";
import * as Location from "expo-location";
import { auth, db, ref, onValue, update, set, remove, get } from "../../services/firebase"; 
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Users, UserPlus } from "lucide-react-native";
import { BALACBAC_ROUTE } from "../../constants/routes"; 

export default function MapsScreen() {
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<any>(null);
  
  // Data State
  const [jeeps, setJeeps] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [role, setRole] = useState<'passenger' | 'driver' | 'guest'>('guest');

  // Driver Specific State
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [isJeepFull, setIsJeepFull] = useState(false);

  // Passenger Specific State
  const [isHailing, setIsHailing] = useState(false);

  // 1. Initial Setup: Get Role & Current Location
  useEffect(() => {
    (async () => {
      // Get Permissions
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission to access location was denied');
        return;
      }

      // Get Location
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation(location.coords);
      setLoading(false);

      // Determine Role from Firebase
      if (auth.currentUser) {
        const userRef = ref(db, `users/${auth.currentUser.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setRole(snapshot.val().role);
        }
      }
    })();
  }, []);

  // 2. Listener: Fetch Jeeps (For Everyone)
  useEffect(() => {
    const jeepsRef = ref(db, 'jeeps/');
    const unsub = onValue(jeepsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setJeeps(Object.keys(data).map(key => ({ id: key, ...data[key] })));
      } else {
        setJeeps([]);
      }
    });
    return () => unsub();
  }, []);

  // 3. Listener: Fetch Passengers (Only for Drivers)
  useEffect(() => {
    if (role !== 'driver') return; // Passengers don't need to see other passengers

    const passRef = ref(db, 'passengers/');
    const unsub = onValue(passRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setPassengers(Object.keys(data).map(key => ({ id: key, ...data[key] })));
      } else {
        setPassengers([]);
      }
    });
    return () => unsub();
  }, [role]);

  // 4. Logic: Driver Toggles Online/Offline & Capacity
  const toggleDriverStatus = async () => {
    if (!auth.currentUser) return;
    
    if (isDriverOnline) {
      // Go Offline
      await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
      setIsDriverOnline(false);
    } else {
      // Go Online (Start broadcasting)
      setIsDriverOnline(true);
      // Start watching position
      Location.watchPositionAsync({ distanceInterval: 10 }, (loc) => {
        if (isDriverOnline) {
           update(ref(db, `jeeps/${auth.currentUser?.uid}`), {
             lat: loc.coords.latitude,
             lng: loc.coords.longitude,
             isFull: isJeepFull, // Send capacity status
             plate: "ABC-123", // Ideally fetch this from profile
             route: "Balacbac"
           });
        }
      });
    }
  };

  const toggleCapacity = async () => {
    const newStatus = !isJeepFull;
    setIsJeepFull(newStatus);
    if (isDriverOnline && auth.currentUser) {
      await update(ref(db, `jeeps/${auth.currentUser.uid}`), {
        isFull: newStatus
      });
    }
  };

  // 5. Logic: Passenger Hails Jeep
  const toggleHail = async () => {
    if (!auth.currentUser || !userLocation) return;

    if (isHailing) {
      // Stop Hailing
      await remove(ref(db, `passengers/${auth.currentUser.uid}`));
      setIsHailing(false);
    } else {
      // Start Hailing
      await set(ref(db, `passengers/${auth.currentUser.uid}`), {
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        name: "Waiting Passenger"
      });
      setIsHailing(true);
    }
  };

  if (loading) return <ActivityIndicator size="large" style={s.center} />;

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        initialRegion={{
          latitude: 16.4143,
          longitude: 120.5988,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />

        {/* ✅ ROUTE LINE */}
        <Polyline 
          coordinates={BALACBAC_ROUTE}
          strokeColor="#2E7D32" // JeepRoute Green
          strokeWidth={4}
        />

        {/* User Marker */}
        {userLocation && (
          <Marker coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }} title="You" pinColor="blue" />
        )}

        {/* ✅ JEEP MARKERS (Color coded by Capacity) */}
        {jeeps.map((j) => {
           if(!j.lat || !j.lng) return null;
           return (
             <Marker
               key={j.id}
               coordinate={{ latitude: j.lat, longitude: j.lng }}
               // Red if Full, Green if Available
               pinColor={j.isFull ? "red" : "green"} 
               title={j.isFull ? "Jeep (FULL)" : "Jeep (Available)"}
             >
                {/* Optional: Custom Icon for Jeep */}
                <Callout>
                  <View style={{padding: 5}}>
                    <Text style={{fontWeight:'bold'}}>{j.route || "Jeep"}</Text>
                    <Text>{j.isFull ? "🔴 FULL SEATING" : "🟢 SEATS AVAILABLE"}</Text>
                  </View>
                </Callout>
             </Marker>
           )
        })}

        {/* ✅ PASSENGER MARKERS (Only visible to Driver) */}
        {role === 'driver' && passengers.map((p) => (
           <Marker
             key={p.id}
             coordinate={{ latitude: p.lat, longitude: p.lng }}
             pinColor="yellow"
             title="Passenger Waiting"
           />
        ))}
      </MapView>

      {/* Back Button */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
        <ArrowLeft color="black" size={24} />
      </TouchableOpacity>

      {/* ================= CONTROLS ================= */}
      
      {/* DRIVER CONTROLS */}
      {role === 'driver' && (
        <View style={s.controlPanel}>
          <Text style={s.roleText}>Driver Mode</Text>
          <View style={{flexDirection: 'row', gap: 10}}>
            <TouchableOpacity 
              onPress={toggleDriverStatus}
              style={[s.btn, isDriverOnline ? s.btnRed : s.btnGreen, {flex:1}]}
            >
              <Text style={s.btnText}>{isDriverOnline ? "GO OFFLINE" : "GO ONLINE"}</Text>
            </TouchableOpacity>

            {isDriverOnline && (
              <TouchableOpacity 
                onPress={toggleCapacity}
                style={[s.btn, isJeepFull ? s.btnRed : s.btnGreen, {flex:1}]}
              >
                <Users color="white" size={20} />
                <Text style={s.btnText}>{isJeepFull ? " SET: AVAILABLE" : " SET: FULL"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* PASSENGER CONTROLS */}
      {role === 'passenger' && (
        <View style={s.controlPanel}>
           <Text style={s.roleText}>Passenger Mode</Text>
           <TouchableOpacity 
              onPress={toggleHail}
              style={[s.btn, isHailing ? s.btnRed : s.btnBlue, {flexDirection:'row', justifyContent:'center', gap: 10}]}
            >
              <UserPlus color="white" size={20} />
              <Text style={s.btnText}>{isHailing ? "CANCEL HAIL" : "HAIL JEEP (Broadcast Location)"}</Text>
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
  
  controlPanel: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  roleText: { fontWeight: 'bold', color: 'gray', marginBottom: 10, textAlign: 'center'},
  btn: { padding: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnGreen: { backgroundColor: '#15803D' },
  btnRed: { backgroundColor: '#DC2626' },
  btnBlue: { backgroundColor: '#2563EB' },
  btnText: { color: 'white', fontWeight: 'bold' }
});
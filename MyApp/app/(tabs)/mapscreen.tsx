import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, StyleSheet, ActivityIndicator, Alert, Text, TouchableOpacity, Modal, Pressable } from "react-native";
import MapView, { Marker, UrlTile, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { auth, db, ref, onValue, update, remove, get } from "../../services/firebase"; 
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Navigation, Star, Car, User, MapPin } from "lucide-react-native"; 
// Assuming FALLBACK_ROUTE is defined in constants/routes, using BURNHAM_COORD for default map center
import { BALACBAC_COORD, BURNHAM_COORD, SHAGEM_COORD } from "../../constants/routes"; 

// Define a basic structure for Coordinates
interface Coords {
  latitude: number;
  longitude: number;
}

export default function MapsScreen() {
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  
  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [userHeading, setUserHeading] = useState(0); 
  
  const [jeeps, setJeeps] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [role, setRole] = useState<'passenger' | 'driver' | 'guest'>('guest');
  
  // DRIVER STATE
  const [routeCoordinates, setRouteCoordinates] = useState<Coords[]>([]);
  const [routeDistance, setRouteDistance] = useState<string>("");
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [isJeepFull, setIsJeepFull] = useState(false);
  const [isRouteModalVisible, setIsRouteModalVisible] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<'Balacbac' | 'Town' | null>(null);
  
  // *** NEW PASSENGER STATE ***
  const [selectedJeep, setSelectedJeep] = useState<any>(null); // The jeep the passenger clicked
  const [passengerRouteCoordinates, setPassengerRouteCoordinates] = useState<Coords[]>([]);
  const [passengerRouteDistance, setPassengerRouteDistance] = useState<string>("");
  // ***************************
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const headingSubscription = useRef<Location.LocationSubscription | null>(null);


  // --- 1. ROUTE FETCHING LOGIC (Made reusable) ---
  const determineDestination = (routeLabel: string) => {
      if (routeLabel.includes('Balacbac ➡️ Town')) return SHAGEM_COORD;
      if (routeLabel.includes('Town ➡️ Balacbac')) return BALACBAC_COORD;
      return null;
  }
  
  const fetchRoute = useCallback(async (currentLoc: Coords, routeLabel: string, setCoords: (c: Coords[]) => void, setDist: (d: string) => void) => {
      const destinationCoord = determineDestination(routeLabel);
      if (!destinationCoord) {
          setCoords([]);
          setDist("Unknown Route");
          return;
      }

      const start = `${currentLoc.longitude},${currentLoc.latitude}`;
      const end = `${destinationCoord.longitude},${destinationCoord.latitude}`;

      try {
        const response = await fetch(
          `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`
        );
        const json = await response.json();
        if (json.routes && json.routes.length > 0) {
          const points = json.routes[0].geometry.coordinates.map((coord: number[]) => ({
            latitude: coord[1],
            longitude: coord[0],
          }));
          setCoords(points);
          const meters = json.routes[0].distance;
          setDist((meters / 1000).toFixed(1) + " km");
        } else {
          setCoords([]);
          setDist("Route Failed");
        }
      } catch (error) { 
        console.log("OSRM Route Error:", error); 
        setCoords([]);
        setDist("Route Failed");
      }
  }, []); // Empty dependency array means this function is stable

  // --- 2. PASSENGER INTERACTION ---
  const handleJeepSelect = (jeep: any) => {
    // 1. Set selected jeep to show the info card
    setSelectedJeep(jeep); 

    // 2. Fetch the route for this specific jeep
    if (jeep && jeep.lat && jeep.lng && jeep.route) {
        const jeepLocation: Coords = { latitude: jeep.lat, longitude: jeep.lng };
        // Use the reusable fetchRoute to update passenger-specific state
        fetchRoute(jeepLocation, jeep.route, setPassengerRouteCoordinates, setPassengerRouteDistance);
        
    } else {
        setPassengerRouteCoordinates([]);
        setPassengerRouteDistance("");
    }
  };

  const handleMapPress = () => {
      // Clear selection and route when map is clicked away from a jeep
      setSelectedJeep(null);
      setPassengerRouteCoordinates([]);
      setPassengerRouteDistance("");
  }
  // ---------------------------------
  
  // --- 3. DRIVER LOGIC ---
  const getDriverRouteLabel = (routeType: 'Balacbac' | 'Town') => {
    return routeType === 'Town' ? 'Balacbac ➡️ Town (Shagem St)' : 'Town (Shagem St) ➡️ Balacbac';
  }
  
  // AUTO-ROUTE RECALCULATION EFFECT (Driver only)
  useEffect(() => {
      if (role !== 'driver' || !isDriverOnline || !userLocation || !currentRoute) {
          if (!isDriverOnline) {
             setRouteCoordinates([]); 
             setRouteDistance("");
          }
          return;
      }
      
      const routeLabel = getDriverRouteLabel(currentRoute);
      // Use the reusable fetchRoute to update driver-specific state
      fetchRoute(userLocation, routeLabel, setRouteCoordinates, setRouteDistance);

  }, [userLocation, currentRoute, isDriverOnline, role, fetchRoute]); // Added fetchRoute dependency (safe due to useCallback)

  // DRIVER START TRIP HANDLER
  const handleSelectRoute = (route: 'Balacbac' | 'Town') => {
    setIsRouteModalVisible(false);
    setCurrentRoute(route);
    startDriverTracking(route); 
  };
  
  // DRIVER TRACKING LOGIC (Updated to use reusable function logic)
  const startDriverTracking = async (route: 'Balacbac' | 'Town') => {
    if (!auth.currentUser) return;

    setIsDriverOnline(true);
    
    const userSnap = await get(ref(db, `users/${auth.currentUser.uid}`));
    const userData = userSnap.val();
    const dName = userData?.name || "Driver"; 
    const dPlate = userData?.plateNumber || "ABC-123";

    const routeLabel = getDriverRouteLabel(route);

    locationSubscription.current = await Location.watchPositionAsync(
      { distanceInterval: 10, accuracy: Location.Accuracy.High },
      (loc) => {
        const newCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        
        setUserLocation(newCoords); 
        
        update(ref(db, `jeeps/${auth.currentUser?.uid}`), {
          lat: newCoords.latitude,
          lng: newCoords.longitude,
          heading: loc.coords.heading || 0, 
          route: routeLabel, 
          plate: dPlate,      
          driverName: dName,  
          isFull: isJeepFull 
        });
      }
    );
  }

  // DRIVER TOGGLE STATUS (Kept as is)
  const toggleDriverStatus = async () => {
      if (!auth.currentUser) return;

      if (isDriverOnline) {
        if (locationSubscription.current) locationSubscription.current.remove();
        await remove(ref(db, `jeeps/${auth.currentUser.uid}`));
        setIsDriverOnline(false);
        setCurrentRoute(null);
        setRouteCoordinates([]);
      } else {
        setIsRouteModalVisible(true);
      }
    };
  // -------------------------

  // --- 4. DATA LISTENERS & INITIAL SETUP (Kept as is) ---
  useEffect(() => {
    // ... Initial Setup Logic
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need location access to show jeeps.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation(location.coords);
      setLoading(false);

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
    })();

    return () => {
      if (locationSubscription.current) locationSubscription.current.remove();
      if (headingSubscription.current) headingSubscription.current.remove();
    };
  }, []);

  useEffect(() => {
    if (auth.currentUser && role !== 'driver') {
       remove(ref(db, `jeeps/${auth.currentUser.uid}`))
         .catch(err => console.log("Cleanup error:", err));
    }
  }, [role]);

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
  // -----------------------------------------------------

  if (loading) return <ActivityIndicator size="large" style={s.center} color="#15803d" />;

  // --- 5. RENDER LOGIC (Combined Route Display) ---
  const destinationCoord = currentRoute === 'Town' ? SHAGEM_COORD : (currentRoute === 'Balacbac' ? BALACBAC_COORD : BURNHAM_COORD);
  
  // Determine which route polyline to display
  const activeRouteCoords = isDriverOnline 
    ? routeCoordinates // Driver's own active route
    : passengerRouteCoordinates; // Passenger's selected jeep's route
    
  const activeRouteColor = isDriverOnline ? "#0ea5e9" : "#059669"; // Blue for driver, Green for passenger selected
  const activeRouteWidth = isDriverOnline ? 6 : 5;

  // Determine which distance badge content to show
  let displayRouteDistance = routeDistance;
  let displayRouteName = getDriverRouteLabel(currentRoute as 'Balacbac' | 'Town') || 'Route Map';

  if (!isDriverOnline) {
      if (selectedJeep) {
          displayRouteDistance = passengerRouteDistance;
          displayRouteName = selectedJeep.route || 'Selected Route';
      } else {
          displayRouteDistance = "Select Route";
          displayRouteName = "View Route Map";
      }
  }

  return (
    <View style={s.container}>
      {/* Route Selection Modal (Driver Only) - Kept as is */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isRouteModalVisible}
        onRequestClose={() => setIsRouteModalVisible(false)}
      >
        <Pressable style={s.centeredView} onPress={() => setIsRouteModalVisible(false)}>
          <View style={s.modalView} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTitle}>Select Your Destination</Text>
            <Text style={s.modalSubtitle}>Where are you going from your current location?</Text>

            <TouchableOpacity
              style={[s.routeOptionBtn, s.btnGreen]}
              onPress={() => handleSelectRoute('Town')}
            >
              <MapPin color="white" size={20} />
              <Text style={s.routeOptionText}>Go to Town (Shagem St)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.routeOptionBtn, s.btnBlue]}
              onPress={() => handleSelectRoute('Balacbac')}
            >
              <MapPin color="white" size={20} />
              <Text style={s.routeOptionText}>Go to Balacbac Terminal</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Main Map View */}
      <MapView
        ref={mapRef}
        style={s.map}
        initialRegion={{
          latitude: 16.4000, 
          longitude: 120.5900,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onPress={handleMapPress} // Clears passenger selection
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />

        {/* --- DYNAMIC ROUTE LINE (Driver OR Passenger Selected) --- */}
        {activeRouteCoords.length > 0 && (
          <Polyline 
            coordinates={activeRouteCoords} 
            strokeColor={activeRouteColor} 
            strokeWidth={activeRouteWidth}
            lineJoin="round"
            lineCap="round"
            zIndex={isDriverOnline ? 10 : 5}
          />
        )}

        {/* --- DYNAMIC DESTINATION MARKER --- */}
        {/* Only show the destination marker if the driver is online and has a route */}
        {isDriverOnline && currentRoute && (
          <Marker coordinate={destinationCoord} title={currentRoute || "Destination"} anchor={{x: 0.5, y: 1}}>
            <View style={s.pinContainer}>
              <View style={s.pinHead}>
                <Star size={12} color="white" fill="white" />
              </View>
              <View style={s.pinStick} />
            </View>
          </Marker>
        )}
        
        {/* --- JEEPNEY MARKERS --- */}
        {jeeps.map((j) => (
           j.lat && j.lng ? (
             <Marker
               key={j.id}
               coordinate={{ latitude: j.lat, longitude: j.lng }}
               anchor={{x: 0.5, y: 0.5}}
               title={j.route}
               flat={true} 
               zIndex={1}
               // *** MODIFIED: Use the new handler for passenger route selection ***
               onPress={(e) => { e.stopPropagation(); handleJeepSelect(j); }}
             >
                <View style={s.haloCircle}>
                   <View style={{ transform: [{ rotate: `${j.heading || 0}deg` }] }}>
                      <Car size={32} color={j.isFull ? "#ef4444" : "#15803d"} fill={j.isFull ? "#ef4444" : "#15803d"} />
                   </View>
                </View>
             </Marker>
           ) : null
        ))}
        
        {/* --- USER MARKER (ROTATING ARROW) --- */}
        {userLocation && (
          <Marker 
            coordinate={userLocation} 
            title="You" 
            anchor={{x: 0.5, y: 0.5}}
            flat={true}
            zIndex={999} 
          >
             <View style={s.haloCircle}>
               <View style={{ transform: [{ rotate: `${userHeading}deg` }] }}>
                  <Navigation size={28} color="#3b82f6" fill="#3b82f6" /> 
               </View>
             </View>
          </Marker>
        )}
      </MapView>
      
      {/* INFO BADGE */}
      <View style={s.distanceBadge}>
         <Text style={s.distanceText}>{displayRouteName} • {displayRouteDistance || "Select Route"}</Text>
      </View>

      {/* DRIVER INFO CARD (JEEP PROFILE) */}
      {selectedJeep && (
        <View style={s.infoCard}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>{selectedJeep.route}</Text>
            <TouchableOpacity onPress={handleMapPress}>
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.divider} />
          
          <View style={s.cardRow}>
            <View>
              <Text style={s.label}>Driver Name</Text>
              <View style={s.rowBasic}>
                 <User size={16} color="#6B7280" style={{marginRight:4}}/>
                 <Text style={s.value}>{selectedJeep.driverName || "Unknown"}</Text>
              </View>
            </View>
            <View>
              <Text style={s.label}>Plate Number</Text>
              <View style={s.plateBadge}>
                <Text style={s.plateText}>{selectedJeep.plate || "---"}</Text>
              </View>
            </View>
          </View>

          <View style={[s.statusBox, { backgroundColor: selectedJeep.isFull ? '#553939ff' : '#DCFCE7' }]}>
            <Text style={[s.statusText, { color: selectedJeep.isFull ? '#DC2626' : '#166534' }]}>
              {selectedJeep.isFull ? "⚠️ FULL CAPACITY" : "✅ SEATS AVAILABLE"}
            </Text>
          </View>
          
          {/* NEW: Route info box for the selected jeep */}
          {passengerRouteDistance && (
            <View style={s.routeInfoBox}>
                <Text style={s.routeInfoText}>Route Length: {passengerRouteDistance}</Text>
                <Text style={s.routeInfoSubtitle}>The path to the jeep&apos;s destination is shown on the map in green.</Text>
            </View>
          )}
        </View>
      )}
      
      {/* DRIVER CONTROLS - Kept as is */}
      {role === 'driver' && (
        <View style={s.controlPanel}>
          <Text style={s.roleText}>Driver Controls</Text>
          
          {isDriverOnline && (
             <TouchableOpacity 
                onPress={() => {
                   const newStatus = !isJeepFull;
                   setIsJeepFull(newStatus);
                   if (auth.currentUser) {
                      update(ref(db, `jeeps/${auth.currentUser.uid}`), {
                         isFull: newStatus,
                      });
                   }
                }}
                style={[s.statusToggleBtn, isJeepFull ? s.btnYellow : s.btnGreen]}
             >
                <Text style={s.statusToggleText}>
                   {isJeepFull ? "✅ SET OPEN" : "⚠️ SET FULL"}
                </Text>
             </TouchableOpacity>
          )}

          <TouchableOpacity 
            onPress={toggleDriverStatus}
            style={[s.btn, isDriverOnline ? s.btnRed : s.btnGreen, { marginTop: isDriverOnline ? 10 : 0 }]}
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
  
  // --- MODAL STYLES (Keep as is) ---
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#1f2937' },
  modalSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20, textAlign: 'center' },
  routeOptionBtn: {
    width: '100%',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 10,
  },
  routeOptionText: { color: 'white', fontWeight: 'bold', marginLeft: 10, fontSize: 16 },

  // --- MARKER STYLES (Keep as is) ---
  haloCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  pinContainer: { alignItems: 'center', width: 40, height: 40 },
  pinHead: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white', zIndex: 2 },
  pinStick: { width: 2, height: 12, backgroundColor: '#ef4444', marginTop: -2, zIndex: 1 },

  // --- UI/CONTROL STYLES (Keep as is) ---
  backBtn: { position: 'absolute', top: 50, left: 20, backgroundColor: 'white', padding: 10, borderRadius: 12, elevation: 5 },
  distanceBadge: { position: 'absolute', top: 50, right: 20, backgroundColor: 'white', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, elevation: 5 },
  distanceText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  controlPanel: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: 'white', padding: 20, borderRadius: 20, elevation: 10 },
  roleText: { fontWeight: 'bold', color: 'gray', marginBottom: 10, textAlign: 'center'},
  btn: { padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnGreen: { backgroundColor: '#15803D' },
  btnRed: { backgroundColor: '#DC2626' },
  btnBlue: { backgroundColor: '#2563EB' },
  statusToggleBtn: { 
     padding: 15, 
     borderRadius: 12, 
     alignItems: 'center', 
     justifyContent: 'center', 
  },
  statusToggleText: { 
     color: 'white', 
     fontWeight: 'bold', 
     fontSize: 16 
  },
  btnYellow: { 
     backgroundColor: '#F59E0B' 
  },
  btnText: { 
     color: 'white', 
     fontWeight: 'bold', 
     marginLeft: 8 
  },

  // --- INFO CARD STYLES (Keep as is) ---
  infoCard: {
    position: 'absolute',
    bottom: 30, 
    left: 20, right: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    elevation: 20, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    zIndex: 9999,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  closeText: { fontSize: 18, color: '#9CA3AF', fontWeight: 'bold', padding: 5 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 15 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  rowBasic: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 11, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '700', color: '#111827' },
  plateBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  plateText: { fontSize: 14, fontWeight: 'bold', color: '#374151', fontFamily: 'monospace' },
  statusBox: { padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  
  // *** NEW STYLE FOR PASSENGER ROUTE INFO ***
  routeInfoBox: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  routeInfoText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  routeInfoSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  }
});
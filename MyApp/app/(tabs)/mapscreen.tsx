import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import MapView, { Marker, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";
import { LocationObjectCoords } from "expo-location";
import { useTheme } from "../ThemeContext";
import { db, ref, onValue, update } from "../../services/firebase"; 
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Play, Square } from "lucide-react-native";
import { useRouter } from "expo-router";

const JEEP_ID = "jeep1"; 
const SPEED = 0.05;

// This is the simulation for the route going to Balacbac to Burnham
const ROUTE_PATH = [
  { lat: 16.3844, lng: 120.5806 }, 
  { lat: 16.3880, lng: 120.5850 }, 
  { lat: 16.3920, lng: 120.5890 }, 
  { lat: 16.3990, lng: 120.5930 }, 
  { lat: 16.4050, lng: 120.5960 }, 
  { lat: 16.4100, lng: 120.5940 }, 
  { lat: 16.4133, lng: 120.5950 }, 
];

export default function MapsScreen() {
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<LocationObjectCoords | null>(null);

  const [region, setRegion] = useState<Region>({
    latitude: 16.4143,
    longitude: 120.5988,
    latitudeDelta: 0.03, 
    longitudeDelta: 0.03,
  });

  const [jeeps, setJeeps] = useState<any[]>([]);

  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const demoTimer = useRef<any>(null);
  
  
  const currentLeg = useRef(0);
  const legProgress = useRef(0); 
  const direction = useRef(1); 

  
  useEffect(() => {
    const jeepsRef = ref(db, 'jeeps/');

    const unsub = onValue(jeepsRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        const loadedJeeps = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setJeeps(loadedJeeps);
      } else {
        setJeeps([]);
      }
    });

    return () => unsub();
  }, []);

  
  const toggleDemo = () => {
    if (isDemoRunning) {
      if (demoTimer.current) clearInterval(demoTimer.current);
      setIsDemoRunning(false);
    } else {
      setIsDemoRunning(true);
      demoTimer.current = setInterval(() => {
        
        
        legProgress.current += SPEED;

        
        if (legProgress.current >= 1) {
          legProgress.current = 0; 
          currentLeg.current += direction.current;
        }

        if (currentLeg.current >= ROUTE_PATH.length - 1) {
           direction.current = -1;
           currentLeg.current = ROUTE_PATH.length - 2; 
        } 
        else if (currentLeg.current < 0) {
           direction.current = 1;
           currentLeg.current = 0;
        }
        const startPoint = ROUTE_PATH[currentLeg.current];
        const endPoint = ROUTE_PATH[currentLeg.current + 1];

        
        const lat = startPoint.lat + (endPoint.lat - startPoint.lat) * legProgress.current;
        const lng = startPoint.lng + (endPoint.lng - startPoint.lng) * legProgress.current;

        update(ref(db, `jeeps/${JEEP_ID}`), {
          lat: lat,
          lng: lng,
          name: "Demo Jeep",
          plate: "DEMO-123",
          heading: Math.atan2(endPoint.lng - startPoint.lng, endPoint.lat - startPoint.lat) * 180 / Math.PI
        });

      }, 100); 
    }
  };

  useEffect(() => {
    return () => {
      if (demoTimer.current) clearInterval(demoTimer.current);
    };
  }, []);


  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoading(false);
        return;
      }
      
      const current = await Location.getCurrentPositionAsync({});
      setUserLocation(current.coords);
      setLoading(false);

      setRegion((r) => ({
        ...r,
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      }));

      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
        (loc) => {
          setUserLocation(loc.coords);
        }
      );
    })();
  }, []);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#15803D" />
        <Text style={{ marginTop: 8 }}>Getting location...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        provider={undefined}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
      >
        {/* OpenStreetMap tiles */}
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />

        {/* User marker */}
        {userLocation && (
          <Marker
            coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
            title="You"
            pinColor="blue"
          />
        )}

        {/* Jeep markers */}
        {jeeps.map((j) => {
            if (!j.lat || !j.lng) return null;
            
            return (
              <Marker
                key={j.id}
                coordinate={{ latitude: j.lat, longitude: j.lng }}
                title={j.name || "Jeep"}
                description={`Plate: ${j.plate}`}
                pinColor="green"
                rotation={j.heading} 
              />
            );
        })}
      </MapView>

      {/* Back Button */}
      <View style={s.backButtonContainer}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={s.backButton}
        >
          <ArrowLeft color="black" size={24} />
        </TouchableOpacity>
      </View>

      {/* ✅ DEMO BUTTON (Bottom Right) */}
      <View style={s.demoButtonContainer}>
        <TouchableOpacity 
          onPress={toggleDemo} 
          style={[s.roundBtn, isDemoRunning ? {backgroundColor: '#EF4444'} : {backgroundColor: '#22C55E'}]}
        >
          {isDemoRunning ? (
            <Square color="white" size={24} fill="white" /> 
          ) : (
            <Play color="white" size={24} fill="white" />
          )}
        </TouchableOpacity>
        <Text style={s.demoText}>{isDemoRunning ? "Stop Demo" : "Start Demo"}</Text>
      </View>

      {jeeps.length === 0 && !loading && !isDemoRunning && (
        <View style={s.emptyStateContainer}>
          <Text style={s.emptyStateText}>No active jeepneys nearby.</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  
  backButtonContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
  },
  backButton: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 25,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },

  // Demo Button Styles
  demoButtonContainer: { 
    position: 'absolute', 
    bottom: 40, 
    right: 20, 
    alignItems: 'center', 
    zIndex: 10 
  },
  demoText: { 
    color: 'black', 
    fontWeight: 'bold', 
    fontSize: 10, 
    marginTop: 4, 
    backgroundColor: 'rgba(255,255,255,0.7)', 
    paddingHorizontal: 4, 
    borderRadius: 4 
  },
  roundBtn: {
    padding: 12,
    borderRadius: 30,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  emptyStateContainer: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyStateText: {
    color: 'white',
    fontWeight: 'bold',
  }
});
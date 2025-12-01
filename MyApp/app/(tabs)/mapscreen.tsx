import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import MapView, { Marker, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";
import { LocationObjectCoords } from "expo-location";
import { useTheme } from "../ThemeContext";
import { db, ref, onValue }  from "../../services/firebase"; 
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";

export default function MapsScreen() {
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<LocationObjectCoords | null>(null);

  const [region, setRegion] = useState<Region>({
    latitude: 16.4143,
    longitude: 120.5988,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });


  const [jeeps, setJeeps] = useState<any[]>([]);

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
          mapRef.current?.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
          }, 500);
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
              />
            );
        })}
      </MapView>

      {/* ✅ Back Button Logic */}
      <View style={s.backButtonContainer}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={s.backButton}
        >
          <ArrowLeft color="black" size={24} />
        </TouchableOpacity>
      </View>

      {jeeps.length === 0 && !loading && (
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
import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import MapView, { Marker, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";
import { LocationObjectCoords } from "expo-location";
import { useTheme } from "../ThemeContext";

const [jeeps, setJeeps] = useState([
  { id: "1", lat: 16.4150, lng: 120.5985, name: "Jeep 1", plate: "ABC-123" },
  { id: "2", lat: 16.4140, lng: 120.5995, name: "Jeep 2", plate: "XYZ-456" },
  { id: "3", lat: 16.4136, lng: 120.5977, name: "Jeep 3", plate: "JKL-789" }
]);

// simulator: move jeeps slightly every 5s
useEffect(() => {
  const t = setInterval(() => {
    setJeeps((prev) =>
      prev.map((j, i) => ({
        ...j,
        lat: j.lat + (Math.random() - 0.5) * 0.0003,
        lng: j.lng + (Math.random() - 0.5) * 0.0003,
      }))
    );
  }, 5000);
  return () => clearInterval(t);
}, []);


export default function MapsScreen() {
  const [region, setRegion] = useState<Region>({
    latitude: 16.4143,
    longitude: 120.5988,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });


  const [userLocation, setUserLocation] = useState<LocationObjectCoords | null>(null);
  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoading(false);
        return;
      }
      setLoading(false);

      // initial location
      const current = await Location.getCurrentPositionAsync({});
      setUserLocation(current.coords);
      setRegion((r) => ({
        ...r,
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      }));

      // watch position
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
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Getting location…</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        provider={undefined}
        onRegionChangeComplete={setRegion}
      >
        {/* OpenStreetMap tiles*/}
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
        {/* Example static jeep markers: */}
          {jeeps.map((j) => (
            <Marker
              key={j.id}
              coordinate={{ latitude: j.lat, longitude: j.lng }}
              title={j.name}
              description={`Plate: ${j.plate}`}
              pinColor="green"
              onPress={() => {
                //router.push(`/jeep/${j.id}`);
              }}
            />
          ))}

        
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});

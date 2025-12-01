import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { db, ref, onValue } from "../../services/firebase";

export default function JeepProfile() {
  const { id } = useLocalSearchParams();
  const safeId = Array.isArray(id) ? id[0] : id;

  const [jeep, setJeep] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetching Data
  useEffect(() => {
    if (!safeId) return;

    // Point to the specific jeep in the DB
    const jeepRef = ref(db, `jeeps/${safeId}`);

    const unsub = onValue(jeepRef, (snapshot) => {
      const data = snapshot.val();
      setJeep(data);
      setLoading(false);
    });

    return () => unsub();
  }, [safeId]);

  //Loading State
  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#15803D" />
        <Text className="mt-2 text-gray-500">Loading Jeep Profile...</Text>
      </SafeAreaView>
    );
  }

  //Not Found State
  if (!jeep) {
    return (
      <SafeAreaView className="flex-1 p-5">
        <Text className="text-xl font-bold text-red-600">
          Jeepney not found in database.
        </Text>
        <Text className="text-gray-500 mt-2">ID: {safeId}</Text>
      </SafeAreaView>
    );
  }

  //Render Real Data
  return (
    <SafeAreaView className="flex-1 bg-white p-5">
      <Text className="text-3xl font-bold text-green-900 mb-4">
        {jeep.name || "Jeep Details"}
      </Text>

      <View className="bg-green-100 p-5 rounded-2xl mb-4">
        <Text className="text-xl font-semibold">
          {jeep.name || "Unknown Route"}
        </Text>
        
        <Text className="text-gray-700 mt-1">
          Plate Number: {jeep.plate || "No Plate"}
        </Text>
        
        <Text className="text-gray-700 mt-1">
          Driver: {jeep.driver || "Unknown Driver"}
        </Text>
        
        <Text className="text-gray-700 mt-1">
          Capacity: {jeep.capacity ? `${jeep.capacity} passengers` : "N/A"}
        </Text>
      </View>

      <View className="bg-gray-100 p-4 rounded-xl">
        <Text className="font-bold text-gray-700 mb-2">Live Status</Text>
        <Text className="text-gray-600">Latitude: {jeep.lat}</Text>
        <Text className="text-gray-600">Longitude: {jeep.lng}</Text>
      </View>
    </SafeAreaView>
  );
}
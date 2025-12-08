import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, User, BusFront, MapPin, Hash, Users } from "lucide-react-native";
import { useTheme } from "../ThemeContext"; 

// 1. MOCK DATA (Matches the IDs in your jeepInfo.tsx)
// This acts as a temporary database so your list clicks work immediately.
const staticJeepData: Record<string, any> = {
  "1": { 
    id: "1", 
    route: "Balacbac – Town", 
    plate: "ABC-1234", 
    driver: "Mang Juan", 
    capacity: 22, 
    currentPassengers: 14,
    status: "In Transit",
    lastLocation: "Kisad Road",
  },
  "2": { 
    id: "2", 
    route: "Balacbac – Town", 
    plate: "XYZ-5678", 
    driver: "Mang Bert", 
    capacity: 20, 
    currentPassengers: 2,
    status: "Waiting at Terminal",
    lastLocation: "Igorot Park",
  },
  "3": { 
    id: "3", 
    route: "Balacbac – Town", 
    plate: "JKL-9101", 
    driver: "Mang Tomas", 
    capacity: 22, 
    currentPassengers: 22,
    status: "Full",
    lastLocation: "Marcos Highway",
  },
};

export default function JeepProfile() {
  const { id } = useLocalSearchParams();
  const safeId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { darkMode } = useTheme(); 

  const [jeep, setJeep] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if the ID exists in our static data
    if (safeId && staticJeepData[safeId]) {
      setJeep(staticJeepData[safeId]);
    }
    setLoading(false);
  }, [safeId]);

  // --- DYNAMIC STYLES ---
  const bg = darkMode ? "bg-black" : "bg-gray-50";
  const cardBg = darkMode ? "bg-gray-800" : "bg-white";
  const textPrimary = darkMode ? "text-white" : "text-gray-900";
  const textSecondary = darkMode ? "text-gray-400" : "text-gray-500";

  // --- LOADING STATE ---
  if (loading) {
    return (
      <SafeAreaView className={`flex-1 justify-center items-center ${bg}`}>
        <ActivityIndicator size="large" color="#15803D" />
      </SafeAreaView>
    );
  }

  // --- NOT FOUND STATE ---
  if (!jeep) {
    return (
      <SafeAreaView className={`flex-1 p-5 justify-center items-center ${bg}`}>
        <BusFront size={60} color="#ef4444" />
        <Text className="text-xl font-bold text-red-500 mt-4">Jeepney Not Found</Text>
        <Text className={textSecondary}>ID: {safeId}</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-6 bg-gray-200 p-3 rounded-lg">
          <Text>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // --- MAIN PROFILE UI ---
  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      <ScrollView>
        {/* HEADER AREA */}
        <View className="relative">
            {/* Back Button */}
            <TouchableOpacity 
                onPress={() => router.back()} 
                className="absolute top-4 left-4 z-10 bg-white/80 p-2 rounded-full"
            >
                <ArrowLeft color="black" size={24} />
            </TouchableOpacity>
            
            {/* Jeep Image / Color Block */}
            <View className="h-52 bg-green-800 items-center justify-center">
                 <BusFront color="white" size={80} />
            </View>
        </View>

        {/* CONTENT BODY */}
        <View className="-mt-6 rounded-t-3xl p-6" style={{ backgroundColor: darkMode ? '#111' : 'white', minHeight: 600 }}>
            
            {/* Title & Status */}
            <View className="mb-6">
                <Text className={`text-3xl font-bold ${textPrimary}`}>{jeep.plate}</Text>
                <Text className={`text-lg font-medium text-green-600`}>{jeep.route}</Text>
                
                {/* Status Badge */}
                <View className="flex-row mt-2">
                    <View className={`px-3 py-1 rounded-full ${jeep.status === 'Full' ? 'bg-red-100' : 'bg-green-100'}`}>
                        <Text className={jeep.status === 'Full' ? 'text-red-700 font-bold' : 'text-green-700 font-bold'}>
                            {jeep.status}
                        </Text>
                    </View>
                </View>
            </View>

            {/* DETAILS CARDS */}
            <View className="gap-y-4">
                
                {/* Driver */}
                <View className={`p-4 rounded-xl flex-row items-center ${cardBg} shadow-sm`}>
                    <View className="bg-blue-100 p-3 rounded-full mr-4">
                        <User color="#2563EB" size={24} />
                    </View>
                    <View>
                        <Text className={textSecondary}>Driver</Text>
                        <Text className={`text-lg font-semibold ${textPrimary}`}>{jeep.driver}</Text>
                    </View>
                </View>

                {/* Capacity */}
                <View className={`p-4 rounded-xl flex-row items-center ${cardBg} shadow-sm`}>
                    <View className="bg-orange-100 p-3 rounded-full mr-4">
                        <Users color="#EA580C" size={24} />
                    </View>
                    <View>
                        <Text className={textSecondary}>Passengers</Text>
                        <Text className={`text-lg font-semibold ${textPrimary}`}>
                            {jeep.currentPassengers} / {jeep.capacity}
                        </Text>
                    </View>
                </View>

                {/* Location */}
                <View className={`p-4 rounded-xl flex-row items-center ${cardBg} shadow-sm`}>
                    <View className="bg-purple-100 p-3 rounded-full mr-4">
                        <MapPin color="#9333EA" size={24} />
                    </View>
                    <View>
                        <Text className={textSecondary}>Last Seen</Text>
                        <Text className={`text-lg font-semibold ${textPrimary}`}>{jeep.lastLocation}</Text>
                    </View>
                </View>

                {/* Plate Number */}
                <View className={`p-4 rounded-xl flex-row items-center ${cardBg} shadow-sm`}>
                    <View className="bg-gray-200 p-3 rounded-full mr-4">
                        <Hash color="#4B5563" size={24} />
                    </View>
                    <View>
                        <Text className={textSecondary}>Plate Number</Text>
                        <Text className={`text-lg font-semibold ${textPrimary}`}>{jeep.plate}</Text>
                    </View>
                </View>

            </View>

            {/* TRACK BUTTON (Navigates to Map) */}
            <TouchableOpacity 
              onPress={() => router.push("/(tabs)/mapscreen")}
              className="mt-8 bg-green-700 py-4 rounded-xl items-center shadow-lg active:bg-green-800"
            >
                <Text className="text-white font-bold text-lg">Track Location</Text>
            </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
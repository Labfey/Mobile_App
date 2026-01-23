import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, User, BusFront, MapPin, Hash, Edit3 } from "lucide-react-native";
import { useTheme } from "../ThemeContext"; 

// Firebase Imports
import { ref, onValue } from "firebase/database";
import { auth, db } from "../../services/firebase";

export default function JeepProfile() {
  const { id } = useLocalSearchParams();
  const safeId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { darkMode } = useTheme(); 

  const [jeep, setJeep] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Check if the person viewing this is the actual owner of this jeep
  const isOwner = auth.currentUser?.uid === safeId;

  useEffect(() => {
    if (!safeId) return;

    // Connect to the specific driver's info in Firebase
    const jeepRef = ref(db, `jeep_info/${safeId}`);
    
    const unsubscribe = onValue(jeepRef, (snapshot) => {
      if (snapshot.exists()) {
        setJeep(snapshot.val());
      } else {
        setJeep(null);
      }
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [safeId]);

  // --- THEME STYLES ---
  const bg = darkMode ? "bg-black" : "bg-gray-50";
  const cardBg = darkMode ? "bg-gray-800" : "bg-white";
  const textPrimary = darkMode ? "text-white" : "text-gray-900";
  const textSecondary = darkMode ? "text-gray-400" : "text-gray-500";

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 justify-center items-center ${bg}`}>
        <ActivityIndicator size="large" color="#15803D" />
      </SafeAreaView>
    );
  }

  if (!jeep) {
    return (
      <SafeAreaView className={`flex-1 p-5 justify-center items-center ${bg}`}>
        <BusFront size={60} color="#ef4444" />
        <Text className="text-xl font-bold text-red-500 mt-4">Jeepney Profile Not Found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-6 bg-gray-200 p-3 rounded-lg">
          <Text>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      <ScrollView>
        {/* HEADER AREA */}
        <View className="relative">
            <TouchableOpacity 
                onPress={() => router.back()} 
                className="absolute top-4 left-4 z-10 bg-white/90 p-2 rounded-full shadow-md"
            >
                <ArrowLeft color="black" size={24} />
            </TouchableOpacity>

            {/* Background Cover */}
            <View className="h-40 bg-green-800" />

            {/* Profile Picture Wrapper */}
            <View className="items-center -mt-16">
                <View className="p-1 bg-white rounded-full shadow-xl">
                    {jeep.profilePic ? (
                        <Image 
                            source={{ uri: jeep.profilePic }} 
                            className="w-32 h-32 rounded-full" 
                        />
                    ) : (
                        <View className="w-32 h-32 rounded-full bg-gray-300 items-center justify-center">
                            <User size={60} color="gray" />
                        </View>
                    )}
                </View>
            </View>
        </View>

        {/* CONTENT BODY */}
        <View className="p-6">
            <View className="items-center mb-6">
                <Text className={`text-3xl font-bold ${textPrimary}`}>{jeep.driverName}</Text>
                <Text className="text-green-600 text-lg font-semibold">{jeep.route}</Text>
                
                {/* IF OWNER: Show Edit Button */}
                {isOwner && (
                    <TouchableOpacity 
                        onPress={() => router.push("../MyApp/app/(tabs)/jeepinfo")}
                        className="mt-3 flex-row items-center bg-blue-100 px-4 py-2 rounded-full"
                    >
                        <Edit3 size={16} color="#2563EB" />
                        <Text className="text-blue-600 font-bold ml-2">Edit My Profile</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* DETAILS SECTION */}
            <View className="gap-y-4">
                <Text className={`text-sm font-bold uppercase tracking-widest ${textSecondary}`}>Vehicle Details</Text>
                
                {/* Plate Number Card */}
                <View className={`p-4 rounded-2xl flex-row items-center ${cardBg} shadow-sm border border-gray-100`}>
                    <View className="bg-gray-100 p-3 rounded-xl mr-4">
                        <Hash color="#4B5563" size={24} />
                    </View>
                    <View>
                        <Text className={textSecondary}>Plate Number</Text>
                        <Text className={`text-lg font-semibold ${textPrimary}`}>{jeep.plate}</Text>
                    </View>
                </View>

                {/* Route Card */}
                <View className={`p-4 rounded-2xl flex-row items-center ${cardBg} shadow-sm border border-gray-100`}>
                    <View className="bg-green-100 p-3 rounded-xl mr-4">
                        <MapPin color="#16A34A" size={24} />
                    </View>
                    <View>
                        <Text className={textSecondary}>Assigned Route</Text>
                        <Text className={`text-lg font-semibold ${textPrimary}`}>{jeep.route}</Text>
                    </View>
                </View>

                {/* Status Card */}
                <View className={`p-4 rounded-2xl flex-row items-center ${cardBg} shadow-sm border border-gray-100`}>
                    <View className="bg-blue-100 p-3 rounded-xl mr-4">
                        <BusFront color="#2563EB" size={24} />
                    </View>
                    <View>
                        <Text className={textSecondary}>Current Status</Text>
                        <Text className="text-lg font-semibold text-blue-600">Active Duty</Text>
                    </View>
                </View>
            </View>

            {/* TRACK BUTTON */}
            <TouchableOpacity 
              onPress={() => router.push({
                pathname: "/(tabs)/mapscreen",
                params: { selectedDriverId: safeId }
              })}
              className="mt-10 bg-green-700 py-4 rounded-2xl items-center shadow-lg active:opacity-80"
            >
                <Text className="text-white font-bold text-lg">Track this Jeepney</Text>
            </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
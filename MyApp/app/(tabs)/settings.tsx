import { View, Text, Switch, TouchableOpacity, Alert, ScrollView } from "react-native";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeContext";
import { useRouter } from "expo-router";


const JEEP_GREEN = "#2E7D32";

export default function Settings() {
  const { darkMode, setDarkMode } = useTheme(); 
  const router = useRouter();

  // --- DEMO HANDLERS ---

  const handlePlaceholder = (title: string) => {
    Alert.alert(title, `This is a demo. In the real app, this opens the ${title} screen.`);
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Log Out", 
          style: "destructive", 
          onPress: () => {
            console.log("User logged out (Demo)");
            // Navigate back to login (using 'as any' to avoid type errors if file missing)
            router.replace("/login" as any); 
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView
      className={`flex-1 ${darkMode ? "bg-black" : "bg-gray-100"}`}
    >
      <ScrollView className="px-6 py-4">

        <Text
          className={`text-3xl font-bold mb-6 ${
            darkMode ? "text-white" : "text-gray-900"
          }`}
        >
          Settings
        </Text>

        {/* APPEARANCE CARD */}
        <View
          className={`p-5 rounded-3xl mb-5 ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}
        >
          <Text
            className={`text-lg font-semibold mb-4 ${
              darkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Appearance
          </Text>

          {/* Dark Mode Toggle */}
          <View className="flex-row items-center justify-between py-3">
            <Text
              className={`text-base ${
                darkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Dark Mode
            </Text>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode} // ✅ Connects to global context
              trackColor={{ false: "#ccc", true: JEEP_GREEN }}
              thumbColor={darkMode ? "#fff" : "#f4f4f4"}
            />
          </View>
        </View>

        {/* ACCOUNT CARD */}
        <View
          className={`p-5 rounded-3xl mb-5 ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}
        >
          <Text
            className={`text-lg font-semibold mb-4 ${
              darkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Account
          </Text>

          <TouchableOpacity 
            className="py-3"
            onPress={() => handlePlaceholder("Edit Profile")}
          >
            <Text
              className={`${darkMode ? "text-gray-200" : "text-gray-700"} text-base`}
            >
              Edit Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className="py-3"
            onPress={() => handlePlaceholder("Change Password")}
          >
            <Text
              className={`${darkMode ? "text-gray-200" : "text-gray-700"} text-base`}
            >
              Change Password
            </Text>
          </TouchableOpacity>
          
           {/* Added Log Out to Account Section */}
           <TouchableOpacity 
            className="py-3 mt-2"
            onPress={handleLogout}
          >
            <Text className="text-red-500 font-bold text-base">
              Log Out
            </Text>
          </TouchableOpacity>
        </View>

        {/* SUPPORT CARD */}
        <View
          className={`p-5 rounded-3xl mb-5 ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}
        >
          <Text
            className={`text-lg font-semibold mb-4 ${
              darkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Support
          </Text>

          <TouchableOpacity 
            className="py-3"
            onPress={() => handlePlaceholder("Help Center")}
          >
            <Text
              className={`${darkMode ? "text-gray-200" : "text-gray-700"} text-base`}
            >
              Help Center
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className="py-3"
            onPress={() => handlePlaceholder("Report a Problem")}
          >
            <Text
              className={`${darkMode ? "text-gray-200" : "text-gray-700"} text-base`}
            >
              Report a Problem
            </Text>
          </TouchableOpacity>
        </View>

        <Text className={`text-center mb-10 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
          JeepRoute Demo v1.0
        </Text>
        
      </ScrollView>
    </SafeAreaView>
  );
}
import { View, Text, Switch, TouchableOpacity } from "react-native";
import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

// JeepRoute Green
const JEEP_GREEN = "#2E7D32";

export default function Settings() {
  // Track dark mode toggle
  const [darkMode, setDarkMode] = useState(false);

  return (
    <SafeAreaView
      className={`flex-1 ${darkMode ? "bg-black" : "bg-gray-100"}`}
    >
      <View className="px-6 py-4">

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
              onValueChange={setDarkMode}
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

          <TouchableOpacity className="py-3">
            <Text
              className={`${darkMode ? "text-gray-200" : "text-gray-700"} text-base`}
            >
              Edit Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity className="py-3">
            <Text
              className={`${darkMode ? "text-gray-200" : "text-gray-700"} text-base`}
            >
              Change Password
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

          <TouchableOpacity className="py-3">
            <Text
              className={`${darkMode ? "text-gray-200" : "text-gray-700"} text-base`}
            >
              Help Center
            </Text>
          </TouchableOpacity>

          <TouchableOpacity className="py-3">
            <Text
              className={`${darkMode ? "text-gray-200" : "text-gray-700"} text-base`}
            >
              Report a Problem
            </Text>
          </TouchableOpacity>
        </View>
        
      </View>
    </SafeAreaView>
  );
}

import { View, Text, Switch, TouchableOpacity, Alert, ScrollView } from "react-native";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeContext";

const JEEP_GREEN = "#2E7D32";

export default function Settings() {
  const { darkMode, setDarkMode } = useTheme();

  // Helper styles for Dark/Light mode
  const bgClass = darkMode ? "bg-black" : "bg-gray-100";
  const cardClass = darkMode ? "bg-gray-800" : "bg-white";
  const textClass = darkMode ? "text-white" : "text-gray-900";
  const subTextClass = darkMode ? "text-gray-400" : "text-gray-500";

  return (
    <SafeAreaView className={`flex-1 ${bgClass}`}>
      <ScrollView className="px-6 py-4">

        <Text className={`text-3xl font-bold mb-6 ${textClass}`}>Settings</Text>

        {/* --- APPEARANCE CARD --- */}
        <View className={`p-5 rounded-3xl mb-5 ${cardClass}`}>
          <Text className={`text-lg font-semibold mb-4 ${textClass}`}>Appearance</Text>
          <View className="flex-row items-center justify-between py-3">
            <Text className={`text-base ${textClass}`}>Dark Mode</Text>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: "#ccc", true: JEEP_GREEN }}
              thumbColor={darkMode ? "#fff" : "#f4f4f4"}
            />
          </View>
        </View>

        {/* --- SUPPORT CARD --- */}
        <View className={`p-5 rounded-3xl mb-5 ${cardClass}`}>
          <Text className={`text-lg font-semibold mb-4 ${textClass}`}>Support</Text>
          
          <TouchableOpacity 
            className="py-3" 
            onPress={() => Alert.alert("Help", "Opening Help Center...")}
          >
            <Text className={`text-base ${textClass}`}>Help Center</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className="py-3" 
            onPress={() => Alert.alert("Report", "Opening Report Form...")}
          >
            <Text className={`text-base ${textClass}`}>Report a Problem</Text>
          </TouchableOpacity>
        </View>

        <Text className={`text-center mb-10 ${subTextClass}`}>JeepRoute Demo v1.2</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
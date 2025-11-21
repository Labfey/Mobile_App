import { Tabs } from "expo-router";
import React from "react";
import { ThemeProvider, useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { View } from "react-native";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <TabLayout />
    </ThemeProvider>
  );
}

function TabLayout() {
  const { darkMode } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: darkMode ? "#4ade80" : "#15803d",
        tabBarInactiveTintColor: darkMode ? "#9ca3af" : "#94a3b8",
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          backgroundColor: darkMode ? "#0f172a" : "#ffffff",
          borderTopWidth: 0,
          elevation: 20,
          shadowColor: "#000",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <FontAwesome name="home" size={26} color={color} />
          ),
        }}
      />
        <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color }) => (
            <FontAwesome name="map" size={26} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="jeepInfo"
        options={{
          title: "Jeep Info",
          tabBarIcon: ({ color }) => (
            <FontAwesome name="bus" size={26} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <FontAwesome name="user" size={26} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <FontAwesome name="cog" size={26} color={color} />
          ),
        }}
      />


      {/* Hidden dynamic route — no tab bar icon */}
      <Tabs.Screen
        name="jeep/[id]"
        options={{
          title: "Jeep Details",
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

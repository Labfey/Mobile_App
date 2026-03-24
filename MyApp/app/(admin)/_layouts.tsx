import { Tabs } from "expo-router";
import React from "react";
import { useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";

export default function AdminLayout() {
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
          title: "Dashboard",
          tabBarIcon: ({ color }) => <FontAwesome name="dashboard" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="drivers"
        options={{
          title: "Drivers",
          tabBarIcon: ({ color }) => <FontAwesome name="users" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="jeeps"
        options={{
          title: "Jeeps",
          tabBarIcon: ({ color }) => <FontAwesome name="bus" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => <FontAwesome name="history" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <FontAwesome name="gear" size={26} color={color} />,
        }}
      />
    </Tabs>
  );
}
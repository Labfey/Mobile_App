import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { View, Text, StyleSheet } from "react-native";
import { db, ref, onValue } from "../../services/firebase";

function TabBadge({ count }: { count: number }) {
    if (count === 0) return null;
    return (
        <View style={badge.container}>
            <Text style={badge.text}>{count > 9 ? "9+" : count}</Text>
        </View>
    );
}

const badge = StyleSheet.create({
    container: {
        position: "absolute", top: -4, right: -8,
        backgroundColor: "#ef4444", borderRadius: 10,
        minWidth: 18, height: 18, alignItems: "center", justifyContent: "center",
        paddingHorizontal: 4,
    },
    text: { color: "white", fontSize: 10, fontWeight: "800" },
});

export default function AdminLayout() {
    const { darkMode } = useTheme();
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        const regRef = ref(db, "pending_registrations");
        const unsub = onValue(regRef, (snap) => {
            if (!snap.exists()) { setPendingCount(0); return; }
            const data = snap.val();
            const count = Object.values(data).filter((r: any) => r.status === "pending").length;
            setPendingCount(count);
        });
        return () => unsub();
    }, []);

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
                    tabBarIcon: ({ color }) => <FontAwesome name="dashboard" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="drivers"
                options={{
                    title: "Drivers",
                    tabBarIcon: ({ color }) => <FontAwesome name="users" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="registrations"
                options={{
                    title: "Applications",
                    tabBarIcon: ({ color }) => (
                        <View style={{ position: "relative" }}>
                            <FontAwesome name="id-card-o" size={24} color={color} />
                            <TabBadge count={pendingCount} />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="jeeps"
                options={{
                    title: "Jeeps",
                    tabBarIcon: ({ color }) => <FontAwesome name="bus" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="history"
                options={{
                    title: "History",
                    tabBarIcon: ({ color }) => <FontAwesome name="history" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: "Settings",
                    tabBarIcon: ({ color }) => <FontAwesome name="gear" size={24} color={color} />,
                }}
            />
        </Tabs>
    );
}
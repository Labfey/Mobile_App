// MyApp/app/(admin)/_layout.tsx
// ─── STEP 3: Add Operators tab to admin navigation ────────────────────────────
// CHANGES: added "operators" Tabs.Screen with a Building2-like icon

import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { View, Text, StyleSheet } from "react-native";
import { db, ref, onValue } from "../../services/firebase";

function TabBadge({ count, color = "#ef4444" }: { count: number; color?: string }) {
    if (count === 0) return null;
    return (
        <View style={[badge.container, { backgroundColor: color }]}>
            <Text style={badge.text}>{count > 9 ? "9+" : count}</Text>
        </View>
    );
}

const badge = StyleSheet.create({
    container: {
        position: "absolute", top: -4, right: -8,
        borderRadius: 10, minWidth: 18, height: 18,
        alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
    },
    text: { color: "white", fontSize: 10, fontWeight: "800" },
});

export default function AdminLayout() {
    const { darkMode } = useTheme();
    const [pendingCount, setPendingCount] = useState(0);
    const [reportsCount, setReportsCount] = useState(0);

    useEffect(() => {
        const unsub = onValue(ref(db, "pending_registrations"), (snap) => {
            if (!snap.exists()) { setPendingCount(0); return; }
            setPendingCount(
                Object.values(snap.val()).filter((r: any) => r.status === "pending").length
            );
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const unsub = onValue(ref(db, "reports"), (snap) => {
            if (!snap.exists()) { setReportsCount(0); return; }
            setReportsCount(
                Object.values(snap.val()).filter((r: any) => r.status === "open").length
            );
        });
        return () => unsub();
    }, []);

    const opts = {
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor:   darkMode ? "#4ade80" : "#15803d",
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" as const },
    };

    return (
        <Tabs screenOptions={opts}>

            {/* ── Dashboard ──────────────────────────────────────────────── */}
            <Tabs.Screen
                name="index"
                options={{
                    title: "Dashboard",
                    tabBarIcon: ({ color }) => <FontAwesome name="dashboard" size={22} color={color} />,
                }}
            />

            {/* ── Drivers ────────────────────────────────────────────────── */}
            <Tabs.Screen
                name="drivers"
                options={{
                    title: "Drivers",
                    tabBarIcon: ({ color }) => <FontAwesome name="users" size={22} color={color} />,
                }}
            />

            {/* ── Applications (badge) ────────────────────────────────────── */}
            <Tabs.Screen
                name="registrations"
                options={{
                    title: "Applications",
                    tabBarIcon: ({ color }) => (
                        <View style={{ position: "relative" }}>
                            <FontAwesome name="id-card-o" size={22} color={color} />
                            <TabBadge count={pendingCount} />
                        </View>
                    ),
                }}
            />

            {/* ── Reports (badge, amber) ──────────────────────────────────── */}
            <Tabs.Screen
                name="reports"
                options={{
                    title: "Reports",
                    tabBarIcon: ({ color }) => (
                        <View style={{ position: "relative" }}>
                            <FontAwesome name="exclamation-circle" size={22} color={color} />
                            <TabBadge count={reportsCount} color="#f59e0b" />
                        </View>
                    ),
                }}
            />

            {/* ── Operators ─────────────────────── ▼ NEW TAB ▼ ──────────── */}
            <Tabs.Screen
                name="operators"
                options={{
                    title: "Operators",
                    tabBarIcon: ({ color }) => (
                        <FontAwesome name="building-o" size={22} color={color} />
                    ),
                }}
            />

            {/* ── Fare Management ─────────────────────────────────────────── */}
            <Tabs.Screen
                name="FareManagement"
                options={{
                    title: "Fares",
                    tabBarIcon: ({ color }) => <FontAwesome name="gears" size={22} color={color} />,
                }}
            />

            {/* Hidden screens */}
            <Tabs.Screen name="revenue"  options={{ href: null }} />
            <Tabs.Screen name="history"  options={{ href: null }} />
            <Tabs.Screen name="jeeps"    options={{ href: null }} />
            <Tabs.Screen name="settings" options={{ href: null }} />
        </Tabs>
    );
}
import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { View, Text, StyleSheet } from "react-native";
import { db, ref, onValue } from "../../services/firebase";

// ─────────────────────────────────────────────────────────────────────────────
// TAB BADGE — shown over icon when count > 0
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminLayout() {
    const { darkMode } = useTheme();
    const [pendingCount, setPendingCount] = useState(0);   // pending registrations
    const [reportsCount, setReportsCount] = useState(0);   // open reports

    // Live listener — pending driver registrations
    useEffect(() => {
        const unsub = onValue(ref(db, "pending_registrations"), (snap) => {
            if (!snap.exists()) { setPendingCount(0); return; }
            const count = Object.values(snap.val()).filter((r: any) => r.status === "pending").length;
            setPendingCount(count);
        });
        return () => unsub();
    }, []);

    // Live listener — open reports from users
    useEffect(() => {
        const unsub = onValue(ref(db, "reports"), (snap) => {
            if (!snap.exists()) { setReportsCount(0); return; }
            const count = Object.values(snap.val()).filter((r: any) => r.status === "open").length;
            setReportsCount(count);
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" as const },
    };

    return (
        <Tabs screenOptions={opts}>

            {/* ── Dashboard ─────────────────────────────────────────────── */}
            <Tabs.Screen
                name="index"
                options={{
                    title: "Dashboard",
                    tabBarIcon: ({ color }) => <FontAwesome name="dashboard" size={24} color={color} />,
                }}
            />

            {/* ── Drivers ───────────────────────────────────────────────── */}
            <Tabs.Screen
                name="drivers"
                options={{
                    title: "Drivers",
                    tabBarIcon: ({ color }) => <FontAwesome name="users" size={24} color={color} />,
                }}
            />

            {/* ── Applications (badge: pending registrations) ───────────── */}
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

            {/* ── Reports (badge: open reports, amber) ──────────────────── */}
            <Tabs.Screen
                name="reports"
                options={{
                    title: "Reports",
                    tabBarIcon: ({ color }) => (
                        <View style={{ position: "relative" }}>
                            <FontAwesome name="exclamation-circle" size={24} color={color} />
                            <TabBadge count={reportsCount} color="#f59e0b" />
                        </View>
                    ),
                }}
            />

            {/* ── Fare Management ───────────────────────────────────────── */}
            <Tabs.Screen
                name="FareManagement"
                options={{
                    title: "Fares",
                    tabBarIcon: ({ color }) => <FontAwesome name="gears" size={24} color={color} />,
                }}
            />

            {/* ── Hide revenue.tsx if it still exists in the folder ─────── */}
            <Tabs.Screen name="revenue"  options={{ href: null }} />
            <Tabs.Screen name="history"  options={{ href: null }} />
            <Tabs.Screen name="jeeps"    options={{ href: null }} />
            <Tabs.Screen name="settings" options={{ href: null }} />

        </Tabs>
    );
}
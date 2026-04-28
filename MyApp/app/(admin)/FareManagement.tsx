/**
 * app/(admin)/FareManagement.tsx
 *
 * CHANGES:
 *  1. Dark mode: uses useTheme() and applies conditional colours throughout.
 *  2. Clear Map button: new "Maintenance" section that removes all entries
 *     from the jeeps/ node, instantly clearing all driver markers from the
 *     passenger/guest map view. Useful when stale data is stuck on the map.
 *
 * DARK MODE PATTERN for other admin screens:
 *   Copy the useTheme() call and the bg/card/textMain/textMuted variables,
 *   then replace hard-coded colours with those variables.
 */

import React, { useEffect, useState } from "react";
import {
    View, Text, TouchableOpacity, StyleSheet,
    TextInput, Alert, ActivityIndicator, ScrollView,
    KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LogOut, MapPin, Save, Users, Trash2, Map } from "lucide-react-native";
import { auth, db, ref, onValue, set, signOut, remove } from "../../services/firebase";
import { useTheme } from "../ThemeContext";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Fares {
    zone1: number; zone1Disc: number;
    zone2: number; zone2Disc: number;
    zone3: number; zone3Disc: number;
    zone4: number; zone4Disc: number;
}

const FARE_LABELS = [
    { key: "zone1", discKey: "zone1Disc", label: "Zone 1", desc: "Town → Shell",         color: "#15803d" },
    { key: "zone2", discKey: "zone2Disc", label: "Zone 2", desc: "Shell → Junction",      color: "#2563eb" },
    { key: "zone3", discKey: "zone3Disc", label: "Zone 3", desc: "Junction → Centro",     color: "#d97706" },
    { key: "zone4", discKey: "zone4Disc", label: "Zone 4", desc: "Centro → Balacbac",     color: "#7c3aed" },
] as const;

const DEFAULT_FARES: Fares = {
    zone1: 13, zone1Disc: 10,
    zone2: 15, zone2Disc: 12,
    zone3: 17, zone3Disc: 14,
    zone4: 20, zone4Disc: 16,
};

// ─────────────────────────────────────────────────────────────────────────────
// FARE MANAGEMENT SECTION
// ─────────────────────────────────────────────────────────────────────────────

function FareManagement({ dark }: { dark: boolean }) {
    const [fares, setFares] = useState<Fares>(DEFAULT_FARES);
    const [draft, setDraft] = useState<Record<keyof Fares, string>>({
        zone1: "13", zone1Disc: "10",
        zone2: "15", zone2Disc: "12",
        zone3: "17", zone3Disc: "14",
        zone4: "20", zone4Disc: "16",
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [dirty, setDirty]     = useState(false);

    // Theme-aware colours
    const cardBg   = dark ? "#1e293b" : "#fff";
    const border   = dark ? "#334155" : "#e5e7eb";
    const textMain = dark ? "#f1f5f9" : "#111827";
    const textMuted= dark ? "#94a3b8" : "#9ca3af";
    const inputBg  = dark ? "#0f172a" : "#f9fafb";
    const inputBorder = dark ? "#475569" : "#e5e7eb";

    useEffect(() => {
        const unsub = onValue(ref(db, "config/fares"), snap => {
            const data: Fares = snap.exists() ? { ...DEFAULT_FARES, ...snap.val() } : DEFAULT_FARES;
            setFares(data);
            const newDraft: any = {};
            Object.keys(data).forEach(k => newDraft[k] = String(data[k as keyof Fares]));
            setDraft(newDraft);
            setLoading(false);
            setDirty(false);
        });
        return () => unsub();
    }, []);

    const handleChange = (key: keyof Fares, val: string) => {
        setDraft(prev => ({ ...prev, [key]: val }));
        setDirty(true);
    };

    const handleSave = async () => {
        const parsed: any = {};
        for (const key of Object.keys(draft)) {
            const n = parseFloat(draft[key as keyof Fares]);
            if (isNaN(n) || n < 0) {
                Alert.alert("Invalid Fare", "Please enter valid amounts for all fields.");
                return;
            }
            parsed[key] = n;
        }
        setSaving(true);
        try {
            await set(ref(db, "config/fares"), parsed as Fares);
            setDirty(false);
            Alert.alert("✅ Saved", "Fare matrix updated.");
        } catch (e) {
            Alert.alert("Error", "Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <View style={f.loadBox}><ActivityIndicator color="#15803d" /></View>;

    return (
        <View style={[f.container, { backgroundColor: cardBg, borderColor: border }]}>
            <View style={f.sectionHeader}>
                <View style={[f.sectionIcon, { backgroundColor: dark ? "#14532d" : "#f0fdf4" }]}>
                    <MapPin color="#15803d" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[f.sectionTitle, { color: textMain }]}>Fare Matrix</Text>
                    <Text style={[f.sectionSub, { color: textMuted }]}>Manage regular and discounted rates</Text>
                </View>
            </View>

            {/* Header Row */}
            <View style={f.tableHeader}>
                <Text style={[f.columnLabel, { flex: 1, color: textMuted }]}>Zone Path</Text>
                <Text style={[f.columnLabel, { width: 70, textAlign: "center", color: textMuted }]}>Regular</Text>
                <Text style={[f.columnLabel, { width: 70, textAlign: "center", color: textMuted }]}>Disc.</Text>
            </View>

            {FARE_LABELS.map(({ key, discKey, label, desc, color }) => (
                <View key={key} style={[f.fareRow, { borderTopColor: dark ? "#334155" : "#f3f4f6" }]}>
                    <View style={[f.fareColorBar, { backgroundColor: color }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={[f.fareLabel, { color: textMain }]}>{label}</Text>
                        <Text style={[f.fareDesc, { color: textMuted }]} numberOfLines={1}>{desc}</Text>
                    </View>

                    <View style={[f.fareInputWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                        <TextInput
                            style={[f.fareInput, { color: textMain }]}
                            value={draft[key]}
                            onChangeText={v => handleChange(key, v)}
                            keyboardType="decimal-pad"
                            maxLength={4}
                        />
                    </View>

                    <View style={[f.fareInputWrap, { backgroundColor: dark ? "#14532d" : "#f0fdf4", borderColor: inputBorder }]}>
                        <TextInput
                            style={[f.fareInput, { color: "#15803d" }]}
                            value={draft[discKey as keyof Fares]}
                            onChangeText={v => handleChange(discKey as keyof Fares, v)}
                            keyboardType="decimal-pad"
                            maxLength={4}
                        />
                    </View>
                </View>
            ))}

            <View style={[f.infoBox, { backgroundColor: dark ? "#0f172a" : "#f8fafc" }]}>
                <Users size={14} color={textMuted} />
                <Text style={[f.infoTxt, { color: textMuted }]}>
                    Discount applies to Students, Seniors, and PWDs.
                </Text>
            </View>

            <View style={f.btnRow}>
                <TouchableOpacity
                    style={[f.saveBtn, !dirty && f.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={!dirty || saving}
                >
                    {saving
                        ? <ActivityIndicator color="white" size="small" />
                        : <><Save color="white" size={16} /><Text style={f.saveTxt}>Save Changes</Text></>
                    }
                </TouchableOpacity>
            </View>
        </View>
    );
}

const f = StyleSheet.create({
    container:    { borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, elevation: 2 },
    loadBox:      { padding: 40, alignItems: "center" },
    sectionHeader:{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
    sectionIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    sectionTitle: { fontSize: 16, fontWeight: "800" },
    sectionSub:   { fontSize: 11 },

    tableHeader:  { flexDirection: "row", marginBottom: 8, paddingHorizontal: 4 },
    columnLabel:  { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },

    fareRow:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1 },
    fareColorBar: { width: 4, height: 32, borderRadius: 2 },
    fareLabel:    { fontSize: 13, fontWeight: "700" },
    fareDesc:     { fontSize: 10 },

    fareInputWrap:{ width: 65, borderRadius: 8, borderWidth: 1 },
    fareInput:    { fontSize: 14, fontWeight: "800", paddingVertical: 6, textAlign: "center" },

    infoBox:      { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, padding: 10, borderRadius: 10 },
    infoTxt:      { fontSize: 11, fontStyle: "italic" },

    btnRow:       { marginTop: 20 },
    saveBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#15803d", borderRadius: 12, paddingVertical: 14 },
    saveBtnDisabled:{ backgroundColor: "#9ca3af" },
    saveTxt:      { color: "white", fontWeight: "800", fontSize: 15 },
});

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR MAP SECTION
// Removes all entries in jeeps/ node so no driver markers appear on the map.
// Drivers will reappear automatically when they start a new trip.
// ─────────────────────────────────────────────────────────────────────────────

function ClearMapSection({ dark }: { dark: boolean }) {
    const [clearing, setClearing] = useState(false);
    const [liveCount, setLiveCount] = useState(0);

    const cardBg   = dark ? "#1e293b" : "#fff";
    const border   = dark ? "#334155" : "#e5e7eb";
    const textMain = dark ? "#f1f5f9" : "#111827";
    const textMuted= dark ? "#94a3b8" : "#6b7280";

    // Live count of how many jeeps are on the map
    useEffect(() => {
        const unsub = onValue(ref(db, "jeeps"), snap => {
            setLiveCount(snap.exists() ? Object.keys(snap.val()).length : 0);
        });
        return () => unsub();
    }, []);

    const handleClearMap = () => {
        Alert.alert(
            "Clear Live Map Data?",
            `This will remove all ${liveCount} active jeep position${liveCount !== 1 ? "s" : ""} from the map.\n\nDrivers will reappear automatically when they start a new trip. This does NOT delete any trip history or revenue records.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear Map",
                    style: "destructive",
                    onPress: async () => {
                        setClearing(true);
                        try {
                            await remove(ref(db, "jeeps"));
                            Alert.alert("✅ Map Cleared", "All live jeep positions have been removed.");
                        } catch {
                            Alert.alert("Error", "Failed to clear map data. Check your connection.");
                        } finally {
                            setClearing(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={[m.container, { backgroundColor: cardBg, borderColor: border }]}>
            <View style={m.header}>
                <View style={[m.iconBox, { backgroundColor: dark ? "#1c1917" : "#fef2f2" }]}>
                    <Map color="#ef4444" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[m.title, { color: textMain }]}>Live Map</Text>
                    <Text style={[m.sub, { color: textMuted }]}>
                        {liveCount > 0
                            ? `${liveCount} active jeep position${liveCount !== 1 ? "s" : ""} on map`
                            : "No active jeeps on map"
                        }
                    </Text>
                </View>
                <View style={[m.liveIndicator, { backgroundColor: liveCount > 0 ? "#dcfce7" : "#f3f4f6" }]}>
                    <View style={[m.liveDot, { backgroundColor: liveCount > 0 ? "#15803d" : "#9ca3af" }]} />
                    <Text style={[m.liveTxt, { color: liveCount > 0 ? "#15803d" : "#6b7280" }]}>
                        {liveCount > 0 ? "Live" : "Empty"}
                    </Text>
                </View>
            </View>

            <Text style={[m.desc, { color: textMuted }]}>
                Use this if stale jeep markers are stuck on the map. Drivers will reappear
                automatically when they start a new trip. Trip history and revenue are not affected.
            </Text>

            <TouchableOpacity
                style={[m.clearBtn, (clearing || liveCount === 0) && m.clearBtnDisabled]}
                onPress={handleClearMap}
                disabled={clearing || liveCount === 0}
                activeOpacity={0.8}
            >
                {clearing
                    ? <ActivityIndicator color="white" size="small" />
                    : <>
                        <Trash2 color="white" size={16} />
                        <Text style={m.clearBtnTxt}>
                            {liveCount === 0 ? "Map Already Clear" : "Clear Map Data"}
                        </Text>
                      </>
                }
            </TouchableOpacity>
        </View>
    );
}

const m = StyleSheet.create({
    container:   { borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, elevation: 2 },
    header:      { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
    iconBox:     { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    title:       { fontSize: 16, fontWeight: "800" },
    sub:         { fontSize: 11, marginTop: 2 },
    liveIndicator:{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    liveDot:     { width: 7, height: 7, borderRadius: 4 },
    liveTxt:     { fontSize: 11, fontWeight: "700" },
    desc:        { fontSize: 12, lineHeight: 18, marginBottom: 16 },
    clearBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#ef4444", borderRadius: 12, paddingVertical: 14 },
    clearBtnDisabled: { backgroundColor: "#9ca3af" },
    clearBtnTxt: { color: "white", fontWeight: "800", fontSize: 15 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminSettings() {
    const router = useRouter();
    const { darkMode } = useTheme();   // ← DARK MODE

    // Theme-aware colours for top-level containers
    const bgColor   = darkMode ? "#0a0f1a" : "#f9fafb";
    const headerBg  = darkMode ? "#0f172a" : "#fff";
    const headerBorder = darkMode ? "#1e293b" : "#e5e7eb";
    const titleColor   = darkMode ? "#4ade80" : "#15803d";

    const handleLogout = async () => { await signOut(auth); router.replace("/login"); };

    return (
        <SafeAreaView style={[s.container, { backgroundColor: bgColor }]}>
            <View style={[s.header, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
                <Text style={[s.title, { color: titleColor }]}>Fare & Zone Editor</Text>
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <ScrollView contentContainerStyle={s.body}>

                    {/* Fare matrix */}
                    <FareManagement dark={darkMode} />

                    {/* Clear map utility */}
                    <ClearMapSection dark={darkMode} />

                    {/* Logout */}
                    <TouchableOpacity
                        style={[s.logoutBtn, { backgroundColor: darkMode ? "#1c1917" : "#fef2f2" }]}
                        onPress={handleLogout}
                    >
                        <LogOut color="#ef4444" size={20} />
                        <Text style={s.logoutText}>Log Out</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container:  { flex: 1 },
    header:     { padding: 20, borderBottomWidth: 1 },
    title:      { fontSize: 22, fontWeight: "900" },
    body:       { padding: 16 },
    logoutBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 14, marginTop: 10 },
    logoutText: { color: "#ef4444", fontWeight: "700", fontSize: 16 },
});
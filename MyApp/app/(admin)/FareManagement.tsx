import React, { useEffect, useState } from "react";
import {
    View, Text, TouchableOpacity, StyleSheet,
    TextInput, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LogOut, MapPin, Save, RefreshCw, Users } from "lucide-react-native";
import { auth, db, ref, onValue, set, signOut } from "../../services/firebase";

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
    { key: "zone1", discKey: "zone1Disc", label: "Zone 1", desc: "Town → Shell", color: "#15803d" },
    { key: "zone2", discKey: "zone2Disc", label: "Zone 2", desc: "Shell → Junction", color: "#2563eb" },
    { key: "zone3", discKey: "zone3Disc", label: "Zone 3", desc: "Junction → Centro", color: "#d97706" },
    { key: "zone4", discKey: "zone4Disc", label: "Zone 4", desc: "Centro → Balacbac", color: "#7c3aed" },
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

function FareManagement() {
    const [fares, setFares] = useState<Fares>(DEFAULT_FARES);
    const [draft, setDraft] = useState<Record<keyof Fares, string>>({
        zone1: "13", zone1Disc: "10",
        zone2: "15", zone2Disc: "12",
        zone3: "17", zone3Disc: "14",
        zone4: "20", zone4Disc: "16",
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

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
        <View style={f.container}>
            <View style={f.sectionHeader}>
                <View style={f.sectionIcon}><MapPin color="#15803d" size={18} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={f.sectionTitle}>Fare Matrix</Text>
                    <Text style={f.sectionSub}>Manage regular and discounted rates</Text>
                </View>
            </View>

            {/* Header Row for columns */}
            <View style={f.tableHeader}>
                <Text style={[f.columnLabel, { flex: 1 }]}>Zone Path</Text>
                <Text style={[f.columnLabel, { width: 70, textAlign: 'center' }]}>Regular</Text>
                <Text style={[f.columnLabel, { width: 70, textAlign: 'center' }]}>Disc.</Text>
            </View>

            {FARE_LABELS.map(({ key, discKey, label, desc, color }) => (
                <View key={key} style={f.fareRow}>
                    <View style={[f.fareColorBar, { backgroundColor: color }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={f.fareLabel}>{label}</Text>
                        <Text style={f.fareDesc} numberOfLines={1}>{desc}</Text>
                    </View>

                    {/* Regular Input */}
                    <View style={f.fareInputWrap}>
                        <TextInput
                            style={f.fareInput}
                            value={draft[key]}
                            onChangeText={v => handleChange(key, v)}
                            keyboardType="decimal-pad"
                            maxLength={4}
                        />
                    </View>

                    {/* Discounted Input */}
                    <View style={[f.fareInputWrap, { backgroundColor: "#f0fdf4" }]}>
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

            <View style={f.infoBox}>
                <Users size={14} color="#6b7280" />
                <Text style={f.infoTxt}>Discount applies to Students, Seniors, and PWDs.</Text>
            </View>

            <View style={f.btnRow}>
                <TouchableOpacity 
                    style={[f.saveBtn, !dirty && f.saveBtnDisabled]} 
                    onPress={handleSave} 
                    disabled={!dirty || saving}
                >
                    {saving ? <ActivityIndicator color="white" size="small" /> : <><Save color="white" size={16} /><Text style={f.saveTxt}>Save Changes</Text></>}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const f = StyleSheet.create({
    container:    { backgroundColor: "#fff", borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#e5e7eb", elevation: 2 },
    loadBox:      { padding: 40, alignItems: "center" },
    sectionHeader:{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
    sectionIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
    sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
    sectionSub:   { fontSize: 11, color: "#6b7280" },
    
    tableHeader:  { flexDirection: "row", marginBottom: 8, paddingHorizontal: 4 },
    columnLabel:  { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase" },

    fareRow:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
    fareColorBar: { width: 4, height: 32, borderRadius: 2 },
    fareLabel:    { fontSize: 13, fontWeight: "700", color: "#111827" },
    fareDesc:     { fontSize: 10, color: "#9ca3af" },
    
    fareInputWrap:{ width: 65, backgroundColor: "#f9fafb", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb" },
    fareInput:    { fontSize: 14, fontWeight: "800", color: "#111827", paddingVertical: 6, textAlign: "center" },

    infoBox:      { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, backgroundColor: "#f8fafc", padding: 10, borderRadius: 10 },
    infoTxt:      { fontSize: 11, color: "#6b7280", fontStyle: "italic" },

    btnRow:       { marginTop: 20 },
    saveBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#15803d", borderRadius: 12, paddingVertical: 14 },
    saveBtnDisabled:{ backgroundColor: "#9ca3af" },
    saveTxt:      { color: "white", fontWeight: "800", fontSize: 15 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminSettings() {
    const router = useRouter();
    const handleLogout = async () => { await signOut(auth); router.replace("/login"); };

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}><Text style={s.title}>Fare & Zone Editor</Text></View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <ScrollView contentContainerStyle={s.body}>
                    <FareManagement />
                    <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
                        <LogOut color="#ef4444" size={20} />
                        <Text style={s.logoutText}>Log Out</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container:  { flex: 1, backgroundColor: "#f9fafb" },
    header:     { backgroundColor: "#fff", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
    title:      { fontSize: 22, fontWeight: "900", color: "#15803d" },
    body:       { padding: 16 },
    logoutBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fef2f2", padding: 16, borderRadius: 14, marginTop: 10 },
    logoutText: { color: "#ef4444", fontWeight: "700", fontSize: 16 },
});
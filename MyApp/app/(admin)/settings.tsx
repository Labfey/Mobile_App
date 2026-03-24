import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import { auth, signOut } from "../../services/firebase";

export default function AdminSettings() {
    const router = useRouter();

    const handleLogout = async () => {
        await signOut(auth);
        router.replace("/login");
    };

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <Text style={s.title}>Settings</Text>
                <Text style={s.sub}>Admin preferences</Text>
            </View>
            <View style={s.body}>
                <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
                    <LogOut color="#ef4444" size={20} />
                    <Text style={s.logoutText}>Log Out</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    title: { fontSize: 22, fontWeight: '900', color: '#15803d' },
    sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    body: { padding: 20 },
    logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fef2f2', padding: 16, borderRadius: 14 },
    logoutText: { color: '#ef4444', fontWeight: '700', fontSize: 16 },
});
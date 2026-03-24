// jeeps.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AdminJeeps() {
    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <Text style={s.title}>Jeeps</Text>
                <Text style={s.sub}>Manage all jeepneys</Text>
            </View>
            <View style={s.center}>
                <Text style={s.placeholder}>🚌  Jeep management coming soon</Text>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    title: { fontSize: 22, fontWeight: '900', color: '#15803d' },
    sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    placeholder: { fontSize: 16, color: '#9ca3af' },
});
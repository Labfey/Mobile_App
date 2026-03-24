import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Users } from "lucide-react-native";
import { db, ref, onValue } from "../../services/firebase";

export default function AdminDrivers() {
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const usersRef = ref(db, 'users');
        onValue(usersRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const driverList = Object.entries(data)
                    .filter(([_, val]: any) => val.role === 'driver')
                    .map(([uid, val]: any) => ({ uid, ...val }));
                setDrivers(driverList);
            }
            setLoading(false);
        });
    }, []);

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <Text style={s.title}>Drivers</Text>
                <Text style={s.sub}>{drivers.length} registered</Text>
            </View>

            {loading ? (
                <ActivityIndicator color="#15803d" style={{ marginTop: 40 }} />
            ) : (
                <ScrollView contentContainerStyle={s.list}>
                    {drivers.map((driver) => (
                        <View key={driver.uid} style={s.card}>
                            <View style={s.avatar}>
                                <Text style={s.avatarText}>
                                    {driver.username?.charAt(0).toUpperCase() ?? 'D'}
                                </Text>
                            </View>
                            <View style={s.info}>
                                <Text style={s.name}>{driver.username ?? 'Unknown'}</Text>
                                <Text style={s.email}>{driver.email ?? 'No email'}</Text>
                            </View>
                            <View style={s.badge}>
                                <Text style={s.badgeText}>Driver</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    title: { fontSize: 22, fontWeight: '900', color: '#15803d' },
    sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    list: { padding: 16, gap: 10 },
    card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarText: { fontSize: 18, fontWeight: '800', color: '#15803d' },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '700', color: '#111827' },
    email: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    badge: { backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeText: { color: '#15803d', fontSize: 12, fontWeight: '700' },
});
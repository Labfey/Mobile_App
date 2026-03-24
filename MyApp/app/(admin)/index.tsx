import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator, RefreshControl
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bus, Users, CheckCircle, XCircle, LogOut, TrendingUp } from "lucide-react-native";
import { auth, db, ref, onValue, signOut } from "../../services/firebase";

export default function AdminDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({
        totalDrivers: 0,
        totalJeeps: 0,
        activeJeeps: 0,
        inactiveJeeps: 0,
    });
    const [jeeps, setJeeps] = useState<any[]>([]);
    const [jeepInfo, setJeepInfo] = useState<{ [key: string]: any }>({});

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = () => {
        // Listen to jeeps
        const jeepsRef = ref(db, 'jeeps');
        onValue(jeepsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const jeepList = Object.entries(data).map(([uid, val]: any) => ({
                    uid,
                    ...val,
                }));
                setJeeps(jeepList);

                const active = jeepList.filter(j => j.status === 'available').length;
                setStats(prev => ({
                    ...prev,
                    totalJeeps: jeepList.length,
                    activeJeeps: active,
                    inactiveJeeps: jeepList.length - active,
                }));
            }
            setLoading(false);
            setRefreshing(false);
        });

        // Listen to jeep_info for driver names
        const infoRef = ref(db, 'jeep_info');
        onValue(infoRef, (snapshot) => {
            if (snapshot.exists()) {
                setJeepInfo(snapshot.val());
            }
        });

        // Listen to users for driver count
        const usersRef = ref(db, 'users');
        onValue(usersRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const drivers = Object.values(data).filter((u: any) => u.role === 'driver').length;
                setStats(prev => ({ ...prev, totalDrivers: drivers }));
            }
        });
    };

    const handleLogout = async () => {
        await signOut(auth);
        router.replace("/login");
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    if (loading) {
        return (
            <View style={s.loadingContainer}>
                <ActivityIndicator size="large" color="#15803d" />
                <Text style={s.loadingText}>Loading Dashboard...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.headerTitle}>Admin Panel</Text>
                    <Text style={s.headerSub}>JeepRoute – Balacbac Transit</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
                    <LogOut color="#ef4444" size={20} />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#15803d" />}
            >
                {/* Stat Cards */}
                <View style={s.statsGrid}>
                    <View style={[s.statCard, { backgroundColor: '#f0fdf4' }]}>
                        <Users color="#15803d" size={22} />
                        <Text style={s.statNumber}>{stats.totalDrivers}</Text>
                        <Text style={s.statLabel}>Total Drivers</Text>
                    </View>
                    <View style={[s.statCard, { backgroundColor: '#eff6ff' }]}>
                        <Bus color="#2563eb" size={22} />
                        <Text style={[s.statNumber, { color: '#2563eb' }]}>{stats.totalJeeps}</Text>
                        <Text style={s.statLabel}>Total Jeeps</Text>
                    </View>
                    <View style={[s.statCard, { backgroundColor: '#f0fdf4' }]}>
                        <CheckCircle color="#15803d" size={22} />
                        <Text style={s.statNumber}>{stats.activeJeeps}</Text>
                        <Text style={s.statLabel}>Active</Text>
                    </View>
                    <View style={[s.statCard, { backgroundColor: '#fef2f2' }]}>
                        <XCircle color="#ef4444" size={22} />
                        <Text style={[s.statNumber, { color: '#ef4444' }]}>{stats.inactiveJeeps}</Text>
                        <Text style={s.statLabel}>Inactive</Text>
                    </View>
                </View>

                {/* Live Jeep Status */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <TrendingUp color="#15803d" size={18} />
                        <Text style={s.sectionTitle}>Live Jeep Status</Text>
                    </View>

                    {jeeps.length === 0 ? (
                        <Text style={s.emptyText}>No jeeps found.</Text>
                    ) : (
                        jeeps.map((jeep) => {
                            const info = jeepInfo[jeep.uid];
                            const isActive = jeep.status === 'available';
                            return (
                                <View key={jeep.uid} style={s.jeepCard}>
                                    <View style={[s.statusDot, { backgroundColor: isActive ? '#15803d' : '#9ca3af' }]} />
                                    <View style={s.jeepInfo}>
                                        <Text style={s.jeepName}>
                                            {info?.driverName ?? 'Unknown Driver'}
                                        </Text>
                                        <Text style={s.jeepPlate}>
                                            {info?.plate ?? 'No plate'} · {info?.route ?? 'No route'}
                                        </Text>
                                        <Text style={s.jeepCoords}>
                                            {jeep.latitude?.toFixed(5)}, {jeep.longitude?.toFixed(5)}
                                        </Text>
                                    </View>
                                    <View style={[s.statusBadge, { backgroundColor: isActive ? '#dcfce7' : '#f3f4f6' }]}>
                                        <Text style={[s.statusText, { color: isActive ? '#15803d' : '#6b7280' }]}>
                                            {isActive ? 'Active' : 'Inactive'}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
    loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#ffffff', paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    },
    headerTitle: { fontSize: 22, fontWeight: '900', color: '#15803d' },
    headerSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    logoutBtn: { padding: 8, backgroundColor: '#fef2f2', borderRadius: 10 },

    statsGrid: {
        flexDirection: 'row', flexWrap: 'wrap',
        paddingHorizontal: 16, paddingTop: 20, gap: 12,
    },
    statCard: {
        width: '47%', borderRadius: 16, padding: 16,
        alignItems: 'flex-start', gap: 6,
    },
    statNumber: { fontSize: 28, fontWeight: '900', color: '#15803d' },
    statLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },

    section: { marginTop: 24, paddingHorizontal: 16, paddingBottom: 30 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
    emptyText: { color: '#9ca3af', textAlign: 'center', marginTop: 20 },

    jeepCard: {
        backgroundColor: '#ffffff', borderRadius: 14, padding: 14,
        flexDirection: 'row', alignItems: 'center', marginBottom: 10,
        borderWidth: 1, borderColor: '#e5e7eb',
    },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
    jeepInfo: { flex: 1 },
    jeepName: { fontSize: 15, fontWeight: '700', color: '#111827' },
    jeepPlate: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    jeepCoords: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 12, fontWeight: '700' },
});
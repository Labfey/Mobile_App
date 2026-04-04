import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    TouchableOpacity, Modal, Dimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Users, ChevronRight, X, MapPin, Calendar,
    Clock, TrendingUp, Navigation, BarChart2
} from "lucide-react-native";
import { db, ref, onValue, get } from "../../services/firebase";

const { height } = Dimensions.get("window");

interface Driver {
    uid: string;
    username: string;
    email: string;
    role: string;
    createdAt?: number;
}

interface Trip {
    id: string;
    destination: string;
    startTime: number;
    endTime: number | null;
    date: string;
}

type TripView = "today" | "week";

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(start: number, end: number | null): string {
    if (!end) return "Ongoing";
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

function getTodayString(): string {
    return new Date().toISOString().split("T")[0];
}

function getWeekStart(): string {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
}

export default function AdminDrivers() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Driver | null>(null);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [tripsLoading, setTripsLoading] = useState(false);
    const [tripView, setTripView] = useState<TripView>("today");

    useEffect(() => {
        const usersRef = ref(db, "users");
        const unsub = onValue(usersRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const driverList = Object.entries(data)
                    .filter(([_, val]: any) => val.role === "driver")
                    .map(([uid, val]: any) => ({ uid, ...val }));
                setDrivers(driverList);
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const openDriver = async (driver: Driver) => {
        setSelected(driver);
        setTripsLoading(true);
        setTrips([]);
        try {
            const tripsRef = ref(db, `driver_trips/${driver.uid}`);
            const snap = await get(tripsRef);
            if (snap.exists()) {
                const data = snap.val() as Record<string, Omit<Trip, "id">>;
                const list = Object.entries(data)
                    .map(([id, val]) => ({ id, ...val }))
                    .sort((a, b) => b.startTime - a.startTime);
                setTrips(list);
            } else {
                setTrips([]);
            }
        } catch {
            setTrips([]);
        } finally {
            setTripsLoading(false);
        }
    };

    const today = getTodayString();
    const weekStart = getWeekStart();

    const todayTrips = trips.filter((t) => t.date === today);
    const weekTrips = trips.filter((t) => t.date >= weekStart);
    const displayTrips = tripView === "today" ? todayTrips : weekTrips;

    // Stats
    const todayCount = todayTrips.length;
    const weekCount = weekTrips.length;
    const completedToday = todayTrips.filter((t) => t.endTime).length;
    const avgDurationMins = weekTrips.filter((t) => t.endTime).length > 0
        ? Math.round(
            weekTrips
                .filter((t) => t.endTime)
                .reduce((sum, t) => sum + (t.endTime! - t.startTime) / 60000, 0) /
            weekTrips.filter((t) => t.endTime).length
        )
        : 0;

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <Text style={s.title}>Drivers</Text>
                <Text style={s.sub}>{drivers.length} registered</Text>
            </View>

            {loading ? (
                <ActivityIndicator color="#15803d" style={{ marginTop: 40 }} />
            ) : (
                <ScrollView contentContainerStyle={s.list}>
                    {drivers.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Users color="#d1d5db" size={48} />
                            <Text style={s.emptyText}>No drivers registered yet.</Text>
                        </View>
                    ) : (
                        drivers.map((driver) => (
                            <TouchableOpacity
                                key={driver.uid}
                                style={s.card}
                                onPress={() => openDriver(driver)}
                                activeOpacity={0.75}
                            >
                                <View style={s.avatar}>
                                    <Text style={s.avatarText}>
                                        {driver.username?.charAt(0)?.toUpperCase() ?? "D"}
                                    </Text>
                                </View>
                                <View style={s.info}>
                                    <Text style={s.name}>{driver.username ?? "Unknown"}</Text>
                                    <Text style={s.email}>{driver.email ?? "No email"}</Text>
                                </View>
                                <View style={s.cardRight}>
                                    <View style={s.badge}>
                                        <Text style={s.badgeText}>Driver</Text>
                                    </View>
                                    <ChevronRight color="#9ca3af" size={18} />
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            )}

            {/* ── DRIVER DETAIL MODAL ── */}
            <Modal visible={!!selected} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalSheet}>
                        <View style={s.sheetHandle} />

                        {selected && (
                            <>
                                {/* Driver header */}
                                <View style={s.modalHeader}>
                                    <View style={s.modalAvatar}>
                                        <Text style={s.modalAvatarText}>
                                            {selected.username?.charAt(0)?.toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.modalName}>{selected.username}</Text>
                                        <Text style={s.modalEmail}>{selected.email}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                                        <X color="#6b7280" size={20} />
                                    </TouchableOpacity>
                                </View>

                                {/* Quick stats */}
                                <View style={s.quickStats}>
                                    <View style={[s.quickStat, { backgroundColor: "#f0fdf4" }]}>
                                        <Navigation color="#15803d" size={16} />
                                        <Text style={[s.quickStatNum, { color: "#15803d" }]}>{todayCount}</Text>
                                        <Text style={s.quickStatLabel}>Today</Text>
                                    </View>
                                    <View style={[s.quickStat, { backgroundColor: "#eff6ff" }]}>
                                        <BarChart2 color="#3b82f6" size={16} />
                                        <Text style={[s.quickStatNum, { color: "#3b82f6" }]}>{weekCount}</Text>
                                        <Text style={s.quickStatLabel}>This Week</Text>
                                    </View>
                                    <View style={[s.quickStat, { backgroundColor: "#fefce8" }]}>
                                        <TrendingUp color="#d97706" size={16} />
                                        <Text style={[s.quickStatNum, { color: "#d97706" }]}>
                                            {avgDurationMins > 0 ? `${avgDurationMins}m` : "—"}
                                        </Text>
                                        <Text style={s.quickStatLabel}>Avg Trip</Text>
                                    </View>
                                    <View style={[s.quickStat, { backgroundColor: "#f0fdf4" }]}>
                                        <Clock color="#15803d" size={16} />
                                        <Text style={[s.quickStatNum, { color: "#15803d" }]}>{completedToday}</Text>
                                        <Text style={s.quickStatLabel}>Done Today</Text>
                                    </View>
                                </View>

                                {/* View Toggle */}
                                <View style={s.toggleRow}>
                                    <TouchableOpacity
                                        style={[s.toggleBtn, tripView === "today" && s.toggleBtnActive]}
                                        onPress={() => setTripView("today")}
                                    >
                                        <Calendar size={14} color={tripView === "today" ? "#fff" : "#6b7280"} />
                                        <Text style={[s.toggleText, tripView === "today" && s.toggleTextActive]}>
                                            Today
                                        </Text>
                                        {todayCount > 0 && (
                                            <View style={[s.toggleCount, { backgroundColor: tripView === "today" ? "rgba(255,255,255,0.3)" : "#e5e7eb" }]}>
                                                <Text style={{ fontSize: 10, fontWeight: "800", color: tripView === "today" ? "#fff" : "#374151" }}>
                                                    {todayCount}
                                                </Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[s.toggleBtn, tripView === "week" && s.toggleBtnActive]}
                                        onPress={() => setTripView("week")}
                                    >
                                        <BarChart2 size={14} color={tripView === "week" ? "#fff" : "#6b7280"} />
                                        <Text style={[s.toggleText, tripView === "week" && s.toggleTextActive]}>
                                            This Week
                                        </Text>
                                        {weekCount > 0 && (
                                            <View style={[s.toggleCount, { backgroundColor: tripView === "week" ? "rgba(255,255,255,0.3)" : "#e5e7eb" }]}>
                                                <Text style={{ fontSize: 10, fontWeight: "800", color: tripView === "week" ? "#fff" : "#374151" }}>
                                                    {weekCount}
                                                </Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </View>

                                {/* Trip list */}
                                <ScrollView style={s.tripList} showsVerticalScrollIndicator={false}>
                                    {tripsLoading ? (
                                        <ActivityIndicator color="#15803d" style={{ marginTop: 24 }} />
                                    ) : displayTrips.length === 0 ? (
                                        <View style={s.noTrips}>
                                            <Text style={s.noTripsIcon}>🚌</Text>
                                            <Text style={s.noTripsText}>
                                                No trips {tripView === "today" ? "today" : "this week"}.
                                            </Text>
                                        </View>
                                    ) : (
                                        displayTrips.map((trip, i) => (
                                            <View key={trip.id} style={s.tripCard}>
                                                {/* Timeline dot */}
                                                <View style={s.timelineDot}>
                                                    <View style={[
                                                        s.dot,
                                                        { backgroundColor: trip.endTime ? "#15803d" : "#f59e0b" }
                                                    ]} />
                                                    {i < displayTrips.length - 1 && <View style={s.timelineLine} />}
                                                </View>
                                                <View style={s.tripContent}>
                                                    <View style={s.tripTop}>
                                                        <View style={{ flex: 1 }}>
                                                            <View style={s.tripDestRow}>
                                                                <MapPin color="#15803d" size={13} />
                                                                <Text style={s.tripDest}>To {trip.destination}</Text>
                                                            </View>
                                                            <Text style={s.tripDate}>
                                                                {new Date(trip.startTime).toLocaleDateString("en-PH", {
                                                                    weekday: "short", month: "short", day: "numeric"
                                                                })}
                                                            </Text>
                                                        </View>
                                                        <View style={[
                                                            s.tripStatusBadge,
                                                            { backgroundColor: trip.endTime ? "#dcfce7" : "#fef3c7" }
                                                        ]}>
                                                            <Text style={[
                                                                s.tripStatusText,
                                                                { color: trip.endTime ? "#15803d" : "#d97706" }
                                                            ]}>
                                                                {trip.endTime ? "✓ Done" : "● Active"}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <View style={s.tripTimes}>
                                                        <View style={s.tripTimeItem}>
                                                            <Clock size={11} color="#9ca3af" />
                                                            <Text style={s.tripTimeText}>
                                                                {formatTime(trip.startTime)}
                                                                {trip.endTime ? ` – ${formatTime(trip.endTime)}` : " (ongoing)"}
                                                            </Text>
                                                        </View>
                                                        <Text style={s.tripDuration}>
                                                            {formatDuration(trip.startTime, trip.endTime)}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        ))
                                    )}
                                </ScrollView>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f9fafb" },
    header: {
        backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
    },
    title: { fontSize: 22, fontWeight: "900", color: "#15803d" },
    sub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
    list: { padding: 16, gap: 10 },
    emptyBox: { alignItems: "center", paddingVertical: 80, gap: 12 },
    emptyText: { color: "#9ca3af", fontWeight: "600", fontSize: 15 },

    card: {
        backgroundColor: "#fff", borderRadius: 14, padding: 14,
        flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb",
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    },
    avatar: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: "#dcfce7",
        alignItems: "center", justifyContent: "center", marginRight: 12,
    },
    avatarText: { fontSize: 18, fontWeight: "800", color: "#15803d" },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: "700", color: "#111827" },
    email: { fontSize: 12, color: "#6b7280", marginTop: 2 },
    cardRight: { alignItems: "flex-end", gap: 6 },
    badge: { backgroundColor: "#f0fdf4", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeText: { color: "#15803d", fontSize: 12, fontWeight: "700" },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modalSheet: {
        backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 32, height: height * 0.85,
    },
    sheetHandle: {
        width: 40, height: 5, backgroundColor: "#e5e7eb",
        borderRadius: 3, alignSelf: "center", marginBottom: 20,
    },
    modalHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
    modalAvatar: {
        width: 52, height: 52, borderRadius: 26, backgroundColor: "#dcfce7",
        alignItems: "center", justifyContent: "center",
    },
    modalAvatarText: { fontSize: 22, fontWeight: "800", color: "#15803d" },
    modalName: { fontSize: 19, fontWeight: "800", color: "#111827" },
    modalEmail: { fontSize: 13, color: "#6b7280" },
    closeBtn: { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },

    quickStats: { flexDirection: "row", gap: 8, marginBottom: 20 },
    quickStat: {
        flex: 1, borderRadius: 14, padding: 10, alignItems: "center", gap: 3,
    },
    quickStatNum: { fontSize: 20, fontWeight: "900" },
    quickStatLabel: { fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase" },

    toggleRow: {
        flexDirection: "row", backgroundColor: "#f3f4f6",
        borderRadius: 14, padding: 4, marginBottom: 16, gap: 4,
    },
    toggleBtn: {
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
        paddingVertical: 10, borderRadius: 11, gap: 6,
    },
    toggleBtnActive: { backgroundColor: "#15803d" },
    toggleText: { fontSize: 13, fontWeight: "700", color: "#6b7280" },
    toggleTextActive: { color: "white" },
    toggleCount: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },

    tripList: { flex: 1 },
    noTrips: { alignItems: "center", paddingVertical: 40, gap: 8 },
    noTripsIcon: { fontSize: 36 },
    noTripsText: { color: "#9ca3af", fontWeight: "600", fontSize: 14 },

    tripCard: { flexDirection: "row", marginBottom: 8 },
    timelineDot: { width: 24, alignItems: "center", paddingTop: 4 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    timelineLine: { width: 2, flex: 1, backgroundColor: "#e5e7eb", marginTop: 4 },
    tripContent: {
        flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, marginLeft: 8,
        borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 4,
    },
    tripTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
    tripDestRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    tripDest: { fontSize: 14, fontWeight: "700", color: "#111827" },
    tripDate: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    tripStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    tripStatusText: { fontSize: 11, fontWeight: "700" },
    tripTimes: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    tripTimeItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    tripTimeText: { fontSize: 11, color: "#6b7280" },
    tripDuration: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },
});
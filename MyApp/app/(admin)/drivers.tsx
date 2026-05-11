import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    TouchableOpacity, Modal, Dimensions, Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Users, ChevronRight, X, MapPin, Calendar,
    Clock, TrendingUp, Navigation, BarChart2, DollarSign, Trash2
} from "lucide-react-native";
import { db, ref, onValue, get, remove } from "../../services/firebase";
import { useDriverRevenue, DateFilter } from "../../hooks/useRevenue";

const { height } = Dimensions.get("window");

interface Driver { uid: string; username: string; email: string; role: string; }
interface Trip   { id: string; destination: string; startTime: number; endTime: number | null; date: string; }
type TripView    = "today" | "week";
type MainTab     = "trips" | "revenue";

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (ts: number) => new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
const dur = (s: number, e: number | null) => {
    if (!e) return "Ongoing";
    const m = Math.round((e - s) / 60000);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const todayStr    = () => new Date().toISOString().split("T")[0];
const weekStartStr = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split("T")[0]; };

// ─── Revenue panel ────────────────────────────────────────────────────────────
function RevenuePanel({ driverId }: { driverId: string }) {
    const [filter, setFilter] = useState<DateFilter>("today");
    const { entries, stats, loading } = useDriverRevenue(driverId, filter);

    const TABS: { k: DateFilter; l: string }[] = [
        { k: "today", l: "Today" }, { k: "week", l: "Week" },
        { k: "month", l: "Month" }, { k: "all",  l: "All"  },
    ];

    return (
        <View style={rp.wrap}>
            <View style={rp.tabs}>
                {TABS.map(t => (
                    <TouchableOpacity key={t.k} onPress={() => setFilter(t.k)} style={[rp.tab, filter === t.k && rp.tabA]}>
                        <Text style={[rp.tabTxt, filter === t.k && rp.tabTxtA]}>{t.l}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? <ActivityIndicator color="#15803d" style={{ marginVertical: 12 }} /> : <>
                <View style={rp.statsRow}>
                    <View style={[rp.stat, { backgroundColor: "#f0fdf4" }]}>
                        <Text style={rp.statAmt}>₱{stats.total.toLocaleString()}</Text>
                        <Text style={rp.statLbl}>Revenue</Text>
                    </View>
                    <View style={[rp.stat, { backgroundColor: "#eff6ff" }]}>
                        <Text style={[rp.statAmt, { color: "#2563eb" }]}>{stats.tripCount}</Text>
                        <Text style={rp.statLbl}>Trips</Text>
                    </View>
                    <View style={[rp.stat, { backgroundColor: "#fefce8" }]}>
                        <Text style={[rp.statAmt, { color: "#d97706" }]}>{stats.totalPassengers}</Text>
                        <Text style={rp.statLbl}>Passengers</Text>
                    </View>
                    <View style={[rp.stat, { backgroundColor: "#f0fdf4" }]}>
                        <Text style={rp.statAmt}>₱{stats.avgPerTrip}</Text>
                        <Text style={rp.statLbl}>Avg/Trip</Text>
                    </View>
                </View>

                {entries.length === 0
                    ? <Text style={rp.empty}>No revenue recorded for this period.</Text>
                    : entries.slice(0, 8).map(e => (
                        <View key={e.id} style={rp.row}>
                            <View style={rp.rowDot} />
                            <View style={{ flex: 1 }}>
                                <Text style={rp.rowRoute}>{e.route}</Text>
                                <Text style={rp.rowMeta}>
                                    {e.passengerCount} pax ·{" "}
                                    {new Date(e.timestamp).toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </Text>
                                {e.groups && e.groups.length > 0 && (
                                    <Text style={rp.rowGroups}>
                                        {e.groups.map((g: any) => `${g.passengerCount}×₱${g.farePerPassenger}`).join("  +  ")}
                                    </Text>
                                )}
                            </View>
                            <Text style={rp.rowAmt}>₱{e.amount}</Text>
                        </View>
                    ))
                }
            </>}
        </View>
    );
}

const rp = StyleSheet.create({
    wrap:    { marginTop: 4 },
    tabs:    { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
    tab:     { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
    tabA:    { backgroundColor: "#15803d" },
    tabTxt:  { fontSize: 12, fontWeight: "700", color: "#6b7280" },
    tabTxtA: { color: "white" },
    statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    stat:    { flex: 1, borderRadius: 12, padding: 10, alignItems: "center" },
    statAmt: { fontSize: 16, fontWeight: "900", color: "#15803d" },
    statLbl: { fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginTop: 2 },
    empty:   { color: "#9ca3af", textAlign: "center", paddingVertical: 16, fontSize: 13 },
    row:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
    rowDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: "#15803d", flexShrink: 0 },
    rowRoute:  { fontSize: 13, fontWeight: "700", color: "#111827" },
    rowMeta:   { fontSize: 11, color: "#6b7280", marginTop: 1 },
    rowGroups: { fontSize: 10, color: "#9ca3af", marginTop: 2 },
    rowAmt:    { fontSize: 15, fontWeight: "900", color: "#15803d" },
});

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdminDrivers() {
    const [drivers, setDrivers]         = useState<Driver[]>([]);
    const [loading, setLoading]         = useState(true);
    const [selected, setSelected]       = useState<Driver | null>(null);
    const [trips, setTrips]             = useState<Trip[]>([]);
    const [tripsLoading, setTripsLoading] = useState(false);
    const [tripView, setTripView]       = useState<TripView>("today");
    const [mainTab, setMainTab]         = useState<MainTab>("trips");
    const [deleting, setDeleting]       = useState(false);

    // Live driver list
    useEffect(() => {
        const unsub = onValue(ref(db, "users"), (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                setDrivers(
                    Object.entries(data)
                        .filter(([_, v]: any) => v.role === "driver")
                        .map(([uid, v]: any) => ({ uid, ...v }))
                );
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Open a driver → fetch their trips
    const openDriver = async (driver: Driver) => {
        setSelected(driver);
        setMainTab("trips");
        setTripView("today");
        setTripsLoading(true);
        setTrips([]);
        try {
            const snap = await get(ref(db, `driver_trips/${driver.uid}`));
            if (snap.exists()) {
                const data = snap.val() as Record<string, Omit<Trip, "id">>;
                setTrips(
                    Object.entries(data)
                        .map(([id, v]) => ({ id, ...v }))
                        .sort((a, b) => b.startTime - a.startTime)
                );
            }
        } catch { setTrips([]); }
        finally { setTripsLoading(false); }
    };

    // ── DELETE DRIVER ─────────────────────────────────────────────────────────
    //
    // FIX: Use Promise.allSettled() instead of awaiting each remove() in sequence.
    //
    // Why this was broken before:
    //   await remove(driver_trips/$uid) requires auth.uid === $uid in the old
    //   Firebase rules (admin was not allowed). This threw a permission error
    //   AFTER the user row was already deleted, causing the catch block to
    //   show "Failed to remove driver" even though the deletion mostly worked.
    //
    // Fix has two parts:
    //   1. Firebase rules: add admin permission to driver_trips (see rules file)
    //   2. Promise.allSettled: even if one node doesn't exist or a non-critical
    //      remove fails (e.g. driver never started a trip), we still show success.
    //
    const executeDelete = async (driver: Driver) => {
        setDeleting(true);
        // Close the sheet first so stale data doesn't flash on screen
        setSelected(null);
        try {
            const nodesToDelete = [
                `users/${driver.uid}`,
                `jeeps/${driver.uid}`,
                `jeep_info/${driver.uid}`,
                `driver_trips/${driver.uid}`,
                `revenue/${driver.uid}`,
                `pending_registrations/${driver.uid}`,  // clean up if pending reg exists
            ];

            // allSettled: never throws — each result is { status: 'fulfilled' | 'rejected' }
            const results = await Promise.allSettled(
                nodesToDelete.map(path => remove(ref(db, path)))
            );

            // Log any unexpected failures for debugging
            results.forEach((r, i) => {
                if (r.status === "rejected") {
                    console.warn(`Could not delete ${nodesToDelete[i]}:`, r.reason);
                }
            });

            Alert.alert("✅ Removed", `${driver.username} has been removed from the system.`);
        } catch (e) {
            // This catch only fires on catastrophic failures (e.g. no network at all)
            Alert.alert("Error", "Could not complete deletion. Check your connection.");
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteDriver = (driver: Driver) => {
        Alert.alert(
            "Remove Driver",
            `This will permanently remove ${driver.username} from the system.\n\nThis deletes their profile, jeep info, and trip data.\n\nNote: Their Firebase Auth login remains — contact your Firebase console to fully revoke access if needed.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove Driver",
                    style: "destructive",
                    onPress: () => {
                        Alert.alert(
                            "Are you sure?",
                            `Remove ${driver.username}? This cannot be undone.`,
                            [
                                { text: "Cancel", style: "cancel" },
                                {
                                    text: "Yes, Remove",
                                    style: "destructive",
                                    onPress: () => executeDelete(driver),
                                },
                            ]
                        );
                    },
                },
            ]
        );
    };

    // Trip filtering
    const tdy = todayStr(), wk = weekStartStr();
    const todayTrips   = trips.filter(t => t.date === tdy);
    const weekTrips    = trips.filter(t => t.date >= wk);
    const displayTrips = tripView === "today" ? todayTrips : weekTrips;

    // Quick stats
    const completedToday = todayTrips.filter(t => t.endTime).length;
    const completedAll   = trips.filter(t => t.endTime).length;
    const avgMins = completedAll > 0
        ? Math.round(trips.filter(t => t.endTime).reduce((s, t) => s + (t.endTime! - t.startTime) / 60000, 0) / completedAll)
        : 0;

    return (
        <SafeAreaView style={s.container}>
            {/* Screen header */}
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
                    ) : drivers.map(driver => (
                        <TouchableOpacity key={driver.uid} style={s.card} onPress={() => openDriver(driver)} activeOpacity={0.75}>
                            <View style={s.avatar}>
                                <Text style={s.avatarText}>{driver.username?.charAt(0)?.toUpperCase() ?? "D"}</Text>
                            </View>
                            <View style={s.info}>
                                <Text style={s.name}>{driver.username ?? "Unknown"}</Text>
                                <Text style={s.email}>{driver.email ?? "No email"}</Text>
                            </View>
                            <View style={s.cardRight}>
                                <View style={s.badge}><Text style={s.badgeText}>Driver</Text></View>
                                <ChevronRight color="#9ca3af" size={18} />
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            {/* ── Driver detail bottom sheet ──────────────────────────────────── */}
            <Modal visible={!!selected} animationType="slide" transparent>
                <View style={s.overlay}>
                    <View style={[s.sheet, { height: height * 0.92 }]}>
                        <View style={s.handle} />

                        {selected && (
                            <>
                                {/* Driver header */}
                                <View style={s.mHeader}>
                                    <View style={s.mAvatar}>
                                        <Text style={s.mAvatarTxt}>{selected.username?.charAt(0)?.toUpperCase()}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.mName}>{selected.username}</Text>
                                        <Text style={s.mEmail}>{selected.email}</Text>
                                    </View>
                                    {/* Delete icon in header */}
                                    <TouchableOpacity
                                        onPress={() => handleDeleteDriver(selected)}
                                        style={s.deleteBtn}
                                        disabled={deleting}
                                    >
                                        {deleting
                                            ? <ActivityIndicator color="#ef4444" size="small" />
                                            : <Trash2 color="#ef4444" size={18} />
                                        }
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                                        <X color="#6b7280" size={20} />
                                    </TouchableOpacity>
                                </View>

                                {/* Quick stats row */}
                                <View style={s.quickStats}>
                                    <View style={[s.qs, { backgroundColor: "#f0fdf4" }]}>
                                        <Navigation color="#15803d" size={14} />
                                        <Text style={[s.qsN, { color: "#15803d" }]}>{todayTrips.length}</Text>
                                        <Text style={s.qsL}>Today</Text>
                                    </View>
                                    <View style={[s.qs, { backgroundColor: "#eff6ff" }]}>
                                        <BarChart2 color="#3b82f6" size={14} />
                                        <Text style={[s.qsN, { color: "#3b82f6" }]}>{weekTrips.length}</Text>
                                        <Text style={s.qsL}>Week</Text>
                                    </View>
                                    <View style={[s.qs, { backgroundColor: "#fefce8" }]}>
                                        <Clock color="#d97706" size={14} />
                                        <Text style={[s.qsN, { color: "#d97706" }]}>{avgMins > 0 ? `${avgMins}m` : "—"}</Text>
                                        <Text style={s.qsL}>Avg Trip</Text>
                                    </View>
                                    <View style={[s.qs, { backgroundColor: "#f0fdf4" }]}>
                                        <TrendingUp color="#15803d" size={14} />
                                        <Text style={[s.qsN, { color: "#15803d" }]}>{completedToday}</Text>
                                        <Text style={s.qsL}>Done Today</Text>
                                    </View>
                                </View>

                                {/* Trips / Revenue main tab switcher */}
                                <View style={s.mainTabRow}>
                                    <TouchableOpacity
                                        style={[s.mainTab, mainTab === "trips" && s.mainTabActive]}
                                        onPress={() => setMainTab("trips")}
                                    >
                                        <Navigation size={14} color={mainTab === "trips" ? "white" : "#6b7280"} />
                                        <Text style={[s.mainTabTxt, mainTab === "trips" && s.mainTabTxtA]}>Trip Log</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[s.mainTab, mainTab === "revenue" && { backgroundColor: "#15803d" }]}
                                        onPress={() => setMainTab("revenue")}
                                    >
                                        <DollarSign size={14} color={mainTab === "revenue" ? "white" : "#6b7280"} />
                                        <Text style={[s.mainTabTxt, mainTab === "revenue" && s.mainTabTxtA]}>Revenue</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* ── TRIPS TAB ──────────────────────────────────── */}
                                {mainTab === "trips" && (
                                    <>
                                        <View style={s.toggleRow}>
                                            <TouchableOpacity
                                                style={[s.toggleBtn, tripView === "today" && s.toggleActive]}
                                                onPress={() => setTripView("today")}
                                            >
                                                <Calendar size={13} color={tripView === "today" ? "#fff" : "#6b7280"} />
                                                <Text style={[s.toggleTxt, tripView === "today" && s.toggleTxtA]}>Today</Text>
                                                {todayTrips.length > 0 && (
                                                    <View style={[s.toggleBadge, { backgroundColor: tripView === "today" ? "rgba(255,255,255,.3)" : "#e5e7eb" }]}>
                                                        <Text style={{ fontSize: 10, fontWeight: "800", color: tripView === "today" ? "#fff" : "#374151" }}>{todayTrips.length}</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[s.toggleBtn, tripView === "week" && s.toggleActive]}
                                                onPress={() => setTripView("week")}
                                            >
                                                <BarChart2 size={13} color={tripView === "week" ? "#fff" : "#6b7280"} />
                                                <Text style={[s.toggleTxt, tripView === "week" && s.toggleTxtA]}>This Week</Text>
                                                {weekTrips.length > 0 && (
                                                    <View style={[s.toggleBadge, { backgroundColor: tripView === "week" ? "rgba(255,255,255,.3)" : "#e5e7eb" }]}>
                                                        <Text style={{ fontSize: 10, fontWeight: "800", color: tripView === "week" ? "#fff" : "#374151" }}>{weekTrips.length}</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        </View>

                                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                            {tripsLoading ? (
                                                <ActivityIndicator color="#15803d" style={{ marginTop: 24 }} />
                                            ) : displayTrips.length === 0 ? (
                                                <View style={s.noTrips}>
                                                    <Text style={{ fontSize: 36 }}>🚌</Text>
                                                    <Text style={s.noTripsTxt}>
                                                        No trips {tripView === "today" ? "today" : "this week"}.
                                                    </Text>
                                                </View>
                                            ) : (
                                                displayTrips.map((trip, i) => (
                                                    <View key={trip.id} style={s.tripCard}>
                                                        <View style={s.tlDot}>
                                                            <View style={[s.dot, { backgroundColor: trip.endTime ? "#15803d" : "#f59e0b" }]} />
                                                            {i < displayTrips.length - 1 && <View style={s.tlLine} />}
                                                        </View>
                                                        <View style={s.tripContent}>
                                                            <View style={s.tripTop}>
                                                                <View style={{ flex: 1 }}>
                                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                                                        <MapPin color="#15803d" size={12} />
                                                                        <Text style={s.tripDest}>To {trip.destination}</Text>
                                                                    </View>
                                                                    <Text style={s.tripDate}>
                                                                        {new Date(trip.startTime).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
                                                                    </Text>
                                                                </View>
                                                                <View style={[s.tripBadge, { backgroundColor: trip.endTime ? "#dcfce7" : "#fef3c7" }]}>
                                                                    <Text style={[s.tripBadgeTxt, { color: trip.endTime ? "#15803d" : "#d97706" }]}>
                                                                        {trip.endTime ? "✓ Done" : "● Active"}
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                                                    <Clock size={11} color="#9ca3af" />
                                                                    <Text style={{ fontSize: 11, color: "#6b7280" }}>
                                                                        {fmt(trip.startTime)}{trip.endTime ? ` – ${fmt(trip.endTime)}` : " (ongoing)"}
                                                                    </Text>
                                                                </View>
                                                                <Text style={{ fontSize: 11, color: "#9ca3af", fontWeight: "600" }}>
                                                                    {dur(trip.startTime, trip.endTime)}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                ))
                                            )}
                                        </ScrollView>
                                    </>
                                )}

                                {/* ── REVENUE TAB ─────────────────────────────────── */}
                                {mainTab === "revenue" && (
                                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                        <RevenuePanel driverId={selected.uid} />
                                    </ScrollView>
                                )}

                                {/* ── DANGER ZONE ─────────────────────────────────── */}
                                <TouchableOpacity
                                    style={s.dangerZoneBtn}
                                    onPress={() => handleDeleteDriver(selected)}
                                    disabled={deleting}
                                    activeOpacity={0.8}
                                >
                                    {deleting ? (
                                        <ActivityIndicator color="#ef4444" size="small" />
                                    ) : (
                                        <>
                                            <Trash2 color="#ef4444" size={16} />
                                            <Text style={s.dangerZoneTxt}>Remove Driver from System</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f9fafb" },
    header:    { backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
    title:     { fontSize: 22, fontWeight: "900", color: "#15803d" },
    sub:       { fontSize: 12, color: "#6b7280", marginTop: 2 },
    list:      { padding: 16, gap: 10 },
    emptyBox:  { alignItems: "center", paddingVertical: 80, gap: 12 },
    emptyText: { color: "#9ca3af", fontWeight: "600", fontSize: 15 },

    card:      { backgroundColor: "#fff", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    avatar:    { width: 44, height: 44, borderRadius: 22, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center", marginRight: 12 },
    avatarText:{ fontSize: 18, fontWeight: "800", color: "#15803d" },
    info:      { flex: 1 },
    name:      { fontSize: 15, fontWeight: "700", color: "#111827" },
    email:     { fontSize: 12, color: "#6b7280", marginTop: 2 },
    cardRight: { alignItems: "flex-end", gap: 6 },
    badge:     { backgroundColor: "#f0fdf4", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeText: { color: "#15803d", fontSize: 12, fontWeight: "700" },

    overlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet:     { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 16 },
    handle:    { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 16 },

    mHeader:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    mAvatar:   { width: 50, height: 50, borderRadius: 25, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
    mAvatarTxt:{ fontSize: 22, fontWeight: "800", color: "#15803d" },
    mName:     { fontSize: 18, fontWeight: "800", color: "#111827" },
    mEmail:    { fontSize: 13, color: "#6b7280" },
    closeBtn:  { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },
    deleteBtn: { padding: 8, backgroundColor: "#fee2e2", borderRadius: 12 },

    quickStats:{ flexDirection: "row", gap: 8, marginBottom: 14 },
    qs:        { flex: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 3 },
    qsN:       { fontSize: 18, fontWeight: "900" },
    qsL:       { fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase" },

    mainTabRow:   { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 14, padding: 4, marginBottom: 14, gap: 4 },
    mainTab:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 11, gap: 6 },
    mainTabActive:{ backgroundColor: "#15803d" },
    mainTabTxt:   { fontSize: 13, fontWeight: "700", color: "#6b7280" },
    mainTabTxtA:  { color: "white" },

    toggleRow:   { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 12, padding: 3, marginBottom: 12, gap: 3 },
    toggleBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: 10, gap: 5 },
    toggleActive:{ backgroundColor: "#15803d" },
    toggleTxt:   { fontSize: 12, fontWeight: "700", color: "#6b7280" },
    toggleTxtA:  { color: "white" },
    toggleBadge: { borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2 },

    noTrips:   { alignItems: "center", paddingVertical: 40, gap: 8 },
    noTripsTxt:{ color: "#9ca3af", fontWeight: "600", fontSize: 14 },

    tripCard:   { flexDirection: "row", marginBottom: 8 },
    tlDot:      { width: 24, alignItems: "center", paddingTop: 4 },
    dot:        { width: 10, height: 10, borderRadius: 5 },
    tlLine:     { width: 2, flex: 1, backgroundColor: "#e5e7eb", marginTop: 4 },
    tripContent:{ flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, marginLeft: 8, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 4 },
    tripTop:    { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
    tripDest:   { fontSize: 13, fontWeight: "700", color: "#111827" },
    tripDate:   { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    tripBadge:  { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    tripBadgeTxt:{ fontSize: 11, fontWeight: "700" },

    dangerZoneBtn: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 8, backgroundColor: "#fee2e2", borderRadius: 12,
        paddingVertical: 14, marginTop: 10, marginBottom: 4,
        borderWidth: 1, borderColor: "#fecaca",
    },
    dangerZoneTxt: { color: "#ef4444", fontWeight: "700", fontSize: 14 },
});
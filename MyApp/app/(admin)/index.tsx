/* eslint-disable no-dupe-keys */
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator, RefreshControl,
    Modal, Dimensions, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
    Bus, Users, CheckCircle, XCircle, LogOut, TrendingUp,
    X, ChevronRight, Clock, FileText, DollarSign,
    Navigation, BarChart2, MapPin, Calendar, Trash2
} from "lucide-react-native";
import { auth, db, ref, onValue, get, signOut, remove } from "../../services/firebase";
import { useDriverRevenue, DateFilter } from "../../hooks/useRevenue";
import { useTheme } from "../ThemeContext";

const { height: SCREEN_H } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface PendingRegistration {
    uid: string; fullName: string; email: string;
    licenseNumber: string; status: string; submittedAt: number;
}
interface JeepItem {
    uid: string; status: string; latitude?: number; longitude?: number;
}
interface Driver {
    uid: string; username: string; email: string; role: string;
}
interface Trip {
    id: string; destination: string; startTime: number;
    endTime: number | null; date: string;
}
type TripView  = "today" | "week";
type DriverTab = "trips" | "revenue";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1)  return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs  < 24) return `${hrs}h ago`;
    return `${days}d ago`;
}
const fmt          = (ts: number) => new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
const dur          = (s: number, e: number | null) => { if (!e) return "Ongoing"; const m = Math.round((e - s) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const todayStr     = () => new Date().toISOString().split("T")[0];
const weekStartStr = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split("T")[0]; };

const REV_TABS: { k: DateFilter; l: string }[] = [
    { k: "today", l: "Today" }, { k: "week", l: "Week" },
    { k: "month", l: "Month" }, { k: "all",  l: "All"  },
];

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE PANEL
// ─────────────────────────────────────────────────────────────────────────────

function RevenuePanel({ driverId }: { driverId: string }) {
    const [filter, setFilter] = useState<DateFilter>("today");
    const { entries, stats, loading } = useDriverRevenue(driverId, filter);

    return (
        <View style={{ marginTop: 4 }}>
            <View style={rp.tabs}>
                {REV_TABS.map(t => (
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
                    : entries.slice(0, 10).map(e => (
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
    tabs:     { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
    tab:      { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
    tabA:     { backgroundColor: "#15803d" },
    tabTxt:   { fontSize: 12, fontWeight: "700", color: "#6b7280" },
    tabTxtA:  { color: "white" },
    statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    stat:     { flex: 1, borderRadius: 12, padding: 10, alignItems: "center" },
    statAmt:  { fontSize: 16, fontWeight: "900", color: "#15803d" },
    statLbl:  { fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginTop: 2 },
    empty:    { color: "#9ca3af", textAlign: "center", paddingVertical: 16, fontSize: 13 },
    row:      { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
    rowDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: "#15803d", flexShrink: 0 },
    rowRoute: { fontSize: 13, fontWeight: "700", color: "#111827" },
    rowMeta:  { fontSize: 11, color: "#6b7280", marginTop: 1 },
    rowGroups:{ fontSize: 10, color: "#9ca3af", marginTop: 2 },
    rowAmt:   { fontSize: 15, fontWeight: "900", color: "#15803d" },
});

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER DETAIL SHEET  ← rendered at the ROOT level, never inside another modal
// ─────────────────────────────────────────────────────────────────────────────

interface DriverDetailProps {
    visible: boolean;
    driver: Driver | null;
    onClose: () => void;
}

function DriverDetailSheet({ visible, driver, onClose }: DriverDetailProps) {
    const [trips, setTrips]               = useState<Trip[]>([]);
    const [tripsLoading, setTripsLoading] = useState(false);
    const [tripView, setTripView]         = useState<TripView>("today");
    const [mainTab, setMainTab]           = useState<DriverTab>("trips");

    useEffect(() => {
        if (!visible || !driver) return;
        setMainTab("trips");
        setTripView("today");
        setTripsLoading(true);
        setTrips([]);
        get(ref(db, `driver_trips/${driver.uid}`))
            .then(snap => {
                if (snap.exists()) {
                    const data = snap.val() as Record<string, Omit<Trip, "id">>;
                    setTrips(
                        Object.entries(data)
                            .map(([id, v]) => ({ id, ...v }))
                            .sort((a, b) => b.startTime - a.startTime)
                    );
                } else {
                    setTrips([]);
                }
            })
            .catch(() => setTrips([]))
            .finally(() => setTripsLoading(false));
    }, [visible, driver?.uid]);

    const tdy = todayStr(), wk = weekStartStr();
    const todayTrips   = trips.filter(t => t.date === tdy);
    const weekTrips    = trips.filter(t => t.date >= wk);
    const displayTrips = tripView === "today" ? todayTrips : weekTrips;
    const completedToday = todayTrips.filter(t => t.endTime).length;
    const completedAll   = trips.filter(t => t.endTime).length;
    const avgMins = completedAll > 0
        ? Math.round(trips.filter(t => t.endTime).reduce((s, t) => s + (t.endTime! - t.startTime) / 60000, 0) / completedAll)
        : 0;

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={[s.sheet, { height: SCREEN_H * 0.92 }]}>
                    <View style={s.handle} />
                    {driver && (
                        <>
                            <View style={s.mHeader}>
                                <View style={s.mAvatar}>
                                    <Text style={s.mAvatarTxt}>{driver.username?.charAt(0)?.toUpperCase() ?? "D"}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.mName}>{driver.username}</Text>
                                    <Text style={s.mEmail}>{driver.email}</Text>
                                </View>
                                <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                                    <X color="#6b7280" size={20} />
                                </TouchableOpacity>
                            </View>

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

                            <View style={s.mainTabRow}>
                                <TouchableOpacity
                                    style={[s.mainTab, mainTab === "trips" && s.mainTabActive]}
                                    onPress={() => setMainTab("trips")}
                                >
                                    <Navigation size={14} color={mainTab === "trips" ? "white" : "#6b7280"} />
                                    <Text style={[s.mainTabTxt, mainTab === "trips" && s.mainTabTxtA]}>Trip Log</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.mainTab, mainTab === "revenue" && s.mainTabActive]}
                                    onPress={() => setMainTab("revenue")}
                                >
                                    <DollarSign size={14} color={mainTab === "revenue" ? "white" : "#6b7280"} />
                                    <Text style={[s.mainTabTxt, mainTab === "revenue" && s.mainTabTxtA]}>Revenue</Text>
                                </TouchableOpacity>
                            </View>

                            {mainTab === "trips" && (
                                <>
                                    <View style={s.toggleRow}>
                                        {(["today", "week"] as TripView[]).map(v => (
                                            <TouchableOpacity
                                                key={v}
                                                style={[s.toggleBtn, tripView === v && s.toggleActive]}
                                                onPress={() => setTripView(v)}
                                            >
                                                {v === "today"
                                                    ? <Calendar size={13} color={tripView === v ? "#fff" : "#6b7280"} />
                                                    : <BarChart2 size={13} color={tripView === v ? "#fff" : "#6b7280"} />
                                                }
                                                <Text style={[s.toggleTxt, tripView === v && s.toggleTxtA]}>
                                                    {v === "today" ? "Today" : "This Week"}
                                                </Text>
                                                {(v === "today" ? todayTrips : weekTrips).length > 0 && (
                                                    <View style={[s.toggleBadge, { backgroundColor: tripView === v ? "rgba(255,255,255,.3)" : "#e5e7eb" }]}>
                                                        <Text style={{ fontSize: 10, fontWeight: "800", color: tripView === v ? "#fff" : "#374151" }}>
                                                            {(v === "today" ? todayTrips : weekTrips).length}
                                                        </Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                        {tripsLoading ? (
                                            <ActivityIndicator color="#15803d" style={{ marginTop: 24 }} />
                                        ) : displayTrips.length === 0 ? (
                                            <View style={s.centerBox}>
                                                <Text style={{ fontSize: 36 }}>🚌</Text>
                                                <Text style={s.centerTxt}>No trips {tripView === "today" ? "today" : "this week"}.</Text>
                                                <Text style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 4 }}>
                                                    Trips are recorded when a driver starts and ends a route.
                                                </Text>
                                            </View>
                                        ) : displayTrips.map((trip, i) => (
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
                                        ))}
                                    </ScrollView>
                                </>
                            )}

                            {mainTab === "revenue" && (
                                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                    <RevenuePanel driverId={driver.uid} />
                                </ScrollView>
                            )}
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRIVERS LIST MODAL  ← only shows the list, no nested modal inside
// ─────────────────────────────────────────────────────────────────────────────

interface DriversModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectDriver: (driver: Driver) => void;   // ← lifts selection up to parent
}

function DriversModal({ visible, onClose, onSelectDriver }: DriversModalProps) {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        const unsub = onValue(ref(db, "users"), snap => {
            if (snap.exists()) {
                setDrivers(
                    Object.entries(snap.val())
                        .filter(([_, v]: any) => v.role === "driver")
                        .map(([uid, v]: any) => ({ uid, ...v }))
                );
            } else {
                setDrivers([]);
            }
            setLoading(false);
        });
        return () => unsub();
    }, [visible]);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={[s.sheet, { height: SCREEN_H * 0.85 }]}>
                    <View style={s.handle} />
                    <View style={s.mHeader}>
                        <View style={[s.mAvatar, { backgroundColor: "#eff6ff" }]}>
                            <Users color="#2563eb" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.mName}>All Drivers</Text>
                            <Text style={s.mEmail}>{drivers.length} registered</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator color="#15803d" style={{ marginTop: 32 }} />
                    ) : drivers.length === 0 ? (
                        <View style={s.centerBox}>
                            <Text style={{ fontSize: 36 }}>👤</Text>
                            <Text style={s.centerTxt}>No drivers registered yet.</Text>
                        </View>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>
                            <Text style={s.listHint}>Tap a driver to view their trips and revenue</Text>
                            {drivers.map(d => (
                                <TouchableOpacity
                                    key={d.uid}
                                    style={s.driverCard}
                                    onPress={() => onSelectDriver(d)}   // ← no nested modal
                                    activeOpacity={0.75}
                                >
                                    <View style={s.driverAvatar}>
                                        <Text style={s.driverAvatarTxt}>{d.username?.charAt(0)?.toUpperCase() ?? "D"}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.driverName}>{d.username ?? "Unknown"}</Text>
                                        <Text style={s.driverEmail}>{d.email ?? "No email"}</Text>
                                    </View>
                                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                                        <View style={s.driverBadge}><Text style={s.driverBadgeTxt}>Driver</Text></View>
                                        <ChevronRight color="#9ca3af" size={16} />
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// JEEP REVENUE MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface JeepRevenueModalProps {
    visible: boolean; onClose: () => void;
    driverId: string; driverName: string; plate: string; route: string;
}

function JeepRevenueModal({ visible, onClose, driverId, driverName, plate, route }: JeepRevenueModalProps) {
    const [filter, setFilter] = useState<DateFilter>("today");
    const { entries, stats, loading } = useDriverRevenue(driverId, filter);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={[s.sheet, { height: SCREEN_H * 0.88 }]}>
                    <View style={s.handle} />
                    <View style={s.mHeader}>
                        <View style={[s.mAvatar, { backgroundColor: "#f0fdf4" }]}>
                            <Bus color="#15803d" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.mName}>{driverName}</Text>
                            <Text style={s.mEmail}>{plate} · {route}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    <View style={rp.tabs}>
                        {REV_TABS.map(t => (
                            <TouchableOpacity key={t.k} onPress={() => setFilter(t.k)} style={[rp.tab, filter === t.k && rp.tabA]}>
                                <Text style={[rp.tabTxt, filter === t.k && rp.tabTxtA]}>{t.l}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {loading ? <ActivityIndicator color="#15803d" style={{ marginTop: 24 }} /> : (
                        <>
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
                            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                {entries.length === 0 ? (
                                    <View style={s.centerBox}>
                                        <Text style={{ fontSize: 36 }}>💰</Text>
                                        <Text style={s.centerTxt}>No revenue recorded for this period.</Text>
                                    </View>
                                ) : entries.map(e => (
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
                                ))}
                            </ScrollView>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING REGISTRATIONS MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface PendingModalProps {
    visible: boolean; onClose: () => void; onNavigateToRegistrations: () => void;
}

function PendingRegistrationsModal({ visible, onClose, onNavigateToRegistrations }: PendingModalProps) {
    const [pendingList, setPendingList] = useState<PendingRegistration[]>([]);
    const [loadingList, setLoadingList] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setLoadingList(true);
        const unsub = onValue(ref(db, "pending_registrations"), snap => {
            if (!snap.exists()) { setPendingList([]); setLoadingList(false); return; }
            const list: PendingRegistration[] = Object.entries(snap.val())
                .filter(([_, v]: any) => v.status === "pending")
                .map(([uid, v]: any) => ({ uid, ...v }))
                .sort((a: any, b: any) => b.submittedAt - a.submittedAt);
            setPendingList(list);
            setLoadingList(false);
        });
        return () => unsub();
    }, [visible]);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={[s.sheet, { height: SCREEN_H * 0.75 }]}>
                    <View style={s.handle} />
                    <View style={s.mHeader}>
                        <View style={[s.mAvatar, { backgroundColor: "#fef3c7" }]}>
                            <FileText color="#d97706" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.mName}>Pending Applications</Text>
                            <Text style={s.mEmail}>{pendingList.length} awaiting review</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {loadingList ? <ActivityIndicator color="#15803d" style={{ marginTop: 32 }} />
                    : pendingList.length === 0 ? (
                        <View style={s.centerBox}>
                            <Text style={{ fontSize: 36 }}>✅</Text>
                            <Text style={s.centerTxt}>No pending applications.</Text>
                        </View>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                            {pendingList.map(reg => (
                                <View key={reg.uid} style={s.driverCard}>
                                    <View style={[s.driverAvatar, { backgroundColor: "#fef3c7" }]}>
                                        <Text style={[s.driverAvatarTxt, { color: "#d97706" }]}>{reg.fullName?.charAt(0)?.toUpperCase() ?? "D"}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.driverName}>{reg.fullName}</Text>
                                        <Text style={s.driverEmail}>{reg.email}</Text>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                                            <Clock size={10} color="#9ca3af" />
                                            <Text style={{ fontSize: 10, color: "#9ca3af" }}>{timeAgo(reg.submittedAt)}</Text>
                                        </View>
                                    </View>
                                    <View style={[s.driverBadge, { backgroundColor: "#fef3c7" }]}>
                                        <Text style={[s.driverBadgeTxt, { color: "#d97706" }]}>Pending</Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    )}

                    <TouchableOpacity
                        style={s.reviewAllBtn}
                        onPress={() => { onClose(); onNavigateToRegistrations(); }}
                        activeOpacity={0.8}
                    >
                        <Text style={s.reviewAllTxt}>Review All Applications</Text>
                        <ChevronRight color="white" size={18} />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
    const router = useRouter();
    const { darkMode } = useTheme();

    const [loading, setLoading]           = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [stats, setStats]               = useState({ totalDrivers: 0, totalJeeps: 0, activeJeeps: 0, inactiveJeeps: 0 });
    const [jeeps, setJeeps]               = useState<JeepItem[]>([]);
    const [jeepInfo, setJeepInfo]         = useState<Record<string, any>>({});
    const [pendingCount, setPendingCount] = useState(0);

    // Modal state — all at root level so modals never nest
    const [driversModalOpen,  setDriversModalOpen]  = useState(false);
    const [selectedDriver,    setSelectedDriver]    = useState<Driver | null>(null);
    const [selectedJeep,      setSelectedJeep]      = useState<JeepItem | null>(null);
    const [pendingModalOpen,  setPendingModalOpen]  = useState(false);

    // Keep Firebase unsubscribe refs so we can clean them up properly
    const unsubsRef = useRef<(() => void)[]>([]);

    const setupListeners = useCallback(() => {
        // Clean up any existing listeners first
        unsubsRef.current.forEach(fn => fn());
        unsubsRef.current = [];

        const u1 = onValue(ref(db, "jeeps"), snap => {
            if (snap.exists()) {
                const data   = snap.val();
                const list   = Object.entries(data).map(([uid, val]: any) => ({ uid, ...val }));
                const active = list.filter((j: any) => j.status === "available").length;
                setJeeps(list);
                setStats(prev => ({ ...prev, totalJeeps: list.length, activeJeeps: active, inactiveJeeps: list.length - active }));
            }
            setLoading(false);
            setRefreshing(false);
        });

        const u2 = onValue(ref(db, "jeep_info"), snap => {
            if (snap.exists()) setJeepInfo(snap.val());
        });

        const u3 = onValue(ref(db, "users"), snap => {
            if (snap.exists()) {
                const count = Object.values(snap.val()).filter((u: any) => u.role === "driver").length;
                setStats(prev => ({ ...prev, totalDrivers: count }));
            }
        });

        const u4 = onValue(ref(db, "pending_registrations"), snap => {
            if (!snap.exists()) { setPendingCount(0); return; }
            setPendingCount(Object.values(snap.val()).filter((r: any) => r.status === "pending").length);
        });

        unsubsRef.current = [u1, u2, u3, u4];
    }, []);

    useEffect(() => {
        setupListeners();
        // Clean up all listeners when the component unmounts (tab change)
        return () => { unsubsRef.current.forEach(fn => fn()); };
    }, [setupListeners]);

    const handleLogout = async () => { await signOut(auth); router.replace("/login"); };
    const onRefresh    = () => { setRefreshing(true); setupListeners(); };
    const selectedInfo = selectedJeep ? jeepInfo[selectedJeep.uid] : null;

    const handleClearMap = () => {
        Alert.alert("Clear Live Map", "This will remove all active ride requests and reset passenger markers for everyone. Continue?", [
            { text: "Cancel", style: "cancel" },
            { text: "Clear Map", style: "destructive", onPress: async () => {
                await remove(ref(db, "ride_requests"));
                Alert.alert("Success", "Live map data has been cleared.");
            }}
        ]);
    };

    // When a driver is selected from the list modal: close the list, open detail
    const handleSelectDriver = (driver: Driver) => {
        setDriversModalOpen(false);
        // Small delay so the first modal fully closes before the second opens
        setTimeout(() => setSelectedDriver(driver), 350);
    };

    if (loading) {
        return (
            <View style={[s.loadingContainer, darkMode && { backgroundColor: "#0f172a" }]}>
                <ActivityIndicator size="large" color="#15803d" />
                <Text style={[s.loadingText, darkMode && { color: "#94a3b8" }]}>Loading Dashboard...</Text>
            </View>
        );
    }

    // Dynamic styles for Dark Mode
    const themeContainer = darkMode ? { backgroundColor: "#0f172a" } : { backgroundColor: "#f9fafb" };
    const themeHeader    = darkMode ? { backgroundColor: "#1e293b", borderBottomColor: "#334155" } : { backgroundColor: "#fff" };
    const themeText      = darkMode ? { color: "#f1f5f9" } : { color: "#111827" };
    const themeCard      = darkMode ? { backgroundColor: "#1e293b", borderColor: "#334155" } : { backgroundColor: "#fff" };
    const themeSub       = darkMode ? { color: "#94a3b8" } : { color: "#6b7280" };

    return (
        <SafeAreaView style={[s.container, themeContainer]}>

            {/* ── HEADER ── */}
            <View style={[s.header, themeHeader]}>
                <View>
                    <Text style={[s.headerTitle, darkMode && { color: "#4ade80" }]}>Admin Panel</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={s.logoutBtn} activeOpacity={0.7}>
                    <LogOut color="#ef4444" size={20} />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#15803d" />}
            >
                {/* ── STAT TILES ── */}
                <View style={s.statsGrid}>
                    {/* Total Drivers — tappable */}
                    <TouchableOpacity
                        style={[s.statCard, darkMode ? { backgroundColor: "#064e3b" } : { backgroundColor: "#f0fdf4" }]}
                        onPress={() => setDriversModalOpen(true)}
                        activeOpacity={0.75}
                    >
                        <Users color={darkMode ? "#4ade80" : "#15803d"} size={22} />
                        <Text style={[s.statNumber, darkMode && { color: "#4ade80" }]}>{stats.totalDrivers}</Text>
                        <Text style={[s.statLabel, darkMode && { color: "#94a3b8" }]}>Total Drivers</Text>
                        <Text style={[s.statTapHint, darkMode && { color: "#4ade80" }]}>Tap to view ›</Text>
                    </TouchableOpacity>

                    <View style={[s.statCard, darkMode ? { backgroundColor: "#1e3a8a" } : { backgroundColor: "#eff6ff" }]}>
                        <Bus color="#2563eb" size={22} />
                        <Text style={[s.statNumber, { color: "#2563eb" }]}>{stats.totalJeeps}</Text>
                        <Text style={[s.statLabel, darkMode && { color: "#94a3b8" }]}>Total Jeeps</Text>
                    </View>
                    <View style={[s.statCard, darkMode ? { backgroundColor: "#064e3b" } : { backgroundColor: "#f0fdf4" }]}>
                        <CheckCircle color="#15803d" size={22} />
                        <Text style={[s.statNumber, darkMode && { color: "#4ade80" }]}>{stats.activeJeeps}</Text>
                        <Text style={[s.statLabel, darkMode && { color: "#94a3b8" }]}>Active</Text>
                    </View>
                    <View style={[s.statCard, darkMode ? { backgroundColor: "#7f1d1d" } : { backgroundColor: "#fef2f2" }]}>
                        <XCircle color="#ef4444" size={22} />
                        <Text style={[s.statNumber, { color: "#ef4444" }]}>{stats.inactiveJeeps}</Text>
                        <Text style={[s.statLabel, darkMode && { color: "#94a3b8" }]}>Inactive</Text>
                    </View>
                </View>

                {/* ── QUICK ACTIONS ── */}
                <View style={s.actionSection}>
                    <Text style={[s.actionSectionTitle, themeText]}>Quick Actions</Text>
                    <TouchableOpacity onPress={() => setPendingModalOpen(true)} style={[s.pendingCard, darkMode && { backgroundColor: "#1e293b", borderColor: "#451a03" }]} activeOpacity={0.8}>
                        <View style={s.cardLeft}>
                            <View style={[s.cardIconBox, { backgroundColor: "#fef3c7" }]}>
                                <FileText color="#d97706" size={22} />
                            </View>
                            <View>
                                <Text style={[s.cardTitle, themeText]}>Driver Applications</Text>
                                <Text style={[s.cardSub, themeSub]}>Review submitted documents</Text>
                            </View>
                        </View>
                        <View style={s.cardRight}>
                            {pendingCount > 0
                                ? <View style={s.countBadge}><Text style={s.countBadgeText}>{pendingCount}</Text></View>
                                : <CheckCircle color="#15803d" size={20} />
                            }
                            <ChevronRight color="#d97706" size={18} style={{ marginTop: 4 }} />
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleClearMap} style={[s.pendingCard, darkMode ? { backgroundColor: "#1e293b", borderColor: "#7f1d1d" } : { borderColor: "#fecaca" }]} activeOpacity={0.8}>
                        <View style={s.cardLeft}>
                            <View style={[s.cardIconBox, { backgroundColor: "#fee2e2" }]}>
                                <Trash2 color="#ef4444" size={22} />
                            </View>
                            <View>
                                <Text style={[s.cardTitle, themeText]}>Clear Live Map</Text>
                                <Text style={[s.cardSub, themeSub]}>Remove all active ride requests</Text>
                            </View>
                        </View>
                        <View style={s.cardRight}>
                            <ChevronRight color="#ef4444" size={18} />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* ── LIVE JEEP STATUS ── */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <TrendingUp color="#15803d" size={18} />
                        <Text style={[s.sectionTitle, themeText]}>Live Jeep Status</Text>
                    </View>
                    <Text style={[s.sectionHint, themeSub]}>Tap a jeep to view its revenue</Text>

                    {jeeps.length === 0 ? (
                        <Text style={[s.emptyText, themeSub]}>No jeeps found.</Text>
                    ) : jeeps.map(jeep => {
                        const info     = jeepInfo[jeep.uid];
                        const isActive = jeep.status === "available";
                        return (
                            <TouchableOpacity
                                key={jeep.uid}
                                style={[s.jeepCard, themeCard]}
                                onPress={() => setSelectedJeep(jeep)}
                                activeOpacity={0.75}
                            >
                                <View style={[s.statusDot, { backgroundColor: isActive ? "#15803d" : "#9ca3af" }]} />
                                <View style={s.jeepInfoBlock}>
                                    <Text style={[s.jeepName, themeText]}>{info?.driverName ?? "Unknown Driver"}</Text>
                                    <Text style={[s.jeepPlate, themeSub]}>{info?.plate ?? "No plate"} · {info?.route ?? "No route"}</Text>
                                    <Text style={[s.jeepCoords, themeSub]}>
                                        {jeep.latitude?.toFixed(5)}, {jeep.longitude?.toFixed(5)}
                                    </Text>
                                </View>
                                <View style={{ alignItems: "flex-end", gap: 6 }}>
                                    <View style={[s.statusBadge, isActive ? { backgroundColor: "#dcfce7" } : (darkMode ? { backgroundColor: "#334155" } : { backgroundColor: "#f3f4f6" })]}>
                                        <Text style={[s.statusText, { color: isActive ? "#15803d" : "#6b7280" }]}>
                                            {isActive ? "Active" : "Inactive"}
                                        </Text>
                                    </View>
                                    <View style={s.revenuePill}>
                                        <DollarSign color="#15803d" size={11} />
                                        <Text style={s.revenuePillTxt}>Revenue</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {/* ── ALL MODALS AT ROOT — never nested ── */}

            <DriversModal
                visible={driversModalOpen}
                onClose={() => setDriversModalOpen(false)}
                onSelectDriver={handleSelectDriver}
            />

            <DriverDetailSheet
                visible={!!selectedDriver}
                driver={selectedDriver}
                onClose={() => setSelectedDriver(null)}
            />

            {selectedJeep && (
                <JeepRevenueModal
                    visible={!!selectedJeep}
                    onClose={() => setSelectedJeep(null)}
                    driverId={selectedJeep.uid}
                    driverName={selectedInfo?.driverName ?? "Unknown Driver"}
                    plate={selectedInfo?.plate ?? "No plate"}
                    route={selectedInfo?.route ?? "No route"}
                />
            )}

            <PendingRegistrationsModal
                visible={pendingModalOpen}
                onClose={() => setPendingModalOpen(false)}
                onNavigateToRegistrations={() => router.push("/(admin)/registrations" as any)}
            />
        </SafeAreaView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container:        { flex: 1, backgroundColor: "#f9fafb" },
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f9fafb" },
    loadingText:      { marginTop: 12, color: "#6b7280", fontSize: 14 },

    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
    headerTitle: { fontSize: 22, fontWeight: "900", color: "#15803d" },
    headerSub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },
    logoutBtn:   { padding: 8, backgroundColor: "#fef2f2", borderRadius: 10 },

    statsGrid:  { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 20, gap: 12 },
    statCard:   { width: "47%", borderRadius: 16, padding: 16, alignItems: "flex-start", gap: 4 },
    statNumber: { fontSize: 28, fontWeight: "900", color: "#15803d" },
    statLabel:  { fontSize: 12, color: "#6b7280", fontWeight: "600" },
    statTapHint:{ fontSize: 10, color: "#15803d", fontWeight: "700" },

    actionSection:      { paddingHorizontal: 16, paddingTop: 24, gap: 12 },
    actionSectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 4 },

    pendingCard: { backgroundColor: "#fff", borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#fde68a", shadowColor: "#d97706", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
    cardLeft:    { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    cardRight:   { alignItems: "flex-end" },
    cardIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    cardTitle:   { fontSize: 15, fontWeight: "700", color: "#111827" },
    cardSub:     { fontSize: 12, color: "#6b7280", marginTop: 2 },
    countBadge:     { backgroundColor: "#fee2e2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
    countBadgeText: { color: "#dc2626", fontWeight: "800", fontSize: 13 },

    section:       { marginTop: 24, paddingHorizontal: 16, paddingBottom: 32 },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    sectionTitle:  { fontSize: 16, fontWeight: "800", color: "#111827" },
    sectionHint:   { fontSize: 11, color: "#9ca3af", marginBottom: 12 },
    emptyText:     { color: "#9ca3af", fontWeight: "600", fontSize: 14, textAlign: "center", marginTop: 20 },

    jeepCard:      { backgroundColor: "#fff", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    statusDot:     { width: 10, height: 10, borderRadius: 5, marginRight: 12, flexShrink: 0 },
    jeepInfoBlock: { flex: 1 },
    jeepName:      { fontSize: 15, fontWeight: "700", color: "#111827" },
    jeepPlate:     { fontSize: 12, color: "#6b7280", marginTop: 2 },
    jeepCoords:    { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText:    { fontSize: 12, fontWeight: "700" },
    revenuePill:   { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#f0fdf4", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#bbf7d0" },
    revenuePillTxt:{ fontSize: 10, fontWeight: "700", color: "#15803d" },

    // Shared modal / sheet
    overlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet:    { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
    handle:   { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 16 },
    closeBtn: { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },
    mHeader:  { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
    mAvatar:  { width: 50, height: 50, borderRadius: 25, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
    mAvatarTxt:{ fontSize: 22, fontWeight: "800", color: "#15803d" },
    mName:    { fontSize: 18, fontWeight: "800", color: "#111827" },
    mEmail:   { fontSize: 13, color: "#6b7280" },

    quickStats: { flexDirection: "row", gap: 8, marginBottom: 14 },
    qs:         { flex: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 3 },
    qsN:        { fontSize: 18, fontWeight: "900" },
    qsL:        { fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase" },

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

    centerBox:  { alignItems: "center", paddingVertical: 40, gap: 8 },
    centerTxt:  { color: "#9ca3af", fontWeight: "600", fontSize: 14, textAlign: "center" },

    tripCard:    { flexDirection: "row", marginBottom: 8 },
    tlDot:       { width: 24, alignItems: "center", paddingTop: 4 },
    dot:         { width: 10, height: 10, borderRadius: 5 },
    tlLine:      { width: 2, flex: 1, backgroundColor: "#e5e7eb", marginTop: 4 },
    tripContent: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, marginLeft: 8, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 4 },
    tripTop:     { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
    tripDest:    { fontSize: 13, fontWeight: "700", color: "#111827" },
    tripDate:    { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    tripBadge:   { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    tripBadgeTxt:{ fontSize: 11, fontWeight: "700" },

    listHint:       { fontSize: 11, color: "#9ca3af", marginBottom: 8 },
    driverCard:     { backgroundColor: "#fff", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, borderWidth: 1, borderColor: "#e5e7eb" },
    driverAvatar:   { width: 44, height: 44, borderRadius: 22, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
    driverAvatarTxt:{ fontSize: 18, fontWeight: "800", color: "#15803d" },
    driverName:     { fontSize: 15, fontWeight: "700", color: "#111827" },
    driverEmail:    { fontSize: 12, color: "#6b7280", marginTop: 2 },
    driverBadge:    { backgroundColor: "#f0fdf4", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    driverBadgeTxt: { color: "#15803d", fontSize: 11, fontWeight: "700" },

    reviewAllBtn: { backgroundColor: "#15803d", borderRadius: 14, paddingVertical: 16, marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    reviewAllTxt: { color: "white", fontWeight: "800", fontSize: 15 },
});
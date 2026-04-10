/* eslint-disable no-dupe-keys */
import React, { useEffect, useState, useCallback } from "react";
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator, RefreshControl,
    Modal, Dimensions, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
    Bus, Users, CheckCircle, XCircle, LogOut, TrendingUp,
    X, ChevronRight, DollarSign, Clock, FileText, BarChart2
} from "lucide-react-native";
import { auth, db, ref, onValue, signOut } from "../../services/firebase";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface RevenueEntry {
    id: string;
    driverId: string;
    driverName: string;
    amount: number;
    passengerCount: number;
    route: string;
    timestamp: number;
    date: string;
}

interface PendingRegistration {
    uid: string;
    fullName: string;
    email: string;
    licenseNumber: string;
    status: string;
    submittedAt: number;
}

type RevenueFilter = "today" | "week" | "month";

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function todayStr()      { return new Date().toISOString().split("T")[0]; }
function weekStartStr()  { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().split("T")[0]; }
function monthStartStr() { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; }

function getStartForFilter(f: RevenueFilter): string {
    if (f === "today") return todayStr();
    if (f === "week")  return weekStartStr();
    return monthStartStr();
}

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

// ─────────────────────────────────────────────────────────────────────────────
// MINI BAR CHART
// Renders a simple horizontal bar for a daily breakdown row.
// ─────────────────────────────────────────────────────────────────────────────

function MiniBar({ value, max }: { value: number; max: number }) {
    const pct = max > 0 ? Math.max(0.03, value / max) : 0.03;
    return (
        <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${pct * 100}%` as any }]} />
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE DETAIL MODAL
//
// State: revenueFilter (today|week|month) — toggling it re-filters allRevenue
//        locally; no extra Firebase call needed since allRevenue is already
//        loaded in the parent.
//
// Data flow:
//   allRevenue (full list from Firebase)
//     → filtered by date using getStartForFilter(revenueFilter)
//     → aggregated to total, byDate, byDriver in one .reduce() pass
// ─────────────────────────────────────────────────────────────────────────────

interface RevenueModalProps {
    visible: boolean;
    onClose: () => void;
    allRevenue: RevenueEntry[];
}

function RevenueDetailModal({ visible, onClose, allRevenue }: RevenueModalProps) {
    // Local filter state — only lives inside this modal
    const [filter, setFilter] = useState<RevenueFilter>("week");

    // Derived data: recomputed whenever filter or allRevenue changes
    const filtered = allRevenue.filter(e => e.date >= getStartForFilter(filter));

    // Single-pass aggregation
    const { total, byDate, byDriver, tripCount, totalPax } = filtered.reduce(
        (acc, e) => {
            acc.total    += e.amount;
            acc.tripCount += 1;
            acc.totalPax  += e.passengerCount ?? 0;
            acc.byDate[e.date] = (acc.byDate[e.date] ?? 0) + e.amount;
            if (!acc.byDriver[e.driverId]) {
                acc.byDriver[e.driverId] = { name: e.driverName, total: 0, trips: 0 };
            }
            acc.byDriver[e.driverId].total  += e.amount;
            acc.byDriver[e.driverId].trips  += 1;
            return acc;
        },
        { total: 0, tripCount: 0, totalPax: 0,
          byDate: {} as Record<string, number>,
          byDriver: {} as Record<string, { name: string; total: number; trips: number }> }
    );

    const maxDay      = Math.max(1, ...Object.values(byDate));
    const sortedDates = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
    const topDrivers  = Object.entries(byDriver).sort((a, b) => b[1].total - a[1].total);

    const FILTER_TABS: { key: RevenueFilter; label: string }[] = [
        { key: "today", label: "Today" },
        { key: "week",  label: "7 Days" },
        { key: "month", label: "Month"  },
    ];

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.modalOverlay}>
                <View style={[s.modalSheet, { height: SCREEN_H * 0.88 }]}>
                    <View style={s.sheetHandle} />

                    {/* Modal header */}
                    <View style={s.modalHeaderRow}>
                        <View style={s.modalHeaderIcon}>
                            <DollarSign color="#15803d" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.modalTitle}>Revenue Breakdown</Text>
                            <Text style={s.modalSub}>{tripCount} trips · {totalPax} passengers</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Filter tabs
                        State: filter (local to this modal)
                        Toggling a tab sets filter → filtered list recomputes → UI updates */}
                    <View style={s.filterRow}>
                        {FILTER_TABS.map(tab => (
                            <TouchableOpacity
                                key={tab.key}
                                onPress={() => setFilter(tab.key)}
                                style={[s.filterTab, filter === tab.key && s.filterTabActive]}
                                activeOpacity={0.7}
                            >
                                <Text style={[s.filterTabText, filter === tab.key && s.filterTabTextActive]}>
                                    {tab.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Total revenue hero */}
                    <View style={s.heroCard}>
                        <Text style={s.heroLabel}>Total Revenue</Text>
                        <Text style={s.heroAmount}>₱{total.toLocaleString()}</Text>
                        <Text style={s.heroSub}>
                            avg ₱{tripCount > 0 ? Math.round(total / tripCount) : 0} per trip
                        </Text>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>

                        {/* Daily bar chart */}
                        {sortedDates.length > 0 && (
                            <View style={s.section}>
                                <Text style={s.sectionTitle}>Daily Breakdown</Text>
                                {sortedDates.map(([date, amount]) => (
                                    <View key={date} style={s.dayRow}>
                                        <Text style={s.dayLabel}>
                                            {new Date(date + "T00:00:00").toLocaleDateString("en-PH", {
                                                weekday: "short", month: "short", day: "numeric",
                                            })}
                                        </Text>
                                        <View style={{ flex: 1, marginHorizontal: 12 }}>
                                            <MiniBar value={amount} max={maxDay} />
                                        </View>
                                        <Text style={s.dayAmount}>₱{amount.toLocaleString()}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Driver leaderboard */}
                        {topDrivers.length > 0 && (
                            <View style={s.section}>
                                <Text style={s.sectionTitle}>Driver Earnings</Text>
                                {topDrivers.map(([uid, d], i) => (
                                    <View key={uid} style={s.driverRow}>
                                        <View style={[s.rankBadge,
                                            i === 0 && { backgroundColor: "#fef9c3" },
                                            i === 1 && { backgroundColor: "#f1f5f9" },
                                            i === 2 && { backgroundColor: "#fef3c7" },
                                        ]}>
                                            <Text style={s.rankText}>{i + 1}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={s.driverRowTop}>
                                                <Text style={s.driverRowName} numberOfLines={1}>{d.name}</Text>
                                                <Text style={s.driverRowAmount}>₱{d.total.toLocaleString()}</Text>
                                            </View>
                                            <MiniBar value={d.total} max={topDrivers[0][1].total} />
                                            <Text style={s.driverRowSub}>{d.trips} trip{d.trips !== 1 ? "s" : ""}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {filtered.length === 0 && (
                            <View style={s.emptyBox}>
                                <Text style={s.emptyIcon}>📊</Text>
                                <Text style={s.emptyText}>No revenue data for this period.</Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING REGISTRATIONS MODAL
//
// State: pendingList is fetched from Firebase once when the modal opens
//        (via useEffect watching `visible`). This avoids always listening
//        to the registrations node from the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

interface PendingModalProps {
    visible: boolean;
    onClose: () => void;
    onNavigateToRegistrations: () => void;
}

function PendingRegistrationsModal({ visible, onClose, onNavigateToRegistrations }: PendingModalProps) {
    const [pendingList, setPendingList] = useState<PendingRegistration[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);

    // Fetch when modal opens — live listener so badge stays accurate
    useEffect(() => {
        if (!visible) return;
        setLoadingPending(true);
        const regRef = ref(db, "pending_registrations");
        const unsub = onValue(regRef, (snap) => {
            if (!snap.exists()) { setPendingList([]); setLoadingPending(false); return; }
            const data = snap.val();
            const list: PendingRegistration[] = Object.entries(data)
                .filter(([_, v]: any) => v.status === "pending")
                .map(([uid, v]: any) => ({ uid, ...v }))
                .sort((a: any, b: any) => b.submittedAt - a.submittedAt);
            setPendingList(list);
            setLoadingPending(false);
        });
        return () => unsub();
    }, [visible]);

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.modalOverlay}>
                <View style={[s.modalSheet, { height: SCREEN_H * 0.75 }]}>
                    <View style={s.sheetHandle} />

                    <View style={s.modalHeaderRow}>
                        <View style={[s.modalHeaderIcon, { backgroundColor: "#fef3c7" }]}>
                            <FileText color="#d97706" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.modalTitle}>Pending Applications</Text>
                            <Text style={s.modalSub}>{pendingList.length} awaiting review</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {loadingPending ? (
                        <ActivityIndicator color="#15803d" style={{ marginTop: 32 }} />
                    ) : pendingList.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Text style={s.emptyIcon}>✅</Text>
                            <Text style={s.emptyText}>No pending applications.</Text>
                        </View>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                            {pendingList.map(reg => (
                                <View key={reg.uid} style={s.regCard}>
                                    <View style={s.regAvatar}>
                                        <Text style={s.regAvatarText}>
                                            {reg.fullName?.charAt(0)?.toUpperCase() ?? "D"}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.regName}>{reg.fullName}</Text>
                                        <Text style={s.regEmail}>{reg.email}</Text>
                                        <View style={s.regMeta}>
                                            <Clock size={10} color="#9ca3af" />
                                            <Text style={s.regTime}>{timeAgo(reg.submittedAt)}</Text>
                                        </View>
                                    </View>
                                    <View style={s.pendingBadge}>
                                        <Text style={s.pendingBadgeText}>Pending</Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    )}

                    {/* Navigate to full registrations tab for approve/reject */}
                    <TouchableOpacity
                        style={s.reviewAllBtn}
                        onPress={() => { onClose(); onNavigateToRegistrations(); }}
                        activeOpacity={0.8}
                    >
                        <Text style={s.reviewAllText}>Review All Applications</Text>
                        <ChevronRight color="white" size={18} />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN DASHBOARD
//
// State management summary:
//   stats          — live jeep/driver counts from Firebase listeners
//   allRevenue     — full revenue list, passed to RevenueDetailModal
//   todayRevenue   — derived from allRevenue (today's total shown on card)
//   pendingCount   — live count of pending registrations for badge
//   revenueModalVisible  — toggles the revenue breakdown modal
//   pendingModalVisible  — toggles the pending registrations modal
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
    const router = useRouter();

    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);
    const [stats, setStats]             = useState({ totalDrivers: 0, totalJeeps: 0, activeJeeps: 0, inactiveJeeps: 0 });
    const [jeeps, setJeeps]             = useState<any[]>([]);
    const [jeepInfo, setJeepInfo]       = useState<Record<string, any>>({});
    const [allRevenue, setAllRevenue]   = useState<RevenueEntry[]>([]);
    const [pendingCount, setPendingCount] = useState(0);

    // Modal visibility — each controlled by a single boolean state
    const [revenueModalVisible, setRevenueModalVisible] = useState(false);
    const [pendingModalVisible, setPendingModalVisible] = useState(false);

    // Derived: today's total revenue (displayed on dashboard card)
    const todayRevenue = allRevenue
        .filter(e => e.date === todayStr())
        .reduce((sum, e) => sum + e.amount, 0);

    const weekRevenue = allRevenue
        .filter(e => e.date >= weekStartStr())
        .reduce((sum, e) => sum + e.amount, 0);

    // ── FIREBASE LISTENERS ──────────────────────────────────────────────────
    // All listeners are set up once in fetchData and cleaned up on unmount.
    // We use onValue (realtime) rather than get() so the dashboard updates live.

    const fetchData = useCallback(() => {
        const jeepsRef = ref(db, "jeeps");
        onValue(jeepsRef, (snap) => {
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

        onValue(ref(db, "jeep_info"), (snap) => {
            if (snap.exists()) setJeepInfo(snap.val());
        });

        onValue(ref(db, "users"), (snap) => {
            if (snap.exists()) {
                const drivers = Object.values(snap.val()).filter((u: any) => u.role === "driver").length;
                setStats(prev => ({ ...prev, totalDrivers: drivers }));
            }
        });

        // Revenue — loaded once here so it's available for the modal without
        // a second listener inside the modal component
        onValue(ref(db, "revenue"), (snap) => {
            if (!snap.exists()) { setAllRevenue([]); return; }
            const raw = snap.val() as Record<string, Omit<RevenueEntry, "id">>;
            const list: RevenueEntry[] = Object.entries(raw)
                .map(([id, v]) => ({ id, ...v }))
                .sort((a, b) => b.timestamp - a.timestamp);
            setAllRevenue(list);
        });

        // Pending registrations count for badge
        onValue(ref(db, "pending_registrations"), (snap) => {
            if (!snap.exists()) { setPendingCount(0); return; }
            const count = Object.values(snap.val()).filter((r: any) => r.status === "pending").length;
            setPendingCount(count);
        });
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleLogout = async () => {
        await signOut(auth);
        router.replace("/login");
    };

    const onRefresh = () => { setRefreshing(true); fetchData(); };

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

            {/* ── HEADER ──────────────────────────────────────────────────── */}
            <View style={s.header}>
                <View>
                    <Text style={s.headerTitle}>Admin Panel</Text>
                    <Text style={s.headerSub}>JeepRoute – Balacbac Transit</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={s.logoutBtn} activeOpacity={0.7}>
                    <LogOut color="#ef4444" size={20} />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#15803d" />}
            >
                {/* ── STAT CARDS ───────────────────────────────────────────── */}
                <View style={s.statsGrid}>
                    <View style={[s.statCard, { backgroundColor: "#f0fdf4" }]}>
                        <Users color="#15803d" size={22} />
                        <Text style={s.statNumber}>{stats.totalDrivers}</Text>
                        <Text style={s.statLabel}>Total Drivers</Text>
                    </View>
                    <View style={[s.statCard, { backgroundColor: "#eff6ff" }]}>
                        <Bus color="#2563eb" size={22} />
                        <Text style={[s.statNumber, { color: "#2563eb" }]}>{stats.totalJeeps}</Text>
                        <Text style={s.statLabel}>Total Jeeps</Text>
                    </View>
                    <View style={[s.statCard, { backgroundColor: "#f0fdf4" }]}>
                        <CheckCircle color="#15803d" size={22} />
                        <Text style={s.statNumber}>{stats.activeJeeps}</Text>
                        <Text style={s.statLabel}>Active</Text>
                    </View>
                    <View style={[s.statCard, { backgroundColor: "#fef2f2" }]}>
                        <XCircle color="#ef4444" size={22} />
                        <Text style={[s.statNumber, { color: "#ef4444" }]}>{stats.inactiveJeeps}</Text>
                        <Text style={s.statLabel}>Inactive</Text>
                    </View>
                </View>

                {/* ── CLICKABLE REVENUE CARD ───────────────────────────────────
                    Pressing this card sets revenueModalVisible = true which
                    renders the RevenueDetailModal above the current screen.
                    Pressable gives us the pressed/active visual state via style. */}
                <View style={s.actionSection}>
                    <Text style={s.actionSectionTitle}>Quick Actions</Text>

                    <Pressable
                        onPress={() => setRevenueModalVisible(true)}
                        style={({ pressed }) => [s.revenueCard, pressed && s.cardPressed]}
                    >
                        <View style={s.revenueCardLeft}>
                            <View style={s.revenueIconBox}>
                                <DollarSign color="#15803d" size={22} />
                            </View>
                            <View>
                                <Text style={s.revenueCardTitle}>Revenue Overview</Text>
                                <Text style={s.revenueCardSub}>Today: ₱{todayRevenue.toLocaleString()}</Text>
                            </View>
                        </View>
                        <View style={s.revenueCardRight}>
                            <Text style={s.revenueCardWeek}>₱{weekRevenue.toLocaleString()}</Text>
                            <Text style={s.revenueCardWeekLabel}>this week</Text>
                            <ChevronRight color="#15803d" size={18} style={{ marginTop: 4 }} />
                        </View>
                    </Pressable>

                    {/* ── PENDING REGISTRATIONS BUTTON ────────────────────────
                        Pressing sets pendingModalVisible = true.
                        The red badge shows pendingCount from the live listener. */}
                    <Pressable
                        onPress={() => setPendingModalVisible(true)}
                        style={({ pressed }) => [s.pendingCard, pressed && s.cardPressed]}
                    >
                        <View style={s.revenueCardLeft}>
                            <View style={[s.revenueIconBox, { backgroundColor: "#fef3c7" }]}>
                                <FileText color="#d97706" size={22} />
                            </View>
                            <View>
                                <Text style={s.revenueCardTitle}>Driver Applications</Text>
                                <Text style={s.revenueCardSub}>Review submitted documents</Text>
                            </View>
                        </View>
                        <View style={s.revenueCardRight}>
                            {pendingCount > 0 ? (
                                <View style={s.countBadge}>
                                    <Text style={s.countBadgeText}>{pendingCount}</Text>
                                </View>
                            ) : (
                                <CheckCircle color="#15803d" size={20} />
                            )}
                            <ChevronRight color="#d97706" size={18} style={{ marginTop: 4 }} />
                        </View>
                    </Pressable>
                </View>

                {/* ── LIVE JEEP STATUS ─────────────────────────────────────── */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <TrendingUp color="#15803d" size={18} />
                        <Text style={s.sectionTitle}>Live Jeep Status</Text>
                    </View>

                    {jeeps.length === 0 ? (
                        <Text style={s.emptyText}>No jeeps found.</Text>
                    ) : (
                        jeeps.map((jeep) => {
                            const info     = jeepInfo[jeep.uid];
                            const isActive = jeep.status === "available";
                            return (
                                <View key={jeep.uid} style={s.jeepCard}>
                                    <View style={[s.statusDot, { backgroundColor: isActive ? "#15803d" : "#9ca3af" }]} />
                                    <View style={s.jeepInfo}>
                                        <Text style={s.jeepName}>{info?.driverName ?? "Unknown Driver"}</Text>
                                        <Text style={s.jeepPlate}>{info?.plate ?? "No plate"} · {info?.route ?? "No route"}</Text>
                                        <Text style={s.jeepCoords}>
                                            {jeep.latitude?.toFixed(5)}, {jeep.longitude?.toFixed(5)}
                                        </Text>
                                    </View>
                                    <View style={[s.statusBadge, { backgroundColor: isActive ? "#dcfce7" : "#f3f4f6" }]}>
                                        <Text style={[s.statusText, { color: isActive ? "#15803d" : "#6b7280" }]}>
                                            {isActive ? "Active" : "Inactive"}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>
            </ScrollView>

            {/* ── MODALS ──────────────────────────────────────────────────── */}

            {/* Revenue detail modal — receives allRevenue so it can filter locally
                without touching Firebase again */}
            <RevenueDetailModal
                visible={revenueModalVisible}
                onClose={() => setRevenueModalVisible(false)}
                allRevenue={allRevenue}
            />

            {/* Pending registrations modal — fetches its own live slice */}
            <PendingRegistrationsModal
                visible={pendingModalVisible}
                onClose={() => setPendingModalVisible(false)}
                onNavigateToRegistrations={() => router.push("/(admin)/registrations" as any)}
            />
        </SafeAreaView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container:       { flex: 1, backgroundColor: "#f9fafb" },
    loadingContainer:{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f9fafb" },
    loadingText:     { marginTop: 12, color: "#6b7280", fontSize: 14 },

    header: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
    },
    headerTitle: { fontSize: 22, fontWeight: "900", color: "#15803d" },
    headerSub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },
    logoutBtn:   { padding: 8, backgroundColor: "#fef2f2", borderRadius: 10 },

    statsGrid: {
        flexDirection: "row", flexWrap: "wrap",
        paddingHorizontal: 16, paddingTop: 20, gap: 12,
    },
    statCard: { width: "47%", borderRadius: 16, padding: 16, alignItems: "flex-start", gap: 6 },
    statNumber:{ fontSize: 28, fontWeight: "900", color: "#15803d" },
    statLabel: { fontSize: 12, color: "#6b7280", fontWeight: "600" },

    // Quick actions section
    actionSection:      { paddingHorizontal: 16, paddingTop: 24, gap: 12 },
    actionSectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 4 },

    // Revenue card — Pressable gives active state via `pressed`
    revenueCard: {
        backgroundColor: "#fff", borderRadius: 18, padding: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        borderWidth: 1, borderColor: "#bbf7d0",
        shadowColor: "#15803d", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
    pendingCard: {
        backgroundColor: "#fff", borderRadius: 18, padding: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        borderWidth: 1, borderColor: "#fde68a",
        shadowColor: "#d97706", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
    // Active/pressed state — slight scale + opacity change
    cardPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },

    revenueCardLeft:  { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    revenueCardRight: { alignItems: "flex-end" },
    revenueIconBox:   { width: 44, height: 44, borderRadius: 14, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
    revenueCardTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
    revenueCardSub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },
    revenueCardWeek:  { fontSize: 18, fontWeight: "900", color: "#15803d" },
    revenueCardWeekLabel: { fontSize: 10, color: "#9ca3af", fontWeight: "600" },

    countBadge:     { backgroundColor: "#fee2e2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
    countBadgeText: { color: "#dc2626", fontWeight: "800", fontSize: 13 },

    section:        { marginTop: 24, paddingHorizontal: 16, paddingBottom: 32 },
    sectionHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    sectionTitle:   { fontSize: 16, fontWeight: "800", color: "#111827" },

    jeepCard: {
        backgroundColor: "#fff", borderRadius: 14, padding: 14,
        flexDirection: "row", alignItems: "center", marginBottom: 10,
        borderWidth: 1, borderColor: "#e5e7eb",
    },
    statusDot:  { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
    jeepInfo:   { flex: 1 },
    jeepName:   { fontSize: 15, fontWeight: "700", color: "#111827" },
    jeepPlate:  { fontSize: 12, color: "#6b7280", marginTop: 2 },
    jeepCoords: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    statusBadge:{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 12, fontWeight: "700" },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modalSheet: {
        backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 40,
    },
    sheetHandle: { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
    modalHeaderRow:  { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
    modalHeaderIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
    modalTitle:  { fontSize: 19, fontWeight: "800", color: "#111827" },
    modalSub:    { fontSize: 12, color: "#6b7280", marginTop: 2 },
    closeBtn:    { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },

    filterRow: { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 },
    filterTab:           { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: "center" },
    filterTabActive:     { backgroundColor: "#15803d" },
    filterTabText:       { fontSize: 13, fontWeight: "700", color: "#6b7280" },
    filterTabTextActive: { color: "white" },

    heroCard: { backgroundColor: "#f0fdf4", borderRadius: 18, padding: 20, alignItems: "center", marginBottom: 20 },
    heroLabel:  { fontSize: 12, fontWeight: "700", color: "#6b7280", textTransform: "uppercase" },
    heroAmount: { fontSize: 40, fontWeight: "900", color: "#15803d", marginTop: 4 },
    heroSub:    { fontSize: 12, color: "#9ca3af", marginTop: 4 },

    section2:      { marginBottom: 24 },
    sectionTitle2: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 12 },

    dayRow:    { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    dayLabel:  { fontSize: 12, fontWeight: "600", color: "#374151", width: 88 },
    dayAmount: { fontSize: 13, fontWeight: "800", color: "#15803d", width: 68, textAlign: "right" },

    barTrack: { height: 6, backgroundColor: "#f3f4f6", borderRadius: 3, overflow: "hidden", flex: 1 },
    barFill:  { height: 6, backgroundColor: "#15803d", borderRadius: 3 },

    driverRow:    { backgroundColor: "#fff", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, borderWidth: 1, borderColor: "#e5e7eb" },
    rankBadge:    { width: 28, height: 28, borderRadius: 14, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
    rankText:     { fontSize: 12, fontWeight: "800", color: "#374151" },
    driverRowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    driverRowName:   { fontSize: 14, fontWeight: "700", color: "#111827", flex: 1, marginRight: 8 },
    driverRowAmount: { fontSize: 15, fontWeight: "900", color: "#15803d" },
    driverRowSub:    { fontSize: 11, color: "#9ca3af", marginTop: 4 },

    // Pending registrations
    regCard:   { backgroundColor: "#fff", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, borderWidth: 1, borderColor: "#e5e7eb" },
    regAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fef3c7", alignItems: "center", justifyContent: "center" },
    regAvatarText: { fontSize: 18, fontWeight: "800", color: "#d97706" },
    regName:   { fontSize: 15, fontWeight: "700", color: "#111827" },
    regEmail:  { fontSize: 12, color: "#6b7280", marginTop: 1 },
    regMeta:   { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    regTime:   { fontSize: 10, color: "#9ca3af" },
    pendingBadge:     { backgroundColor: "#fef3c7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    pendingBadgeText: { color: "#d97706", fontSize: 11, fontWeight: "700" },

    reviewAllBtn: {
        backgroundColor: "#15803d", borderRadius: 14, paddingVertical: 16, marginTop: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    reviewAllText: { color: "white", fontWeight: "800", fontSize: 15 },

    emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
    emptyIcon: { fontSize: 36 },
    emptyText: { color: "#9ca3af", fontWeight: "600", fontSize: 14, textAlign: "center", marginTop: 20 },
});
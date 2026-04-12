/* eslint-disable no-dupe-keys */
import React, { useEffect, useState, useCallback } from "react";
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator, RefreshControl,
    Modal, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
    Bus, Users, CheckCircle, XCircle, LogOut, TrendingUp,
    X, ChevronRight, Clock, FileText, DollarSign,
} from "lucide-react-native";
import { auth, db, ref, onValue, signOut } from "../../services/firebase";
import { useDriverRevenue, DateFilter } from "../../hooks/useRevenue";

const { height: SCREEN_H } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface PendingRegistration {
    uid: string;
    fullName: string;
    email: string;
    licenseNumber: string;
    status: string;
    submittedAt: number;
}

interface JeepItem {
    uid: string;
    status: string;
    latitude?: number;
    longitude?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPERS
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

// ─────────────────────────────────────────────────────────────────────────────
// JEEP REVENUE MODAL
// Opens when admin taps a jeep card; shows that driver's revenue entries.
// ─────────────────────────────────────────────────────────────────────────────

interface JeepRevenueModalProps {
    visible: boolean;
    onClose: () => void;
    driverId: string;
    driverName: string;
    plate: string;
    route: string;
}

const REVENUE_TABS: { k: DateFilter; l: string }[] = [
    { k: "today", l: "Today" },
    { k: "week",  l: "Week"  },
    { k: "month", l: "Month" },
    { k: "all",   l: "All"   },
];

function JeepRevenueModal({ visible, onClose, driverId, driverName, plate, route }: JeepRevenueModalProps) {
    const [filter, setFilter] = useState<DateFilter>("today");
    const { entries, stats, loading } = useDriverRevenue(driverId, filter);

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.modalOverlay}>
                <View style={[s.modalSheet, { height: SCREEN_H * 0.88 }]}>
                    <View style={s.sheetHandle} />

                    {/* Header */}
                    <View style={s.modalHeaderRow}>
                        <View style={s.modalHeaderIcon}>
                            <Bus color="#15803d" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.modalTitle}>{driverName}</Text>
                            <Text style={s.modalSub}>{plate} · {route}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Filter tabs */}
                    <View style={s.filterTabs}>
                        {REVENUE_TABS.map(t => (
                            <TouchableOpacity
                                key={t.k}
                                onPress={() => setFilter(t.k)}
                                style={[s.filterTab, filter === t.k && s.filterTabActive]}
                            >
                                <Text style={[s.filterTabTxt, filter === t.k && s.filterTabTxtActive]}>
                                    {t.l}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {loading ? (
                        <ActivityIndicator color="#15803d" style={{ marginTop: 24 }} />
                    ) : (
                        <>
                            {/* Summary cards */}
                            <View style={s.summaryRow}>
                                <View style={[s.summaryCard, { backgroundColor: "#f0fdf4" }]}>
                                    <Text style={s.summaryAmt}>₱{stats.total.toLocaleString()}</Text>
                                    <Text style={s.summaryLbl}>Revenue</Text>
                                </View>
                                <View style={[s.summaryCard, { backgroundColor: "#eff6ff" }]}>
                                    <Text style={[s.summaryAmt, { color: "#2563eb" }]}>{stats.tripCount}</Text>
                                    <Text style={s.summaryLbl}>Trips</Text>
                                </View>
                                <View style={[s.summaryCard, { backgroundColor: "#fefce8" }]}>
                                    <Text style={[s.summaryAmt, { color: "#d97706" }]}>{stats.totalPassengers}</Text>
                                    <Text style={s.summaryLbl}>Passengers</Text>
                                </View>
                                <View style={[s.summaryCard, { backgroundColor: "#f0fdf4" }]}>
                                    <Text style={s.summaryAmt}>₱{stats.avgPerTrip}</Text>
                                    <Text style={s.summaryLbl}>Avg/Trip</Text>
                                </View>
                            </View>

                            {/* Revenue entries list */}
                            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                {entries.length === 0 ? (
                                    <View style={s.emptyBox}>
                                        <Text style={s.emptyIcon}>💰</Text>
                                        <Text style={s.emptyText}>No revenue recorded for this period.</Text>
                                    </View>
                                ) : (
                                    entries.map(e => (
                                        <View key={e.id} style={s.revenueRow}>
                                            <View style={s.revenueRowDot} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.revenueRoute}>{e.route}</Text>
                                                <Text style={s.revenueMeta}>
                                                    {e.passengerCount} pax ·{" "}
                                                    {new Date(e.timestamp).toLocaleDateString("en-PH", {
                                                        month: "short", day: "numeric",
                                                        hour: "2-digit", minute: "2-digit",
                                                    })}
                                                </Text>
                                                {e.groups && e.groups.length > 0 && (
                                                    <Text style={s.revenueGroups}>
                                                        {e.groups.map((g: any) => `${g.passengerCount}×₱${g.farePerPassenger}`).join("  +  ")}
                                                    </Text>
                                                )}
                                            </View>
                                            <Text style={s.revenueAmt}>₱{e.amount}</Text>
                                        </View>
                                    ))
                                )}
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
    visible: boolean;
    onClose: () => void;
    onNavigateToRegistrations: () => void;
}

function PendingRegistrationsModal({ visible, onClose, onNavigateToRegistrations }: PendingModalProps) {
    const [pendingList, setPendingList] = useState<PendingRegistration[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);

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
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
    const router = useRouter();

    const [loading, setLoading]           = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [stats, setStats]               = useState({ totalDrivers: 0, totalJeeps: 0, activeJeeps: 0, inactiveJeeps: 0 });
    const [jeeps, setJeeps]               = useState<JeepItem[]>([]);
    const [jeepInfo, setJeepInfo]         = useState<Record<string, any>>({});
    const [pendingCount, setPendingCount] = useState(0);

    // Which jeep card was tapped — drives JeepRevenueModal
    const [selectedJeep, setSelectedJeep] = useState<JeepItem | null>(null);
    const [pendingModalVisible, setPendingModalVisible] = useState(false);

    const fetchData = useCallback(() => {
        onValue(ref(db, "jeeps"), (snap) => {
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

    const selectedInfo = selectedJeep ? jeepInfo[selectedJeep.uid] : null;

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

                {/* ── QUICK ACTIONS ────────────────────────────────────────── */}
                <View style={s.actionSection}>
                    <Text style={s.actionSectionTitle}>Quick Actions</Text>
                    <TouchableOpacity
                        onPress={() => setPendingModalVisible(true)}
                        style={s.pendingCard}
                        activeOpacity={0.8}
                    >
                        <View style={s.cardLeft}>
                            <View style={[s.cardIconBox, { backgroundColor: "#fef3c7" }]}>
                                <FileText color="#d97706" size={22} />
                            </View>
                            <View>
                                <Text style={s.cardTitle}>Driver Applications</Text>
                                <Text style={s.cardSub}>Review submitted documents</Text>
                            </View>
                        </View>
                        <View style={s.cardRight}>
                            {pendingCount > 0 ? (
                                <View style={s.countBadge}>
                                    <Text style={s.countBadgeText}>{pendingCount}</Text>
                                </View>
                            ) : (
                                <CheckCircle color="#15803d" size={20} />
                            )}
                            <ChevronRight color="#d97706" size={18} style={{ marginTop: 4 }} />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* ── LIVE JEEP STATUS ─────────────────────────────────────── */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <TrendingUp color="#15803d" size={18} />
                        <Text style={s.sectionTitle}>Live Jeep Status</Text>
                    </View>
                    <Text style={s.sectionHint}>Tap a jeep to view its revenue</Text>

                    {jeeps.length === 0 ? (
                        <Text style={s.emptyText}>No jeeps found.</Text>
                    ) : (
                        jeeps.map((jeep) => {
                            const info     = jeepInfo[jeep.uid];
                            const isActive = jeep.status === "available";
                            return (
                                <TouchableOpacity
                                    key={jeep.uid}
                                    style={s.jeepCard}
                                    onPress={() => setSelectedJeep(jeep)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[s.statusDot, { backgroundColor: isActive ? "#15803d" : "#9ca3af" }]} />
                                    <View style={s.jeepInfoBlock}>
                                        <Text style={s.jeepName}>{info?.driverName ?? "Unknown Driver"}</Text>
                                        <Text style={s.jeepPlate}>{info?.plate ?? "No plate"} · {info?.route ?? "No route"}</Text>
                                        <Text style={s.jeepCoords}>
                                            {jeep.latitude?.toFixed(5)}, {jeep.longitude?.toFixed(5)}
                                        </Text>
                                    </View>
                                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                                        <View style={[s.statusBadge, { backgroundColor: isActive ? "#dcfce7" : "#f3f4f6" }]}>
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
                        })
                    )}
                </View>
            </ScrollView>

            {/* ── JEEP REVENUE MODAL ───────────────────────────────────────── */}
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

            {/* ── PENDING REGISTRATIONS MODAL ──────────────────────────────── */}
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
    container:        { flex: 1, backgroundColor: "#f9fafb" },
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f9fafb" },
    loadingText:      { marginTop: 12, color: "#6b7280", fontSize: 14 },

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
    statCard:   { width: "47%", borderRadius: 16, padding: 16, alignItems: "flex-start", gap: 6 },
    statNumber: { fontSize: 28, fontWeight: "900", color: "#15803d" },
    statLabel:  { fontSize: 12, color: "#6b7280", fontWeight: "600" },

    actionSection:      { paddingHorizontal: 16, paddingTop: 24, gap: 12 },
    actionSectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 4 },

    pendingCard: {
        backgroundColor: "#fff", borderRadius: 18, padding: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        borderWidth: 1, borderColor: "#fde68a",
        shadowColor: "#d97706", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
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

    jeepCard: {
        backgroundColor: "#fff", borderRadius: 14, padding: 14,
        flexDirection: "row", alignItems: "center", marginBottom: 10,
        borderWidth: 1, borderColor: "#e5e7eb",
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    },
    statusDot:    { width: 10, height: 10, borderRadius: 5, marginRight: 12, flexShrink: 0 },
    jeepInfoBlock:{ flex: 1 },
    jeepName:     { fontSize: 15, fontWeight: "700", color: "#111827" },
    jeepPlate:    { fontSize: 12, color: "#6b7280", marginTop: 2 },
    jeepCoords:   { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    statusBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText:   { fontSize: 12, fontWeight: "700" },
    revenuePill: {
        flexDirection: "row", alignItems: "center", gap: 3,
        backgroundColor: "#f0fdf4", borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 3,
        borderWidth: 1, borderColor: "#bbf7d0",
    },
    revenuePillTxt: { fontSize: 10, fontWeight: "700", color: "#15803d" },

    // ── Modals shared ──
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modalSheet: {
        backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 20, paddingBottom: 40,
    },
    sheetHandle:     { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 16 },
    modalHeaderRow:  { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
    modalHeaderIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
    modalTitle:      { fontSize: 18, fontWeight: "800", color: "#111827" },
    modalSub:        { fontSize: 12, color: "#6b7280", marginTop: 2 },
    closeBtn:        { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },

    // Revenue modal — filter tabs
    filterTabs:         { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
    filterTab:          { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
    filterTabActive:    { backgroundColor: "#15803d" },
    filterTabTxt:       { fontSize: 12, fontWeight: "700", color: "#6b7280" },
    filterTabTxtActive: { color: "white" },

    // Revenue modal — summary row
    summaryRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    summaryCard:{ flex: 1, borderRadius: 12, padding: 10, alignItems: "center" },
    summaryAmt: { fontSize: 16, fontWeight: "900", color: "#15803d" },
    summaryLbl: { fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginTop: 2 },

    // Revenue entry rows
    revenueRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
    revenueRowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#15803d", flexShrink: 0 },
    revenueRoute:  { fontSize: 13, fontWeight: "700", color: "#111827" },
    revenueMeta:   { fontSize: 11, color: "#6b7280", marginTop: 1 },
    revenueGroups: { fontSize: 10, color: "#9ca3af", marginTop: 2 },
    revenueAmt:    { fontSize: 15, fontWeight: "900", color: "#15803d" },

    // Pending modal
    regCard:       { backgroundColor: "#fff", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, borderWidth: 1, borderColor: "#e5e7eb" },
    regAvatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fef3c7", alignItems: "center", justifyContent: "center" },
    regAvatarText: { fontSize: 18, fontWeight: "800", color: "#d97706" },
    regName:       { fontSize: 15, fontWeight: "700", color: "#111827" },
    regEmail:      { fontSize: 12, color: "#6b7280", marginTop: 1 },
    regMeta:       { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    regTime:       { fontSize: 10, color: "#9ca3af" },
    pendingBadge:     { backgroundColor: "#fef3c7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    pendingBadgeText: { color: "#d97706", fontSize: 11, fontWeight: "700" },

    reviewAllBtn: {
        backgroundColor: "#15803d", borderRadius: 14, paddingVertical: 16, marginTop: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    reviewAllText: { color: "white", fontWeight: "800", fontSize: 15 },

    emptyBox:  { alignItems: "center", paddingVertical: 40, gap: 8 },
    emptyIcon: { fontSize: 36 },
    emptyText: { color: "#9ca3af", fontWeight: "600", fontSize: 14, textAlign: "center", marginTop: 20 },
});
import React, { useState } from "react";
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    TouchableOpacity, Dimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TrendingUp, Users, Navigation, BarChart2, DollarSign } from "lucide-react-native";
import { useRevenue, DateFilter, RevenueStats, RevenueEntry } from "../../hooks/useRevenue";

const { width } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// FILTER CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS: { key: DateFilter; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All Time" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
    label, value, sub, icon, accent,
}: {
    label: string; value: string; sub?: string;
    icon: React.ReactNode; accent: string;
}) {
    return (
        <View style={[s.statCard, { borderLeftColor: accent }]}>
            <View style={[s.statIcon, { backgroundColor: accent + "20" }]}>{icon}</View>
            <View style={{ flex: 1 }}>
                <Text style={s.statLabel}>{label}</Text>
                <Text style={[s.statValue, { color: accent }]}>{value}</Text>
                {sub ? <Text style={s.statSub}>{sub}</Text> : null}
            </View>
        </View>
    );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.max(0.04, value / max) : 0.04;
    return (
        <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        </View>
    );
}

function DriverLeaderboard({
    stats, filter,
}: {
    stats: RevenueStats; filter: DateFilter;
}) {
    const drivers = Object.entries(stats.byDriver)
        .map(([id, d]) => ({ id, ...d }))
        .sort((a, b) => b.total - a.total);

    const maxTotal = drivers[0]?.total ?? 1;

    if (drivers.length === 0) {
        return (
            <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>🚌</Text>
                <Text style={s.emptyText}>No revenue data for this period.</Text>
            </View>
        );
    }

    return (
        <View style={s.leaderboard}>
            {drivers.map((d, i) => (
                <View key={d.id} style={s.driverRow}>
                    <View style={[s.rankBadge, i === 0 && s.rankFirst, i === 1 && s.rankSecond, i === 2 && s.rankThird]}>
                        <Text style={s.rankText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={s.driverRowTop}>
                            <Text style={s.driverRowName} numberOfLines={1}>{d.name}</Text>
                            <Text style={[s.driverRowAmount, { color: "#15803d" }]}>
                                ₱{d.total.toLocaleString()}
                            </Text>
                        </View>
                        <MiniBar value={d.total} max={maxTotal} color="#15803d" />
                        <Text style={s.driverRowSub}>{d.trips} trip{d.trips !== 1 ? "s" : ""}</Text>
                    </View>
                </View>
            ))}
        </View>
    );
}

function RecentTrips({ entries }: { entries: RevenueEntry[] }) {
    const shown = entries.slice(0, 12);
    if (shown.length === 0) return null;

    return (
        <View style={s.section}>
            <Text style={s.sectionTitle}>Recent Trips</Text>
            {shown.map((e) => (
                <View key={e.id} style={s.tripRow}>
                    <View style={s.tripIconBox}>
                        <Navigation color="#15803d" size={16} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.tripRowName}>{e.driverName}</Text>
                        <Text style={s.tripRowRoute}>
                            {e.route} · {e.passengerCount} pax
                        </Text>
                        <Text style={s.tripRowTime}>
                            {new Date(e.timestamp).toLocaleString("en-PH", {
                                month: "short", day: "numeric",
                                hour: "2-digit", minute: "2-digit",
                            })}
                        </Text>
                    </View>
                    <Text style={s.tripRowAmount}>₱{e.amount}</Text>
                </View>
            ))}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminRevenue() {
    const [filter, setFilter] = useState<DateFilter>("week");
    const { entries, stats, loading } = useRevenue(filter);

    const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "";

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.title}>Revenue</Text>
                    <Text style={s.sub}>{filterLabel} · {entries.length} trips</Text>
                </View>
                <View style={s.totalPill}>
                    <Text style={s.totalPillLabel}>Total</Text>
                    <Text style={s.totalPillAmount}>
                        ₱{stats.total.toLocaleString()}
                    </Text>
                </View>
            </View>

            {/* Filter tabs */}
            <View style={s.filterRow}>
                {FILTERS.map((f) => (
                    <TouchableOpacity
                        key={f.key}
                        onPress={() => setFilter(f.key)}
                        style={[s.filterTab, filter === f.key && s.filterTabActive]}
                    >
                        <Text style={[s.filterTabText, filter === f.key && s.filterTabTextActive]}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <ActivityIndicator color="#15803d" style={{ marginTop: 40 }} />
            ) : (
                <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                    {/* ── STAT CARDS ── */}
                    <View style={s.statsGrid}>
                        <StatCard
                            label="Total Revenue"
                            value={`₱${stats.total.toLocaleString()}`}
                            sub={filterLabel}
                            icon={<TrendingUp color="#15803d" size={18} />}
                            accent="#15803d"
                        />
                        <StatCard
                            label="Total Trips"
                            value={`${stats.tripCount}`}
                            sub={`avg ₱${stats.avgPerTrip} / trip`}
                            icon={<Navigation color="#2563eb" size={18} />}
                            accent="#2563eb"
                        />
                        <StatCard
                            label="Passengers"
                            value={`${stats.totalPassengers}`}
                            sub="total boarded"
                            icon={<Users color="#7c3aed" size={18} />}
                            accent="#7c3aed"
                        />
                        <StatCard
                            label="Avg / Trip"
                            value={`₱${stats.avgPerTrip}`}
                            sub="per completed trip"
                            icon={<BarChart2 color="#d97706" size={18} />}
                            accent="#d97706"
                        />
                    </View>

                    {/* ── DRIVER LEADERBOARD ── */}
                    <View style={s.section}>
                        <View style={s.sectionHeaderRow}>
                            <Text style={s.sectionTitle}>Driver Earnings</Text>
                            <View style={s.sectionBadge}>
                                <Text style={s.sectionBadgeText}>{Object.keys(stats.byDriver).length} drivers</Text>
                            </View>
                        </View>
                        <DriverLeaderboard stats={stats} filter={filter} />
                    </View>

                    {/* ── DAILY BREAKDOWN ── */}
                    {Object.keys(stats.byDate).length > 1 && (
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>Daily Breakdown</Text>
                            {Object.entries(stats.byDate)
                                .sort((a, b) => b[0].localeCompare(a[0]))
                                .map(([date, amount]) => {
                                    const maxDay = Math.max(...Object.values(stats.byDate));
                                    return (
                                        <View key={date} style={s.dayRow}>
                                            <Text style={s.dayLabel}>
                                                {new Date(date + "T00:00:00").toLocaleDateString("en-PH", {
                                                    weekday: "short", month: "short", day: "numeric",
                                                })}
                                            </Text>
                                            <View style={{ flex: 1, marginHorizontal: 12 }}>
                                                <MiniBar value={amount} max={maxDay} color="#15803d" />
                                            </View>
                                            <Text style={s.dayAmount}>₱{amount.toLocaleString()}</Text>
                                        </View>
                                    );
                                })}
                        </View>
                    )}

                    {/* ── RECENT TRIPS ── */}
                    <RecentTrips entries={entries} />

                </ScrollView>
            )}
        </SafeAreaView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f9fafb" },

    header: {
        backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    title: { fontSize: 22, fontWeight: "900", color: "#15803d" },
    sub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
    totalPill: {
        backgroundColor: "#f0fdf4", borderRadius: 16,
        paddingHorizontal: 14, paddingVertical: 8, alignItems: "center",
        borderWidth: 1.5, borderColor: "#bbf7d0",
    },
    totalPillLabel: { fontSize: 10, fontWeight: "700", color: "#6b7280", textTransform: "uppercase" },
    totalPillAmount: { fontSize: 20, fontWeight: "900", color: "#15803d" },

    filterRow: {
        flexDirection: "row", backgroundColor: "#fff",
        paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 8,
        borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
    },
    filterTab: {
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
        backgroundColor: "#f3f4f6", borderWidth: 1.5, borderColor: "transparent",
    },
    filterTabActive: { backgroundColor: "#15803d", borderColor: "#15803d" },
    filterTabText: { fontSize: 12, fontWeight: "700", color: "#6b7280" },
    filterTabTextActive: { color: "white" },

    scroll: { padding: 16, paddingBottom: 48 },

    statsGrid: { gap: 10, marginBottom: 24 },
    statCard: {
        backgroundColor: "#fff", borderRadius: 16, padding: 14,
        flexDirection: "row", alignItems: "center", gap: 12,
        borderLeftWidth: 4,
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    statLabel: { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase" },
    statValue: { fontSize: 22, fontWeight: "900", marginTop: 2 },
    statSub: { fontSize: 11, color: "#9ca3af", marginTop: 2 },

    section: { marginBottom: 24 },
    sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 12 },
    sectionBadge: { backgroundColor: "#f0fdf4", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    sectionBadgeText: { fontSize: 11, fontWeight: "700", color: "#15803d" },

    leaderboard: { gap: 10 },
    driverRow: {
        backgroundColor: "#fff", borderRadius: 14, padding: 14,
        flexDirection: "row", alignItems: "center", gap: 12,
        borderWidth: 1, borderColor: "#e5e7eb",
    },
    rankBadge: {
        width: 28, height: 28, borderRadius: 14, backgroundColor: "#f3f4f6",
        alignItems: "center", justifyContent: "center",
    },
    rankFirst: { backgroundColor: "#fef9c3" },
    rankSecond: { backgroundColor: "#f1f5f9" },
    rankThird: { backgroundColor: "#fef3c7" },
    rankText: { fontSize: 12, fontWeight: "800", color: "#374151" },
    driverRowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    driverRowName: { fontSize: 14, fontWeight: "700", color: "#111827", flex: 1, marginRight: 8 },
    driverRowAmount: { fontSize: 15, fontWeight: "900" },
    driverRowSub: { fontSize: 11, color: "#9ca3af", marginTop: 4 },

    barTrack: { height: 6, backgroundColor: "#f3f4f6", borderRadius: 3, overflow: "hidden" },
    barFill: { height: 6, borderRadius: 3 },

    dayRow: {
        flexDirection: "row", alignItems: "center",
        backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8,
        borderWidth: 1, borderColor: "#e5e7eb",
    },
    dayLabel: { fontSize: 12, fontWeight: "600", color: "#374151", width: 90 },
    dayAmount: { fontSize: 13, fontWeight: "800", color: "#15803d", width: 64, textAlign: "right" },

    tripRow: {
        backgroundColor: "#fff", borderRadius: 14, padding: 12,
        flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8,
        borderWidth: 1, borderColor: "#e5e7eb",
    },
    tripIconBox: {
        width: 36, height: 36, borderRadius: 10, backgroundColor: "#f0fdf4",
        alignItems: "center", justifyContent: "center",
    },
    tripRowName: { fontSize: 14, fontWeight: "700", color: "#111827" },
    tripRowRoute: { fontSize: 12, color: "#6b7280", marginTop: 1 },
    tripRowTime: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    tripRowAmount: { fontSize: 16, fontWeight: "900", color: "#15803d" },

    emptyBox: { alignItems: "center", paddingVertical: 48, gap: 8 },
    emptyIcon: { fontSize: 36 },
    emptyText: { color: "#9ca3af", fontWeight: "600", fontSize: 14 },
});
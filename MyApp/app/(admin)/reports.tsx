import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    TouchableOpacity, Modal, Alert, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertTriangle, CheckCircle, Trash2, X, MessageSquare, Clock, ChevronRight, Filter } from "lucide-react-native";
import { db, ref, onValue, update, remove } from "../../services/firebase";

const { height } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type ReportStatus = "open" | "resolved";

interface Report {
    id: string;
    category: string;
    message: string;
    userId: string;
    userEmail: string;
    status: ReportStatus;
    timestamp: number;
    date: string;
    resolvedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
    map:    { label: "Map / GPS",         emoji: "🗺️", color: "#2563eb", bg: "#eff6ff" },
    driver: { label: "Driver Behaviour",  emoji: "🚌", color: "#d97706", bg: "#fef3c7" },
    app:    { label: "App Bug / Crash",   emoji: "📱", color: "#7c3aed", bg: "#f5f3ff" },
    fare:   { label: "Wrong Fare",        emoji: "💰", color: "#15803d", bg: "#f0fdf4" },
    other:  { label: "Other",            emoji: "💬", color: "#64748b", bg: "#f8fafc" },
};

function timeAgo(ts: number) {
    const d = Date.now() - ts, m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000);
    if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`; return `${dy}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────

function ReportDetailModal({ report, onClose }: { report: Report | null; onClose: () => void }) {
    if (!report) return null;
    const meta = CATEGORY_META[report.category] ?? CATEGORY_META["other"];

    const handleResolve = () => {
        Alert.alert("Mark as Resolved?", "This will mark the report as resolved.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Resolve", onPress: async () => {
                    await update(ref(db, `reports/${report.id}`), { status: "resolved", resolvedAt: Date.now() });
                    onClose();
                },
            },
        ]);
    };

    const handleDelete = () => {
        Alert.alert("Delete Report?", "This action cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    await remove(ref(db, `reports/${report.id}`));
                    onClose();
                },
            },
        ]);
    };

    return (
        <Modal visible={!!report} animationType="slide" transparent onRequestClose={onClose}>
            <View style={d.overlay}>
                <View style={[d.sheet, { height: height * 0.72 }]}>
                    <View style={d.handle} />

                    {/* Header */}
                    <View style={d.headerRow}>
                        <View style={[d.categoryBadge, { backgroundColor: meta.bg }]}>
                            <Text style={{ fontSize: 22 }}>{meta.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={d.headerTitle}>{meta.label}</Text>
                            <Text style={d.headerSub}>{timeAgo(report.timestamp)}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={d.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Status pill */}
                    <View style={[d.statusPill, { backgroundColor: report.status === "open" ? "#fef3c7" : "#dcfce7" }]}>
                        {report.status === "open"
                            ? <Clock color="#d97706" size={14} />
                            : <CheckCircle color="#15803d" size={14} />
                        }
                        <Text style={[d.statusTxt, { color: report.status === "open" ? "#d97706" : "#15803d" }]}>
                            {report.status === "open" ? "Open — awaiting review" : "Resolved"}
                        </Text>
                    </View>

                    {/* Info rows */}
                    <View style={d.infoRow}>
                        <Text style={d.infoLabel}>From</Text>
                        <Text style={d.infoVal}>{report.userEmail}</Text>
                    </View>
                    <View style={d.infoRow}>
                        <Text style={d.infoLabel}>Date</Text>
                        <Text style={d.infoVal}>{new Date(report.timestamp).toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "long", day: "numeric" })}</Text>
                    </View>

                    {/* Message */}
                    <Text style={d.msgLabel}>MESSAGE</Text>
                    <View style={d.msgBox}>
                        <Text style={d.msgTxt}>{report.message}</Text>
                    </View>

                    {/* Actions */}
                    <View style={d.actionRow}>
                        <TouchableOpacity style={d.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
                            <Trash2 color="#ef4444" size={18} />
                            <Text style={d.deleteTxt}>Delete</Text>
                        </TouchableOpacity>
                        {report.status === "open" && (
                            <TouchableOpacity style={d.resolveBtn} onPress={handleResolve} activeOpacity={0.85}>
                                <CheckCircle color="white" size={18} />
                                <Text style={d.resolveTxt}>Mark Resolved</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const d = StyleSheet.create({
    overlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet:        { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
    handle:       { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
    headerRow:    { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
    categoryBadge:{ width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    headerTitle:  { fontSize: 17, fontWeight: "800", color: "#111827" },
    headerSub:    { fontSize: 12, color: "#9ca3af", marginTop: 2 },
    closeBtn:     { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },
    statusPill:   { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 16 },
    statusTxt:    { fontSize: 12, fontWeight: "700" },
    infoRow:      { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
    infoLabel:    { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
    infoVal:      { fontSize: 13, color: "#111827", fontWeight: "700", maxWidth: "70%", textAlign: "right" },
    msgLabel:     { fontSize: 10, fontWeight: "800", color: "#9ca3af", letterSpacing: 1, marginTop: 16, marginBottom: 8 },
    msgBox:       { backgroundColor: "#f9fafb", borderRadius: 14, padding: 14, flex: 1, borderWidth: 1, borderColor: "#e5e7eb" },
    msgTxt:       { fontSize: 14, color: "#374151", lineHeight: 21 },
    actionRow:    { flexDirection: "row", gap: 12, marginTop: 16 },
    deleteBtn:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fee2e2", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20 },
    deleteTxt:    { color: "#ef4444", fontWeight: "700" },
    resolveBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#15803d", borderRadius: 12, paddingVertical: 14 },
    resolveTxt:   { color: "white", fontWeight: "800", fontSize: 14 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

type FilterType = "all" | "open" | "resolved";

export default function AdminReports() {
    const [reports, setReports]       = useState<Report[]>([]);
    const [loading, setLoading]       = useState(true);
    const [selected, setSelected]     = useState<Report | null>(null);
    const [filter, setFilter]         = useState<FilterType>("open");

    useEffect(() => {
        const unsub = onValue(ref(db, "reports"), (snap) => {
            if (!snap.exists()) { setReports([]); setLoading(false); return; }
            const data = snap.val() as Record<string, Omit<Report, "id">>;
            setReports(
                Object.entries(data)
                    .map(([id, v]) => ({ id, ...v } as Report))
                    .sort((a, b) => b.timestamp - a.timestamp)
            );
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const openCount     = reports.filter(r => r.status === "open").length;
    const resolvedCount = reports.filter(r => r.status === "resolved").length;
    const filtered      = filter === "all" ? reports : reports.filter(r => r.status === filter);

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.title}>Reports</Text>
                    <Text style={s.sub}>User-submitted problems</Text>
                </View>
                <View style={s.headerRight}>
                    {openCount > 0 && (
                        <View style={s.openBadge}>
                            <Text style={s.openBadgeTxt}>{openCount} open</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Filter tabs */}
            <View style={s.filterRow}>
                {([
                    { key: "open",     label: `Open (${openCount})` },
                    { key: "resolved", label: `Resolved (${resolvedCount})` },
                    { key: "all",      label: `All (${reports.length})` },
                ] as { key: FilterType; label: string }[]).map(f => (
                    <TouchableOpacity
                        key={f.key}
                        style={[s.filterTab, filter === f.key && s.filterTabActive]}
                        onPress={() => setFilter(f.key)}
                    >
                        <Text style={[s.filterTxt, filter === f.key && s.filterTxtActive]}>{f.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* List */}
            {loading ? (
                <ActivityIndicator color="#15803d" style={{ marginTop: 60 }} />
            ) : (
                <ScrollView contentContainerStyle={s.list}>
                    {filtered.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Text style={{ fontSize: 48, marginBottom: 12 }}>
                                {filter === "open" ? "✅" : "📋"}
                            </Text>
                            <Text style={s.emptyTitle}>
                                {filter === "open" ? "No open reports!" : "No reports here."}
                            </Text>
                            <Text style={s.emptySub}>
                                {filter === "open" ? "All issues have been resolved." : "Reports will appear here when users submit them from the Settings screen."}
                            </Text>
                        </View>
                    ) : filtered.map(report => {
                        const meta = CATEGORY_META[report.category] ?? CATEGORY_META["other"];
                        return (
                            <TouchableOpacity
                                key={report.id}
                                style={[s.card, report.status === "open" && s.cardOpen]}
                                onPress={() => setSelected(report)}
                                activeOpacity={0.75}
                            >
                                <View style={[s.cardEmoji, { backgroundColor: meta.bg }]}>
                                    <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                        <Text style={[s.cardCategory, { color: meta.color }]}>{meta.label}</Text>
                                        {report.status === "open" && <View style={s.openDot} />}
                                    </View>
                                    <Text style={s.cardMsg} numberOfLines={2}>{report.message}</Text>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                                        <Clock color="#9ca3af" size={10} />
                                        <Text style={s.cardTime}>{timeAgo(report.timestamp)} · {report.userEmail === "guest" ? "Guest" : report.userEmail}</Text>
                                    </View>
                                </View>
                                <View style={{ alignItems: "flex-end", gap: 6 }}>
                                    <View style={[s.statusPill, { backgroundColor: report.status === "open" ? "#fef3c7" : "#dcfce7" }]}>
                                        <Text style={[s.statusTxt, { color: report.status === "open" ? "#d97706" : "#15803d" }]}>
                                            {report.status === "open" ? "Open" : "Done"}
                                        </Text>
                                    </View>
                                    <ChevronRight color="#d1d5db" size={16} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            <ReportDetailModal report={selected} onClose={() => setSelected(null)} />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container:      { flex: 1, backgroundColor: "#f9fafb" },
    header:         { backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title:          { fontSize: 22, fontWeight: "900", color: "#15803d" },
    sub:            { fontSize: 12, color: "#6b7280", marginTop: 2 },
    headerRight:    { alignItems: "flex-end" },
    openBadge:      { backgroundColor: "#fef3c7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    openBadgeTxt:   { color: "#d97706", fontWeight: "800", fontSize: 12 },
    filterRow:      { flexDirection: "row", backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
    filterTab:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f3f4f6" },
    filterTabActive:{ backgroundColor: "#15803d" },
    filterTxt:      { fontSize: 12, fontWeight: "700", color: "#6b7280" },
    filterTxtActive:{ color: "white" },
    list:           { padding: 16, gap: 10 },
    emptyBox:       { alignItems: "center", paddingVertical: 60 },
    emptyTitle:     { fontSize: 18, fontWeight: "800", color: "#374151", marginBottom: 8 },
    emptySub:       { fontSize: 13, color: "#9ca3af", textAlign: "center", lineHeight: 20 },
    card:           { backgroundColor: "#fff", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#e5e7eb", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    cardOpen:       { borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
    cardEmoji:      { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    cardCategory:   { fontSize: 12, fontWeight: "800" },
    openDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: "#f59e0b" },
    cardMsg:        { fontSize: 13, color: "#374151", lineHeight: 18 },
    cardTime:       { fontSize: 10, color: "#9ca3af" },
    statusPill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusTxt:      { fontSize: 11, fontWeight: "700" },
});
import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    TouchableOpacity, Modal, Dimensions, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Bus, ChevronRight, X, MapPin, User,
    Navigation, Circle, Clock,
} from "lucide-react-native";
import { ref, onValue, get } from "firebase/database";
import { auth, db } from "../../services/firebase";
import { useDriverRevenue, DateFilter } from "../../hooks/useRevenue";

const { height: SCREEN_H } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface JeepInfo {
    id: string;
    driverName: string;
    plate: string;
    route: string;
    profilePic?: string;
}

interface JeepLive {
    uid: string;
    status: string;
    destination?: string;
    latitude?: number;
    longitude?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE PANEL  (reused pattern from drivers.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const REV_TABS: { k: DateFilter; l: string }[] = [
    { k: "today", l: "Today" }, { k: "week", l: "Week" },
    { k: "month", l: "Month" }, { k: "all",  l: "All"  },
];

function RevenuePanel({ driverId }: { driverId: string }) {
    const [filter, setFilter] = useState<DateFilter>("today");
    const { entries, stats, loading } = useDriverRevenue(driverId, filter);

    return (
        <View style={rp.wrap}>
            <View style={rp.tabs}>
                {REV_TABS.map(t => (
                    <TouchableOpacity
                        key={t.k}
                        onPress={() => setFilter(t.k)}
                        style={[rp.tab, filter === t.k && rp.tabA]}
                    >
                        <Text style={[rp.tabTxt, filter === t.k && rp.tabTxtA]}>{t.l}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <ActivityIndicator color="#15803d" style={{ marginVertical: 12 }} />
            ) : (
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

                    {entries.length === 0 ? (
                        <Text style={rp.empty}>No revenue recorded for this period.</Text>
                    ) : (
                        entries.slice(0, 10).map(e => (
                            <View key={e.id} style={rp.row}>
                                <View style={rp.rowDot} />
                                <View style={{ flex: 1 }}>
                                    <Text style={rp.rowRoute}>{e.route}</Text>
                                    <Text style={rp.rowMeta}>
                                        {e.passengerCount} pax ·{" "}
                                        {new Date(e.timestamp).toLocaleDateString("en-PH", {
                                            month: "short", day: "numeric",
                                            hour: "2-digit", minute: "2-digit",
                                        })}
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
                    )}
                </>
            )}
        </View>
    );
}

const rp = StyleSheet.create({
    wrap:     { marginTop: 4 },
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
// JEEP DETAIL SHEET
// ─────────────────────────────────────────────────────────────────────────────

type SheetTab = "info" | "revenue";

interface JeepDetailProps {
    visible: boolean;
    onClose: () => void;
    info: JeepInfo | null;
    live: JeepLive | null;
}

function JeepDetailSheet({ visible, onClose, info, live }: JeepDetailProps) {
    const [tab, setTab] = useState<SheetTab>("info");
    const isActive = live?.status === "available" || live?.status === "full";
    const isFull   = live?.status === "full";

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={[s.sheet, { height: SCREEN_H * 0.88 }]}>
                    <View style={s.handle} />

                    {info && (
                        <>
                            {/* ── Header ── */}
                            <View style={s.mHeader}>
                                {info.profilePic ? (
                                    <Image
                                        source={{ uri: info.profilePic }}
                                        style={s.profilePic}
                                    />
                                ) : (
                                    <View style={s.mAvatar}>
                                        <Text style={s.mAvatarTxt}>
                                            {info.driverName?.charAt(0)?.toUpperCase() ?? "D"}
                                        </Text>
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={s.mName}>{info.driverName}</Text>
                                    <Text style={s.mSub}>{info.plate} · {info.route}</Text>
                                </View>
                                <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                                    <X color="#6b7280" size={20} />
                                </TouchableOpacity>
                            </View>

                            {/* ── Live status strip ── */}
                            <View style={[
                                s.statusStrip,
                                { backgroundColor: isActive ? (isFull ? "#fef2f2" : "#f0fdf4") : "#f9fafb" }
                            ]}>
                                <Circle
                                    size={10}
                                    color={isActive ? (isFull ? "#ef4444" : "#15803d") : "#9ca3af"}
                                    fill={isActive ? (isFull ? "#ef4444" : "#15803d") : "#9ca3af"}
                                />
                                <Text style={[
                                    s.statusStripTxt,
                                    { color: isActive ? (isFull ? "#ef4444" : "#15803d") : "#6b7280" }
                                ]}>
                                    {isActive
                                        ? (isFull ? "Full — not accepting passengers" : `Active · Heading to ${live?.destination ?? "—"}`)
                                        : "Offline"
                                    }
                                </Text>
                            </View>

                            {/* ── Tab switcher ── */}
                            <View style={s.mainTabRow}>
                                <TouchableOpacity
                                    style={[s.mainTab, tab === "info" && s.mainTabActive]}
                                    onPress={() => setTab("info")}
                                >
                                    <Navigation size={14} color={tab === "info" ? "white" : "#6b7280"} />
                                    <Text style={[s.mainTabTxt, tab === "info" && s.mainTabTxtA]}>Jeep Info</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.mainTab, tab === "revenue" && s.mainTabActive]}
                                    onPress={() => setTab("revenue")}
                                >
                                    <Text style={{ fontSize: 14 }}>₱</Text>
                                    <Text style={[s.mainTabTxt, tab === "revenue" && s.mainTabTxtA]}>Revenue</Text>
                                </TouchableOpacity>
                            </View>

                            {/* ── INFO TAB ── */}
                            {tab === "info" && (
                                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                    <View style={s.infoRow}>
                                        <View style={[s.infoIcon, { backgroundColor: "#dbeafe" }]}>
                                            <Bus color="#2563eb" size={18} />
                                        </View>
                                        <View>
                                            <Text style={s.infoLbl}>Plate Number</Text>
                                            <Text style={s.infoVal}>{info.plate}</Text>
                                        </View>
                                    </View>

                                    <View style={s.infoRow}>
                                        <View style={[s.infoIcon, { backgroundColor: "#f0fdf4" }]}>
                                            <MapPin color="#15803d" size={18} />
                                        </View>
                                        <View>
                                            <Text style={s.infoLbl}>Route</Text>
                                            <Text style={s.infoVal}>{info.route}</Text>
                                        </View>
                                    </View>

                                    <View style={s.infoRow}>
                                        <View style={[s.infoIcon, { backgroundColor: "#fef3c7" }]}>
                                            <Navigation color="#d97706" size={18} />
                                        </View>
                                        <View>
                                            <Text style={s.infoLbl}>Heading To</Text>
                                            <Text style={s.infoVal}>
                                                {live?.destination ?? "Not on a trip"}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={s.infoRow}>
                                        <View style={[s.infoIcon, { backgroundColor: isActive ? "#f0fdf4" : "#f3f4f6" }]}>
                                            <Circle
                                                size={18}
                                                color={isActive ? "#15803d" : "#9ca3af"}
                                                fill={isActive ? "#15803d" : "#9ca3af"}
                                            />
                                        </View>
                                        <View>
                                            <Text style={s.infoLbl}>Status</Text>
                                            <Text style={[s.infoVal, {
                                                color: isFull ? "#ef4444" : isActive ? "#15803d" : "#6b7280"
                                            }]}>
                                                {isFull ? "Full" : isActive ? "Available" : "Offline"}
                                            </Text>
                                        </View>
                                    </View>

                                    {live?.latitude && live?.longitude && (
                                        <View style={s.infoRow}>
                                            <View style={[s.infoIcon, { backgroundColor: "#f0f9ff" }]}>
                                                <Clock color="#0284c7" size={18} />
                                            </View>
                                            <View>
                                                <Text style={s.infoLbl}>Last Known Location</Text>
                                                <Text style={s.infoVal}>
                                                    {live.latitude.toFixed(5)}, {live.longitude.toFixed(5)}
                                                </Text>
                                            </View>
                                        </View>
                                    )}

                                    <View style={{ height: 32 }} />
                                </ScrollView>
                            )}

                            {/* ── REVENUE TAB ── */}
                            {tab === "revenue" && (
                                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                    <RevenuePanel driverId={info.id} />
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
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function JeepInfoScreen() {
    const [jeepList, setJeepList]       = useState<JeepInfo[]>([]);
    const [liveData, setLiveData]       = useState<Record<string, JeepLive>>({});
    const [loading, setLoading]         = useState(true);
    const [selectedInfo, setSelectedInfo] = useState<JeepInfo | null>(null);
    const [selectedLive, setSelectedLive] = useState<JeepLive | null>(null);

    // Load static jeep info (driver name, plate, route, photo)
    useEffect(() => {
        const unsub = onValue(ref(db, "jeep_info"), snap => {
            if (snap.exists()) {
                const data = snap.val();
                setJeepList(
                    Object.entries(data).map(([id, v]: any) => ({ id, ...v }))
                );
            } else {
                setJeepList([]);
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Load live jeep positions/status
    useEffect(() => {
        const unsub = onValue(ref(db, "jeeps"), snap => {
            if (snap.exists()) {
                const data = snap.val();
                const map: Record<string, JeepLive> = {};
                Object.entries(data).forEach(([uid, v]: any) => {
                    map[uid] = { uid, ...v };
                });
                setLiveData(map);
            } else {
                setLiveData({});
            }
        });
        return () => unsub();
    }, []);

    const openJeep = (info: JeepInfo) => {
        setSelectedInfo(info);
        setSelectedLive(liveData[info.id] ?? null);
    };

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <Text style={s.title}>Jeepneys</Text>
                <Text style={s.sub}>{jeepList.length} registered jeeps</Text>
            </View>

            {loading ? (
                <ActivityIndicator color="#15803d" style={{ marginTop: 40 }} />
            ) : jeepList.length === 0 ? (
                <View style={s.emptyBox}>
                    <Bus color="#d1d5db" size={48} />
                    <Text style={s.emptyText}>No jeepneys registered yet.</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={s.list}>
                    {jeepList.map(jeep => {
                        const live     = liveData[jeep.id];
                        const isActive = live?.status === "available" || live?.status === "full";
                        const isFull   = live?.status === "full";

                        return (
                            <TouchableOpacity
                                key={jeep.id}
                                style={s.card}
                                onPress={() => openJeep(jeep)}
                                activeOpacity={0.75}
                            >
                                {/* Avatar / profile pic */}
                                {jeep.profilePic ? (
                                    <Image source={{ uri: jeep.profilePic }} style={s.cardAvatar} />
                                ) : (
                                    <View style={s.cardAvatarFallback}>
                                        <Text style={s.cardAvatarTxt}>
                                            {jeep.driverName?.charAt(0)?.toUpperCase() ?? "J"}
                                        </Text>
                                    </View>
                                )}

                                {/* Info */}
                                <View style={s.cardInfo}>
                                    <Text style={s.cardName}>{jeep.driverName}</Text>
                                    <Text style={s.cardSub}>{jeep.plate} · {jeep.route}</Text>
                                    {isActive && (
                                        <View style={s.cardDestRow}>
                                            <Navigation size={10} color="#15803d" />
                                            <Text style={s.cardDest}>To {live.destination}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Status badge + chevron */}
                                <View style={s.cardRight}>
                                    <View style={[
                                        s.statusBadge,
                                        { backgroundColor: isActive ? (isFull ? "#fef2f2" : "#dcfce7") : "#f3f4f6" }
                                    ]}>
                                        <Circle
                                            size={6}
                                            color={isActive ? (isFull ? "#ef4444" : "#15803d") : "#9ca3af"}
                                            fill={isActive ? (isFull ? "#ef4444" : "#15803d") : "#9ca3af"}
                                        />
                                        <Text style={[
                                            s.statusTxt,
                                            { color: isActive ? (isFull ? "#ef4444" : "#15803d") : "#6b7280" }
                                        ]}>
                                            {isFull ? "Full" : isActive ? "Active" : "Offline"}
                                        </Text>
                                    </View>
                                    <ChevronRight color="#9ca3af" size={18} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            {/* Detail sheet */}
            <JeepDetailSheet
                visible={!!selectedInfo}
                onClose={() => { setSelectedInfo(null); setSelectedLive(null); }}
                info={selectedInfo}
                live={selectedLive}
            />
        </SafeAreaView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f9fafb" },
    header:    { backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
    title:     { fontSize: 22, fontWeight: "900", color: "#15803d" },
    sub:       { fontSize: 12, color: "#6b7280", marginTop: 2 },
    list:      { padding: 16, gap: 10 },
    emptyBox:  { alignItems: "center", paddingVertical: 80, gap: 12 },
    emptyText: { color: "#9ca3af", fontWeight: "600", fontSize: 15 },

    card:              { backgroundColor: "#fff", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    cardAvatar:        { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
    cardAvatarFallback:{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center", marginRight: 12 },
    cardAvatarTxt:     { fontSize: 20, fontWeight: "800", color: "#15803d" },
    cardInfo:          { flex: 1 },
    cardName:          { fontSize: 15, fontWeight: "700", color: "#111827" },
    cardSub:           { fontSize: 12, color: "#6b7280", marginTop: 2 },
    cardDestRow:       { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    cardDest:          { fontSize: 11, color: "#15803d", fontWeight: "600" },
    cardRight:         { alignItems: "flex-end", gap: 8 },
    statusBadge:       { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    statusTxt:         { fontSize: 11, fontWeight: "700" },

    // Sheet
    overlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet:      { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
    handle:     { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 16 },
    closeBtn:   { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },

    mHeader:    { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
    profilePic: { width: 52, height: 52, borderRadius: 26, marginRight: 0 },
    mAvatar:    { width: 52, height: 52, borderRadius: 26, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
    mAvatarTxt: { fontSize: 22, fontWeight: "800", color: "#15803d" },
    mName:      { fontSize: 18, fontWeight: "800", color: "#111827" },
    mSub:       { fontSize: 12, color: "#6b7280", marginTop: 2 },

    statusStrip:    { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, marginBottom: 14 },
    statusStripTxt: { fontSize: 13, fontWeight: "700" },

    mainTabRow:   { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 14, padding: 4, marginBottom: 14, gap: 4 },
    mainTab:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 11, gap: 6 },
    mainTabActive:{ backgroundColor: "#15803d" },
    mainTabTxt:   { fontSize: 13, fontWeight: "700", color: "#6b7280" },
    mainTabTxtA:  { color: "white" },

    infoRow:  { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
    infoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    infoLbl:  { fontSize: 11, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase" },
    infoVal:  { fontSize: 15, fontWeight: "700", color: "#111827", marginTop: 2 },
});
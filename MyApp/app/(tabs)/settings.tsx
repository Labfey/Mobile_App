import React, { useState } from "react";
import {
    View, Text, Switch, TouchableOpacity, ScrollView,
    StyleSheet, Modal, TextInput, Alert, ActivityIndicator,
    Platform, KeyboardAvoidingView, Dimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeContext";
import {
    Moon, Sun, HelpCircle, AlertTriangle, ChevronRight,
    ChevronDown, ChevronUp, X, Zap, Info, Shield, Bus
} from "lucide-react-native";
import { db, ref, update, auth } from "../../services/firebase";
import { push } from "firebase/database";

const { height: SCREEN_H } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// DATA CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const FAQS = [
    {
        q: "How do I track a jeepney in real time?",
        a: "Open the Map tab. Green jeep icons show active jeeps on the route. Tap any jeep to see its destination, status (available/full), and ETA to your location.",
    },
    {
        q: "What do the route colors mean?",
        a: "When you tap a jeep, the route line changes color by zone — green (nearest), yellow, orange, and red (farthest). This shows how far the jeep still has to travel.",
    },
    {
        q: "How do I request a ride?",
        a: "On the Map tab, tap the 'Request a Ride' button at the bottom. Choose your destination (Town or Balacbac). Drivers heading your way will see a marker at your location.",
    },
    {
        q: "How is the fare calculated?",
        a: "Fare is based on zones. Town↔Shell is ₱13, Town↔Junction is ₱15, Town↔Centro is ₱17, and full route (Town↔Balacbac) is ₱20.",
    },
];

const REPORT_CATEGORIES = [
    { key: "map",      label: "Map / GPS issue",       emoji: "🗺️" },
    { key: "driver",   label: "Driver behaviour",      emoji: "🚌" },
    { key: "app",      label: "App bug / crash",       emoji: "📱" },
    { key: "fare",     label: "Wrong fare displayed",  emoji: "💰" },
    { key: "other",    label: "Other",                 emoji: "💬" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FAQItem({ q, a, dark }: { q: string; a: string; dark: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <View style={[faq.item, { backgroundColor: dark ? "#1e293b" : "#f8fafc", borderColor: dark ? "#334155" : "#e2e8f0" }]}>
            <TouchableOpacity style={faq.row} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
                <Text style={[faq.q, { color: dark ? "#f1f5f9" : "#0f172a", flex: 1 }]}>{q}</Text>
                {open ? <ChevronUp color="#15803d" size={18} /> : <ChevronDown color="#94a3b8" size={18} />}
            </TouchableOpacity>
            {open && (
                <View style={[faq.answerBox, { borderTopColor: dark ? "#334155" : "#e2e8f0" }]}>
                    <Text style={[faq.a, { color: dark ? "#94a3b8" : "#475569" }]}>{a}</Text>
                </View>
            )}
        </View>
    );
}

function SettingsRow({ icon, label, sub, onPress, right, dark, accent }: any) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={onPress ? 0.7 : 1}
            style={[row.wrap, { borderBottomColor: dark ? "#1e293b" : "#f1f5f9" }]}
        >
            <View style={[row.iconBox, { backgroundColor: accent ? `${accent}18` : (dark ? "#1e293b" : "#f1f5f9") }]}>
                {icon}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[row.label, { color: dark ? "#f1f5f9" : "#0f172a" }]}>{label}</Text>
                {sub && <Text style={[row.sub, { color: dark ? "#64748b" : "#94a3b8" }]}>{sub}</Text>}
            </View>
            {right ?? (onPress && <ChevronRight color={dark ? "#475569" : "#cbd5e1"} size={18} />)}
        </TouchableOpacity>
    );
}

function SectionCard({ title, children, dark }: { title: string; children: React.ReactNode; dark: boolean }) {
    return (
        <View style={{ marginBottom: 20 }}>
            <Text style={[sec.title, { color: dark ? "#475569" : "#94a3b8" }]}>{title}</Text>
            <View style={[sec.card, { backgroundColor: dark ? "#0f172a" : "#fff", borderColor: dark ? "#1e293b" : "#f1f5f9" }]}>
                {children}
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────────────────────

function AboutModal({ visible, onClose, dark }: { visible: boolean; onClose: () => void; dark: boolean }) {
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={m.overlay}>
                <View style={[m.sheet, { backgroundColor: dark ? "#0f172a" : "#fff", height: SCREEN_H * 0.82 }]}>
                    <View style={[m.handle, { backgroundColor: dark ? "#334155" : "#e5e7eb" }]} />
                    <View style={m.headerRow}>
                        <View style={[m.headerIcon, { backgroundColor: dark ? "#1e3a2f" : "#f0fdf4" }]}>
                            <Bus color="#15803d" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[m.headerTitle, { color: dark ? "#f1f5f9" : "#111827" }]}>About JeepRoute</Text>
                            <Text style={[m.headerSub, { color: dark ? "#64748b" : "#6b7280" }]}>Version 1.0.0</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={m.closeBtn}>
                            <X color="#94a3b8" size={20} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                        {/* Mission */}
                        <View style={m.section}>
                            <Text style={[m.sectionTitle, { color: dark ? "#f1f5f9" : "#111827" }]}>Our Mission</Text>
                            <Text style={[m.body, { color: dark ? "#94a3b8" : "#374151" }]}>
                                JeepRoute exists to make daily commuting in Balacbac easier, safer,
                                and more dignified for everyone.
                            </Text>
                            <Text style={[m.body, { color: dark ? "#94a3b8" : "#374151" }]}>
                                We believe that knowing when your ride is coming — and whether it
                                has space for you — is a basic need, not a luxury.
                            </Text>
                        </View>

                        {/* What we do */}
                        <View style={m.section}>
                            <Text style={[m.sectionTitle, { color: dark ? "#f1f5f9" : "#111827" }]}>What JeepRoute Does</Text>
                            {[
                                ["🗺️", "Live map", "See every active jeepney in real time so you know exactly when one is coming."],
                                ["🙋", "Ride requests", "Signal to nearby drivers that you need a ride — no phone call needed."],
                                ["💰", "Fare calculator", "Know your fare before you board. Regular and discounted rates."],
                                ["🚦", "Status updates", "Drivers mark themselves Available or Full."],
                            ].map(([emoji, title, desc]) => (
                                <View key={title} style={m.featureRow}>
                                    <Text style={m.featureEmoji}>{emoji}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[m.featureTitle, { color: dark ? "#f1f5f9" : "#111827" }]}>{title}</Text>
                                        <Text style={[m.featureDesc, { color: dark ? "#64748b" : "#6b7280" }]}>{desc}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        {/* Built with */}
                        <View style={[m.section, { marginBottom: 32 }]}>
                            <Text style={[m.body, { color: "#9ca3af", fontSize: 12 }]}>
                                © 2025 JeepRoute · Balacbac Transit · All rights reserved.
                            </Text>
                        </View> 
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function HelpModal({ visible, onClose, dark }: any) {
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={m.overlay}>
                <View style={[m.sheet, { backgroundColor: dark ? "#0f172a" : "#fff" }]}>
                    <View style={[m.handle, { backgroundColor: dark ? "#334155" : "#e2e8f0" }]} />
                    <View style={m.headerRow}>
                        <View style={[m.headerIcon, { backgroundColor: dark ? "#1e3a2f" : "#dcfce7" }]}><HelpCircle color="#15803d" size={22} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={[m.headerTitle, { color: dark ? "#f1f5f9" : "#0f172a" }]}>Help Center</Text>
                            <Text style={[m.headerSub, { color: dark ? "#64748b" : "#94a3b8" }]}>Frequently asked questions</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={m.closeBtn}><X color="#94a3b8" size={20} /></TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
                        {FAQS.map((item, i) => <FAQItem key={i} q={item.q} a={item.a} dark={dark} />)}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function ReportModal({ visible, onClose, dark }: any) {
    const [category, setCategory] = useState("");
    const [message, setMessage]   = useState("");
    const [sending, setSending]   = useState(false);

    const handleSend = async () => {
        if (!category || message.trim().length < 10) {
            Alert.alert("Details required", "Please select a category and provide at least 10 characters.");
            return;
        }
        setSending(true);
        try {
            const reportRef = push(ref(db, "reports"));
            await update(reportRef, {
                category,
                message: message.trim(),
                userId: auth.currentUser?.uid ?? "guest",
                userEmail: auth.currentUser?.email ?? "guest",
                status: "open",
                timestamp: Date.now(),
            });
            Alert.alert("✅ Sent", "Feedback received. Thank you!");
            onClose();
        } catch {
            Alert.alert("Error", "Check your connection.");
        } finally { setSending(false); }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={m.overlay}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[m.sheet, { backgroundColor: dark ? "#0f172a" : "#fff" }]}>
                    <View style={[m.handle, { backgroundColor: dark ? "#334155" : "#e2e8f0" }]} />
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={m.headerRow}>
                            <View style={[m.headerIcon, { backgroundColor: "#fee2e2" }]}><AlertTriangle color="#ef4444" size={22} /></View>
                            <Text style={[m.headerTitle, { color: dark ? "#f1f5f9" : "#0f172a" }]}>Report a Problem</Text>
                            <TouchableOpacity onPress={onClose}><X color="#94a3b8" size={20} /></TouchableOpacity>
                        </View>
                        {REPORT_CATEGORIES.map(c => (
                            <TouchableOpacity key={c.key} onPress={() => setCategory(c.key)} style={[m.categoryChip, { backgroundColor: dark ? "#1e293b" : "#f8fafc" }, category === c.key && { borderColor: "#15803d" }]}>
                                <Text>{c.emoji} {c.label}</Text>
                            </TouchableOpacity>
                        ))}
                        <TextInput
                            style={[m.textArea, { backgroundColor: dark ? "#1e293b" : "#f8fafc", color: dark ? "#f1f5f9" : "#0f172a" }]}
                            placeholder="Describe the issue..."
                            multiline
                            onChangeText={setMessage}
                        />
                        <TouchableOpacity style={m.sendBtn} onPress={handleSend} disabled={sending}>
                            {sending ? <ActivityIndicator color="#fff" /> : <Text style={m.sendBtnTxt}>Send Report</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function Settings() {
    const { darkMode, setDarkMode } = useTheme();
    const [helpVisible, setHelpVisible] = useState(false);
    const [reportVisible, setReportVisible] = useState(false);
    const [aboutVisible, setAboutVisible]   = useState(false);

    return (
        <SafeAreaView style={[s.container, { backgroundColor: darkMode ? "#0a0f1a" : "#f1f5f9" }]}>
            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.pageHeader}>
                    <View>
                        <Text style={[s.pageTitle, { color: darkMode ? "#f1f5f9" : "#0f172a" }]}>Settings</Text>
                        <Text style={[s.pageSub, { color: darkMode ? "#475569" : "#94a3b8" }]}>JeepRoute preferences</Text>
                    </View>
                    <View style={[s.versionPill, { backgroundColor: darkMode ? "#1e293b" : "#fff" }]}>
                        <Zap color="#15803d" size={12} />
                        <Text style={[s.versionTxt, { color: darkMode ? "#94a3b8" : "#64748b" }]}>v1.0.0</Text>
                    </View>
                </View>

                <SectionCard title="APPEARANCE" dark={darkMode}>
                    <SettingsRow
                        icon={darkMode ? <Moon color="#818cf8" size={20} /> : <Sun color="#f59e0b" size={20} />}
                        label="Dark Mode"
                        sub={darkMode ? "Currently dark" : "Currently light"}
                        dark={darkMode}
                        accent={darkMode ? "#818cf8" : "#f59e0b"}
                        right={<Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ false: "#e2e8f0", true: "#15803d" }} />}
                    />
                </SectionCard>

                <SectionCard title="SUPPORT" dark={darkMode}>
                    <SettingsRow icon={<HelpCircle color="#2563eb" size={20} />} label="Help Center" sub="FAQs" onPress={() => setHelpVisible(true)} dark={darkMode} accent="#2563eb" />
                    <SettingsRow icon={<AlertTriangle color="#ef4444" size={20} />} label="Report a Problem" sub="Send feedback" onPress={() => setReportVisible(true)} dark={darkMode} accent="#ef4444" />
                </SectionCard>

                <SectionCard title="ABOUT" dark={darkMode}>
                    <SettingsRow icon={<Shield color="#7c3aed" size={20} />} label="Privacy" sub="Data usage policy" dark={darkMode} accent="#7c3aed" />
                    <SettingsRow icon={<Info color="#0891b2" size={20} />} label="About JeepRoute" sub="Mission and Features" onPress={() => setAboutVisible(true)} dark={darkMode} accent="#0891b2" />
                </SectionCard>

                <View style={s.footer}>
                    <Text style={[s.footerTxt, { color: darkMode ? "#475569" : "#94a3b8" }]}>🚌 JeepRoute · Baguio City</Text>
                </View>
            </ScrollView>

            <HelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} dark={darkMode} />
            <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} dark={darkMode} />
            <AboutModal visible={aboutVisible} onClose={() => setAboutVisible(false)} dark={darkMode} />
        </SafeAreaView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: 20, paddingBottom: 48 },
    pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
    pageTitle: { fontSize: 32, fontWeight: "900" },
    pageSub: { fontSize: 13 },
    versionPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
    versionTxt: { fontSize: 12, fontWeight: "700" },
    footer: { alignItems: "center", marginTop: 20 },
    footerTxt: { fontSize: 12, fontWeight: "600" },
});

const faq = StyleSheet.create({
    item: { borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", padding: 16, gap: 10 },
    q: { fontSize: 14, fontWeight: "700" },
    answerBox: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1 },
    a: { fontSize: 13, lineHeight: 20, marginTop: 12 },
});

const row = StyleSheet.create({
    wrap: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14, borderBottomWidth: 1 },
    iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    label: { fontSize: 15, fontWeight: "700" },
    sub: { fontSize: 12, marginTop: 2 },
});

const sec = StyleSheet.create({
    title: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4 },
    card: { borderRadius: 18, paddingHorizontal: 16, borderWidth: 1 },
});

const m = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: "90%" },
    handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 20 },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
    headerIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    headerSub: { fontSize: 12 },
    closeBtn: { padding: 8 },
    categoryChip: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
    textArea: { borderRadius: 12, borderWidth: 1, padding: 12, minHeight: 100, marginTop: 10, textAlignVertical: "top" },
    sendBtn: { backgroundColor: "#15803d", padding: 16, borderRadius: 12, marginTop: 20, alignItems: "center" },
    sendBtnTxt: { color: "#fff", fontWeight: "800" },

    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 },
    body: { fontSize: 14, lineHeight: 22, marginBottom: 10 },
    featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
    featureEmoji: { fontSize: 24, width: 32 },
    featureTitle: { fontSize: 14, fontWeight: "700" },
    featureDesc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
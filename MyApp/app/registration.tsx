import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    TouchableOpacity, Alert, Modal, Image, Dimensions, TextInput
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    CheckCircle, XCircle, Eye, FileText, Clock, User,
    CreditCard, X, UserPlus, Lock, Mail, Building2,
} from "lucide-react-native";
import { db, ref, onValue, update } from "../services/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import { set } from "firebase/database";

const { width, height } = Dimensions.get("window");

type RegStatus = "pending" | "approved" | "rejected";

// ▼ NEW: operatorName field added
interface Registration {
    uid: string;
    fullName: string;
    email: string;
    licenseNumber: string;
    licenseImage: string;
    idImage: string;
    operatorName?: string;   // ▼ NEW
    status: RegStatus;
    submittedAt: number;
}

function timeAgo(ts: number) {
    const d = Date.now() - ts, m = Math.floor(d/60000), h = Math.floor(d/3600000), dy = Math.floor(d/86400000);
    if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`; return `${dy}d ago`;
}

const STATUS_CFG = {
    pending:  { label: "Pending",  color: "#d97706", bg: "#fef3c7", dot: "#f59e0b" },
    approved: { label: "Approved", color: "#15803d", bg: "#dcfce7", dot: "#22c55e" },
    rejected: { label: "Rejected", color: "#dc2626", bg: "#fee2e2", dot: "#ef4444" },
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE DRIVER MODAL (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function CreateDriverModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const [name, setName]         = useState("");
    const [email, setEmail]       = useState("");
    const [password, setPassword] = useState("");
    const [plate, setPlate]       = useState("");
    const [opName, setOpName]     = useState(""); // ▼ NEW
    const [loading, setLoading]   = useState(false);

    const handleCreate = async () => {
        if (!name.trim() || !email.trim() || !password || !plate.trim() || !opName.trim()) {
            Alert.alert("Missing Fields", "Please fill in all fields."); return;
        }
        if (password.length < 6) { Alert.alert("Weak Password", "Password must be at least 6 characters."); return; }
        setLoading(true);
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            const uid  = cred.user.uid;
            await set(ref(db, `users/${uid}`), {
                username: name, email, role: "driver",
                operatorName: opName.trim(), // ▼ NEW
                createdAt: Date.now(), createdByAdmin: true,
            });
            await set(ref(db, `jeep_info/${uid}`), {
                driverName: name, plate: plate.toUpperCase(),
                route: "Balacbac To Town",
                operatorName: opName.trim(), // ▼ NEW
                updatedAt: Date.now(),
            });
            Alert.alert("✅ Driver Created", `${name} has been registered as a driver and can now log in.`);
            setName(""); setEmail(""); setPassword(""); setPlate(""); setOpName("");
            onClose();
        } catch (err: any) {
            if (err.code === "auth/email-already-in-use") Alert.alert("Email Taken", "This email is already registered.");
            else Alert.alert("Error", err.message ?? "Something went wrong.");
        } finally { setLoading(false); }
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={cs.overlay}>
                <View style={cs.sheet}>
                    <View style={cs.handle} />
                    <View style={cs.hdr}>
                        <View style={cs.hdrIcon}><UserPlus color="#15803d" size={22} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={cs.hdrTitle}>Create Driver Account</Text>
                            <Text style={cs.hdrSub}>Admin-created — instant access</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={cs.closeBtn}><X color="#6b7280" size={20} /></TouchableOpacity>
                    </View>

                    {[
                        { label: "Full Name",        icon: <User color="#9ca3af" size={15} />,       value: name,     onChange: setName,     cap: "words" as any,       placeholder: "e.g. Juan dela Cruz" },
                        { label: "Email",            icon: <Mail color="#9ca3af" size={15} />,       value: email,    onChange: setEmail,    cap: "none" as any,        kb: "email-address" as any, placeholder: "driver@email.com" },
                        { label: "Password",         icon: <Lock color="#9ca3af" size={15} />,       value: password, onChange: setPassword, secure: true,              placeholder: "At least 6 characters" },
                        { label: "Plate Number",     icon: <FileText color="#9ca3af" size={15} />,  value: plate,    onChange: setPlate,    cap: "characters" as any,  placeholder: "e.g. ABC 1234" },
                        // ▼ NEW field
                        { label: "Operator Name",    icon: <Building2 color="#9ca3af" size={15} />, value: opName,   onChange: setOpName,   cap: "words" as any,       placeholder: "e.g. Juan Dela Cruz Transport" },
                    ].map((f, i) => (
                        <View key={i} style={cs.field}>
                            <Text style={cs.fieldLbl}>{f.label}</Text>
                            <View style={cs.fieldInput}>
                                {f.icon}
                                <TextInput
                                    value={f.value} onChangeText={f.onChange}
                                    placeholder={f.placeholder} placeholderTextColor="#d1d5db"
                                    style={cs.fieldTxt} secureTextEntry={f.secure}
                                    autoCapitalize={f.cap ?? "sentences"}
                                    keyboardType={f.kb ?? "default"}
                                />
                            </View>
                        </View>
                    ))}

                    <TouchableOpacity style={[cs.createBtn, loading && { opacity: 0.6 }]} onPress={handleCreate} disabled={loading} activeOpacity={0.85}>
                        {loading ? <ActivityIndicator color="white" /> : <><UserPlus color="white" size={18} /><Text style={cs.createBtnTxt}>Create Driver Account</Text></>}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const cs = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    sheet:   { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
    handle:  { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
    hdr:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
    hdrIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
    hdrTitle:{ fontSize: 17, fontWeight: "800", color: "#111827" },
    hdrSub:  { fontSize: 12, color: "#6b7280", marginTop: 2 },
    closeBtn:{ padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },
    field:   { marginBottom: 14 },
    fieldLbl:{ fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 },
    fieldInput:{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f9fafb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#e5e7eb" },
    fieldTxt:{ flex: 1, fontSize: 15, color: "#111827" },
    createBtn:{ backgroundColor: "#15803d", borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
    createBtnTxt:{ color: "white", fontWeight: "800", fontSize: 15 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminRegistrations() {
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [loading, setLoading]             = useState(true);
    const [selected, setSelected]           = useState<Registration | null>(null);
    const [imagePreview, setImagePreview]   = useState<string | null>(null);
    const [activeFilter, setActiveFilter]   = useState<RegStatus | "all">("pending");
    const [processing, setProcessing]       = useState<string | null>(null);
    const [createModalVisible, setCreateModalVisible] = useState(false);

    useEffect(() => {
        const unsub = onValue(ref(db, "pending_registrations"), (snap) => {
            if (!snap.exists()) { setRegistrations([]); setLoading(false); return; }
            const data = snap.val() as Record<string, Omit<Registration, "uid">>;
            setRegistrations(
                Object.entries(data)
                    .map(([uid, v]) => ({ uid, ...v } as Registration))
                    .sort((a, b) => b.submittedAt - a.submittedAt)
            );
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // ▼ NEW: handleApprove now also writes operatorName to users + jeep_info
    const handleApprove = (reg: Registration) => {
        Alert.alert("Approve Driver", `Confirm approval for ${reg.fullName}?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Approve",
                onPress: async () => {
                    setProcessing(reg.uid);
                    try {
                        // Update role
                        await update(ref(db, `users/${reg.uid}`), {
                            role: "driver",
                            operatorName: reg.operatorName ?? "", // ▼ NEW
                        });

                        // Mark registration approved
                        await update(ref(db, `pending_registrations/${reg.uid}`), {
                            status: "approved",
                            reviewedAt: Date.now(),
                        });

                        // ▼ NEW: write operatorName into jeep_info (create stub if not exists)
                        await update(ref(db, `jeep_info/${reg.uid}`), {
                            driverName:   reg.fullName,
                            operatorName: reg.operatorName ?? "",
                            route:        "Balacbac To Town",
                        });

                        setSelected(null);
                        Alert.alert("✅ Approved!", `${reg.fullName} is now a verified driver.`);
                    } catch {
                        Alert.alert("Error", "Could not approve.");
                    } finally {
                        setProcessing(null);
                    }
                },
            },
        ]);
    };

    const handleReject = (reg: Registration) => {
        Alert.alert("Reject Application", `Reject ${reg.fullName}'s application?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Reject", style: "destructive",
                onPress: async () => {
                    setProcessing(reg.uid);
                    try {
                        await update(ref(db, `users/${reg.uid}`), { role: "rejected_driver" });
                        await update(ref(db, `pending_registrations/${reg.uid}`), { status: "rejected", reviewedAt: Date.now() });
                        setSelected(null);
                    } catch {
                        Alert.alert("Error", "Could not reject.");
                    } finally {
                        setProcessing(null);
                    }
                },
            },
        ]);
    };

    const filtered = activeFilter === "all" ? registrations : registrations.filter(r => r.status === activeFilter);
    const counts = {
        pending:  registrations.filter(r => r.status === "pending").length,
        approved: registrations.filter(r => r.status === "approved").length,
        rejected: registrations.filter(r => r.status === "rejected").length,
    };

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <View>
                    <Text style={s.title}>Applications</Text>
                    <Text style={s.sub}>{counts.pending} pending review</Text>
                </View>
                <TouchableOpacity style={s.createBtn} onPress={() => setCreateModalVisible(true)} activeOpacity={0.8}>
                    <UserPlus color="white" size={16} />
                    <Text style={s.createBtnTxt}>Create Driver</Text>
                </TouchableOpacity>
            </View>

            {/* Status filter row */}
            <View style={s.statRow}>
                {(["pending", "approved", "rejected"] as RegStatus[]).map(status => {
                    const cfg = STATUS_CFG[status];
                    return (
                        <TouchableOpacity
                            key={status}
                            style={[s.statCard, { backgroundColor: cfg.bg }, activeFilter === status && s.statCardActive]}
                            onPress={() => setActiveFilter(activeFilter === status ? "all" : status)}
                        >
                            <View style={[s.statDot, { backgroundColor: cfg.dot }]} />
                            <Text style={[s.statCount, { color: cfg.color }]}>{counts[status]}</Text>
                            <Text style={[s.statLabel, { color: cfg.color }]}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? <ActivityIndicator color="#15803d" style={{ marginTop: 40 }} /> : (
                <ScrollView contentContainerStyle={s.list}>
                    {filtered.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
                            <Text style={s.emptyText}>No {activeFilter === "all" ? "" : activeFilter} applications.</Text>
                        </View>
                    ) : filtered.map(reg => {
                        const cfg = STATUS_CFG[reg.status];
                        return (
                            <TouchableOpacity key={reg.uid} style={s.card} onPress={() => setSelected(reg)} activeOpacity={0.75}>
                                <View style={s.avatar}>
                                    <Text style={s.avatarText}>{reg.fullName?.charAt(0)?.toUpperCase() ?? "D"}</Text>
                                </View>
                                <View style={s.cardInfo}>
                                    <Text style={s.cardName}>{reg.fullName}</Text>
                                    <Text style={s.cardEmail}>{reg.email}</Text>
                                    {/* ▼ NEW: show operator name on the card */}
                                    {!!reg.operatorName && (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                                            <Building2 size={10} color="#6b7280" />
                                            <Text style={{ fontSize: 11, color: "#6b7280" }}>{reg.operatorName}</Text>
                                        </View>
                                    )}
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                                        <Clock size={10} color="#9ca3af" />
                                        <Text style={{ fontSize: 10, color: "#9ca3af" }}>{timeAgo(reg.submittedAt)}</Text>
                                    </View>
                                </View>
                                <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                                    <View style={[s.statusDot, { backgroundColor: cfg.dot }]} />
                                    <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            {/* ── Detail modal ── */}
            <Modal visible={!!selected} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={[s.modalSheet, { height: height * 0.90 }]}>
                        <View style={s.sheetHandle} />
                        {selected && (
                            <>
                                <View style={s.mHdr}>
                                    <View style={s.mAvatar}>
                                        <Text style={s.mAvatarTxt}>{selected.fullName?.charAt(0)?.toUpperCase()}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.mName}>{selected.fullName}</Text>
                                        <Text style={s.mEmail}>{selected.email}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                                        <X color="#6b7280" size={20} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false}>
                                    {/* License number */}
                                    <View style={s.infoRow}>
                                        <View style={[s.infoIcon, { backgroundColor: "#dbeafe" }]}>
                                            <CreditCard color="#3b82f6" size={18} />
                                        </View>
                                        <View>
                                            <Text style={s.infoLbl}>License Number</Text>
                                            <Text style={s.infoVal}>{selected.licenseNumber}</Text>
                                        </View>
                                    </View>

                                    {/* ▼ NEW: Operator info row */}
                                    <View style={s.infoRow}>
                                        <View style={[s.infoIcon, { backgroundColor: "#eff6ff" }]}>
                                            <Building2 color="#2563eb" size={18} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.infoLbl}>Operator / Franchise</Text>
                                            <Text style={s.infoVal}>
                                                {selected.operatorName || "Not provided"}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Submitted date */}
                                    <View style={s.infoRow}>
                                        <View style={[s.infoIcon, { backgroundColor: "#f0fdf4" }]}>
                                            <Clock color="#15803d" size={18} />
                                        </View>
                                        <View>
                                            <Text style={s.infoLbl}>Submitted</Text>
                                            <Text style={s.infoVal}>
                                                {new Date(selected.submittedAt).toLocaleDateString("en-PH", {
                                                    year: "numeric", month: "long", day: "numeric",
                                                })}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Documents */}
                                    <Text style={s.docSec}>Submitted Documents</Text>
                                    <View style={s.docsRow}>
                                        {[
                                            { uri: selected.licenseImage, label: "Driver's License" },
                                            { uri: selected.idImage,      label: "Government ID" },
                                        ].map((doc, i) => (
                                            <TouchableOpacity key={i} style={s.docBox} onPress={() => setImagePreview(doc.uri)}>
                                                <Image source={{ uri: doc.uri }} style={s.docThumb} />
                                                <View style={s.docLbl}>
                                                    <FileText color="#3b82f6" size={12} />
                                                    <Text style={s.docLblTxt}>{doc.label}</Text>
                                                </View>
                                                <View style={s.viewOverlay}><Eye color="white" size={16} /></View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Actions */}
                                    {selected.status === "pending" && (
                                        <View style={s.actionRow}>
                                            <TouchableOpacity style={s.rejectBtn} onPress={() => handleReject(selected)} disabled={!!processing}>
                                                <XCircle color="#dc2626" size={20} />
                                                <Text style={s.rejectTxt}>Reject</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(selected)} disabled={!!processing}>
                                                {processing === selected.uid
                                                    ? <ActivityIndicator color="white" />
                                                    : <><CheckCircle color="white" size={20} /><Text style={s.approveTxt}>Approve</Text></>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    {selected.status !== "pending" && (
                                        <View style={[s.statusResult, { backgroundColor: STATUS_CFG[selected.status].bg }]}>
                                            {selected.status === "approved"
                                                ? <CheckCircle color="#15803d" size={20} />
                                                : <XCircle color="#dc2626" size={20} />
                                            }
                                            <Text style={[s.statusResultTxt, { color: STATUS_CFG[selected.status].color }]}>
                                                This application has been {selected.status}.
                                            </Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Image preview */}
            <Modal visible={!!imagePreview} transparent animationType="fade">
                <View style={s.imgOverlay}>
                    <TouchableOpacity style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setImagePreview(null)} />
                    {imagePreview && <Image source={{ uri: imagePreview }} style={s.imgFull} resizeMode="contain" />}
                    <TouchableOpacity style={s.imgClose} onPress={() => setImagePreview(null)}>
                        <X color="white" size={24} />
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Create driver modal */}
            <CreateDriverModal visible={createModalVisible} onClose={() => setCreateModalVisible(false)} />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container:  { flex: 1, backgroundColor: "#f9fafb" },
    header:     { backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title:      { fontSize: 22, fontWeight: "900", color: "#15803d" },
    sub:        { fontSize: 12, color: "#6b7280", marginTop: 2 },
    createBtn:  { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#15803d", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    createBtnTxt: { color: "white", fontWeight: "700", fontSize: 13 },

    statRow:      { flexDirection: "row", padding: 16, gap: 10 },
    statCard:     { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", gap: 4, borderWidth: 2, borderColor: "transparent" },
    statCardActive:{ borderColor: "#15803d" },
    statDot:      { width: 8, height: 8, borderRadius: 4 },
    statCount:    { fontSize: 22, fontWeight: "900" },
    statLabel:    { fontSize: 11, fontWeight: "700" },

    list:      { padding: 16, gap: 10 },
    emptyBox:  { alignItems: "center", paddingVertical: 60 },
    emptyText: { color: "#9ca3af", fontWeight: "600", fontSize: 15 },

    card:       { backgroundColor: "#fff", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#e5e7eb", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    avatar:     { width: 46, height: 46, borderRadius: 23, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 20, fontWeight: "800", color: "#15803d" },
    cardInfo:   { flex: 1 },
    cardName:   { fontSize: 15, fontWeight: "700", color: "#111827" },
    cardEmail:  { fontSize: 12, color: "#6b7280", marginTop: 1 },
    statusBadge:{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    statusDot:  { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: "700" },

    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modalSheet:   { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
    sheetHandle:  { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
    mHdr:         { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
    mAvatar:      { width: 56, height: 56, borderRadius: 28, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
    mAvatarTxt:   { fontSize: 24, fontWeight: "800", color: "#15803d" },
    mName:        { fontSize: 20, fontWeight: "800", color: "#111827" },
    mEmail:       { fontSize: 13, color: "#6b7280", marginTop: 2 },
    closeBtn:     { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },

    infoRow:  { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
    infoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    infoLbl:  { fontSize: 11, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase" },
    infoVal:  { fontSize: 15, fontWeight: "700", color: "#111827", marginTop: 2 },

    docSec:   { fontSize: 14, fontWeight: "800", color: "#111827", marginTop: 20, marginBottom: 12 },
    docsRow:  { flexDirection: "row", gap: 12, marginBottom: 24 },
    docBox:   { flex: 1, height: 130, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#e5e7eb" },
    docThumb: { width: "100%", height: "100%", resizeMode: "cover" },
    docLbl:   { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(255,255,255,.92)", paddingVertical: 6, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
    docLblTxt:{ fontSize: 10, fontWeight: "700", color: "#374151" },
    viewOverlay:{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,.4)", borderRadius: 8, padding: 6 },

    actionRow:  { flexDirection: "row", gap: 12 },
    rejectBtn:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#fee2e2", borderRadius: 14, paddingVertical: 16 },
    rejectTxt:  { color: "#dc2626", fontWeight: "700", fontSize: 15 },
    approveBtn: { flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#15803d", borderRadius: 14, paddingVertical: 16 },
    approveTxt: { color: "white", fontWeight: "700", fontSize: 15 },

    statusResult:   { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 16 },
    statusResultTxt:{ fontSize: 14, fontWeight: "700" },

    imgOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.92)", alignItems: "center", justifyContent: "center" },
    imgFull:    { width: width - 32, height: height * 0.65 },
    imgClose:   { position: "absolute", top: 52, right: 20, backgroundColor: "rgba(255,255,255,.15)", borderRadius: 20, padding: 10 },
});
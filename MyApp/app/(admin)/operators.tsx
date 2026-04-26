import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    TouchableOpacity, Modal, TextInput, Alert, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Building2, Plus, X, ChevronRight, Phone,
    MapPin, CheckCircle, XCircle, Users, Edit3, Trash2,
} from "lucide-react-native";
import { db, ref, onValue, update, remove } from "../../services/firebase";
import { push } from "firebase/database";

const { height } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type OperatorStatus = "active" | "inactive";

interface Operator {
    id: string;
    name: string;
    contactNumber: string;
    address: string;
    status: OperatorStatus;
    createdAt: number;
}

interface Driver {
    uid: string;
    username: string;
    email: string;
    operatorId?: string;
    operatorName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD / EDIT OPERATOR MODAL
// ─────────────────────────────────────────────────────────────────────────────

function OperatorFormModal({
    visible, onClose, editingOperator,
}: {
    visible: boolean;
    onClose: () => void;
    editingOperator: Operator | null;
}) {
    const [name, setName]       = useState("");
    const [contact, setContact] = useState("");
    const [address, setAddress] = useState("");
    const [saving, setSaving]   = useState(false);

    useEffect(() => {
        if (editingOperator) {
            setName(editingOperator.name);
            setContact(editingOperator.contactNumber ?? "");
            setAddress(editingOperator.address ?? "");
        } else {
            setName(""); setContact(""); setAddress("");
        }
    }, [editingOperator, visible]);

    const handleSave = async () => {
        if (!name.trim()) { Alert.alert("Required", "Operator name is required."); return; }
        setSaving(true);
        try {
            if (editingOperator) {
                await update(ref(db, `operators/${editingOperator.id}`), {
                    name: name.trim(),
                    contactNumber: contact.trim(),
                    address: address.trim(),
                });
                Alert.alert("✅ Updated", "Operator info saved.");
            } else {
                await push(ref(db, "operators"), {
                    name: name.trim(),
                    contactNumber: contact.trim(),
                    address: address.trim(),
                    status: "active",
                    createdAt: Date.now(),
                });
                Alert.alert("✅ Added", `${name.trim()} added as an operator.`);
            }
            onClose();
        } catch {
            Alert.alert("Error", "Failed to save. Check your connection.");
        } finally {
            setSaving(false);
        }
    };

    const FIELDS = [
        {
            label: "Operator / Franchise Name *",
            value: name, setter: setName,
            placeholder: "e.g. Juan Dela Cruz Transport",
            cap: "words" as any,
        },
        {
            label: "Contact Number",
            value: contact, setter: setContact,
            placeholder: "e.g. 0912-345-6789",
            kb: "phone-pad" as any,
            cap: "none" as any,
        },
        {
            label: "Address",
            value: address, setter: setAddress,
            placeholder: "e.g. Balacbac, Baguio City",
            cap: "sentences" as any,
        },
    ];

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <View style={s.handle} />

                    {/* Header */}
                    <View style={s.mHeader}>
                        <View style={[s.mAvatar, { backgroundColor: "#f0fdf4" }]}>
                            <Building2 color="#15803d" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.mName}>
                                {editingOperator ? "Edit Operator" : "Add Operator"}
                            </Text>
                            <Text style={s.mSub}>Jeepney franchise / operator info</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {FIELDS.map((f, i) => (
                        <View key={i} style={{ marginBottom: 14 }}>
                            <Text style={s.fieldLbl}>{f.label}</Text>
                            <TextInput
                                value={f.value}
                                onChangeText={f.setter}
                                placeholder={f.placeholder}
                                placeholderTextColor="#d1d5db"
                                keyboardType={f.kb ?? "default"}
                                autoCapitalize={f.cap}
                                style={s.fieldInput}
                            />
                        </View>
                    ))}

                    <TouchableOpacity
                        style={[s.saveBtn, saving && { opacity: 0.6 }]}
                        onPress={handleSave}
                        disabled={saving}
                        activeOpacity={0.85}
                    >
                        {saving
                            ? <ActivityIndicator color="white" />
                            : <Text style={s.saveTxt}>
                                {editingOperator ? "Save Changes" : "Add Operator"}
                              </Text>
                        }
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────

function OperatorDetailModal({
    operator, drivers, onClose, onEdit,
}: {
    operator: Operator | null;
    drivers: Driver[];
    onClose: () => void;
    onEdit: () => void;
}) {
    if (!operator) return null;

    const opDrivers = drivers.filter(
        d => d.operatorId === operator.id || d.operatorName === operator.name
    );
    const isActive = operator.status === "active";

    const toggleStatus = () => {
        const next: OperatorStatus = isActive ? "inactive" : "active";
        Alert.alert(
            `${next === "active" ? "Activate" : "Deactivate"} Operator?`,
            `Mark ${operator.name} as ${next}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Confirm",
                    onPress: async () => {
                        await update(ref(db, `operators/${operator.id}`), { status: next });
                        onClose();
                    },
                },
            ]
        );
    };

    const handleDelete = () => {
        if (opDrivers.length > 0) {
            Alert.alert(
                "Cannot Delete",
                "This operator still has assigned drivers. Remove the operator from drivers first."
            );
            return;
        }
        Alert.alert(
            "Delete Operator?",
            "This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete", style: "destructive",
                    onPress: async () => {
                        await remove(ref(db, `operators/${operator.id}`));
                        onClose();
                    },
                },
            ]
        );
    };

    return (
        <Modal visible={!!operator} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={[s.sheet, { height: height * 0.82 }]}>
                    <View style={s.handle} />

                    {/* Header */}
                    <View style={s.mHeader}>
                        <View style={[s.mAvatar, { backgroundColor: isActive ? "#f0fdf4" : "#f3f4f6" }]}>
                            <Building2 color={isActive ? "#15803d" : "#9ca3af"} size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.mName}>{operator.name}</Text>
                            <Text style={s.mSub}>
                                {opDrivers.length} driver{opDrivers.length !== 1 ? "s" : ""} assigned
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Contact / Address */}
                    {!!operator.contactNumber && (
                        <View style={s.infoRow}>
                            <Phone size={14} color="#6b7280" />
                            <Text style={s.infoTxt}>{operator.contactNumber}</Text>
                        </View>
                    )}
                    {!!operator.address && (
                        <View style={s.infoRow}>
                            <MapPin size={14} color="#6b7280" />
                            <Text style={s.infoTxt}>{operator.address}</Text>
                        </View>
                    )}

                    {/* Status pill */}
                    <View style={[
                        s.statusPill,
                        { backgroundColor: isActive ? "#dcfce7" : "#f3f4f6" },
                    ]}>
                        <View style={[s.statusDot, { backgroundColor: isActive ? "#15803d" : "#9ca3af" }]} />
                        <Text style={[s.statusTxt, { color: isActive ? "#15803d" : "#6b7280" }]}>
                            {isActive ? "Active" : "Inactive"}
                        </Text>
                    </View>

                    {/* Driver list */}
                    <Text style={s.subTitle}>Assigned Drivers</Text>

                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        {opDrivers.length === 0 ? (
                            <View style={[s.emptyBox, { paddingVertical: 20 }]}>
                                <Users color="#d1d5db" size={32} />
                                <Text style={[s.emptyTxt, { marginTop: 8 }]}>No drivers assigned yet.</Text>
                            </View>
                        ) : opDrivers.map(d => (
                            <View key={d.uid} style={s.driverRow}>
                                <View style={s.driverAvatar}>
                                    <Text style={s.driverAvatarTxt}>
                                        {d.username?.charAt(0)?.toUpperCase() ?? "D"}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.driverName}>{d.username}</Text>
                                    <Text style={s.driverEmail}>{d.email}</Text>
                                </View>
                                <View style={s.driverBadge}>
                                    <Text style={s.driverBadgeTxt}>Driver</Text>
                                </View>
                            </View>
                        ))}

                        {/* Action buttons */}
                        <View style={s.actionRow}>
                            <TouchableOpacity style={s.editBtn} onPress={onEdit} activeOpacity={0.8}>
                                <Edit3 color="#374151" size={16} />
                                <Text style={s.editTxt}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    s.toggleBtn,
                                    { backgroundColor: isActive ? "#fef3c7" : "#f0fdf4" },
                                ]}
                                onPress={toggleStatus}
                                activeOpacity={0.8}
                            >
                                {isActive
                                    ? <XCircle color="#d97706" size={16} />
                                    : <CheckCircle color="#15803d" size={16} />
                                }
                                <Text style={[s.toggleTxt, { color: isActive ? "#d97706" : "#15803d" }]}>
                                    {isActive ? "Deactivate" : "Activate"}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
                            <Trash2 color="#dc2626" size={16} />
                            <Text style={s.deleteTxt}>Delete Operator</Text>
                        </TouchableOpacity>

                        <View style={{ height: 20 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminOperators() {
    const [operators, setOperators] = useState<Operator[]>([]);
    const [drivers, setDrivers]     = useState<Driver[]>([]);
    const [loading, setLoading]     = useState(true);
    const [formVisible, setFormVisible] = useState(false);
    const [editingOp, setEditingOp]     = useState<Operator | null>(null);
    const [selectedOp, setSelectedOp]   = useState<Operator | null>(null);

    useEffect(() => {
        const u1 = onValue(ref(db, "operators"), snap => {
            setOperators(
                snap.exists()
                    ? Object.entries(snap.val()).map(([id, v]: any) => ({ id, ...v }))
                    : []
            );
            setLoading(false);
        });
        const u2 = onValue(ref(db, "users"), snap => {
            if (snap.exists()) {
                setDrivers(
                    Object.entries(snap.val())
                        .filter(([_, v]: any) => v.role === "driver")
                        .map(([uid, v]: any) => ({ uid, ...v }))
                );
            }
        });
        return () => { u1(); u2(); };
    }, []);

    const activeCount   = operators.filter(o => o.status === "active").length;
    const inactiveCount = operators.filter(o => o.status !== "active").length;

    return (
        <SafeAreaView style={s.container}>

            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.title}>Operators</Text>
                    <Text style={s.sub}>{operators.length} registered</Text>
                </View>
                <TouchableOpacity
                    style={s.addBtn}
                    onPress={() => { setEditingOp(null); setFormVisible(true); }}
                    activeOpacity={0.85}
                >
                    <Plus color="white" size={18} />
                    <Text style={s.addBtnTxt}>Add</Text>
                </TouchableOpacity>
            </View>

            {/* Summary row */}
            {operators.length > 0 && (
                <View style={s.summaryRow}>
                    <View style={[s.summaryCard, { backgroundColor: "#f0fdf4" }]}>
                        <CheckCircle color="#15803d" size={16} />
                        <Text style={[s.summaryNum, { color: "#15803d" }]}>{activeCount}</Text>
                        <Text style={s.summaryLbl}>Active</Text>
                    </View>
                    <View style={[s.summaryCard, { backgroundColor: "#f9fafb" }]}>
                        <XCircle color="#9ca3af" size={16} />
                        <Text style={[s.summaryNum, { color: "#6b7280" }]}>{inactiveCount}</Text>
                        <Text style={s.summaryLbl}>Inactive</Text>
                    </View>
                    <View style={[s.summaryCard, { backgroundColor: "#eff6ff" }]}>
                        <Users color="#2563eb" size={16} />
                        <Text style={[s.summaryNum, { color: "#2563eb" }]}>{drivers.length}</Text>
                        <Text style={s.summaryLbl}>Drivers</Text>
                    </View>
                </View>
            )}

            {/* List */}
            {loading ? (
                <ActivityIndicator color="#15803d" style={{ marginTop: 40 }} />
            ) : (
                <ScrollView contentContainerStyle={s.list}>
                    {operators.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Building2 color="#d1d5db" size={52} />
                            <Text style={[s.emptyTxt, { marginTop: 12, fontSize: 16 }]}>
                                No operators yet.
                            </Text>
                            <Text style={[s.emptyTxt, { fontSize: 13, marginTop: 4 }]}>
                                Tap &quot;Add&quot; to register the first operator.
                            </Text>
                        </View>
                    ) : operators.map(op => {
                        const count    = drivers.filter(
                            d => d.operatorId === op.id || d.operatorName === op.name
                        ).length;
                        const isActive = op.status === "active";

                        return (
                            <TouchableOpacity
                                key={op.id}
                                style={s.card}
                                onPress={() => setSelectedOp(op)}
                                activeOpacity={0.75}
                            >
                                <View style={[s.cardIcon, { backgroundColor: isActive ? "#f0fdf4" : "#f3f4f6" }]}>
                                    <Building2 color={isActive ? "#15803d" : "#9ca3af"} size={22} />
                                </View>

                                <View style={{ flex: 1 }}>
                                    <Text style={s.cardName}>{op.name}</Text>
                                    <Text style={s.cardSub}>
                                        {count} driver{count !== 1 ? "s" : ""}
                                        {op.contactNumber ? ` · ${op.contactNumber}` : ""}
                                    </Text>
                                    {!!op.address && (
                                        <Text style={s.cardAddress} numberOfLines={1}>{op.address}</Text>
                                    )}
                                </View>

                                <View style={{ alignItems: "flex-end", gap: 6 }}>
                                    <View style={[
                                        s.badge,
                                        { backgroundColor: isActive ? "#dcfce7" : "#f3f4f6" },
                                    ]}>
                                        <Text style={[
                                            s.badgeTxt,
                                            { color: isActive ? "#15803d" : "#6b7280" },
                                        ]}>
                                            {isActive ? "Active" : "Inactive"}
                                        </Text>
                                    </View>
                                    <ChevronRight color="#9ca3af" size={16} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            {/* Modals */}
            <OperatorFormModal
                visible={formVisible}
                onClose={() => { setFormVisible(false); setEditingOp(null); }}
                editingOperator={editingOp}
            />

            <OperatorDetailModal
                operator={selectedOp}
                drivers={drivers}
                onClose={() => setSelectedOp(null)}
                onEdit={() => {
                    setEditingOp(selectedOp);
                    setSelectedOp(null);
                    setTimeout(() => setFormVisible(true), 300);
                }}
            />
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
    sub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },
    addBtn: {
        flexDirection: "row", alignItems: "center", gap: 6,
        backgroundColor: "#15803d", borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 8,
    },
    addBtnTxt: { color: "white", fontWeight: "700", fontSize: 13 },

    summaryRow: {
        flexDirection: "row", gap: 10, paddingHorizontal: 16,
        paddingTop: 14, paddingBottom: 4,
    },
    summaryCard: {
        flex: 1, borderRadius: 14, padding: 12,
        alignItems: "center", gap: 4,
    },
    summaryNum: { fontSize: 20, fontWeight: "900" },
    summaryLbl: { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase" },

    list: { padding: 16, gap: 10 },
    emptyBox: { alignItems: "center", paddingVertical: 80 },
    emptyTxt: { color: "#9ca3af", fontWeight: "600", textAlign: "center" },

    card: {
        backgroundColor: "#fff", borderRadius: 16, padding: 14,
        flexDirection: "row", alignItems: "center", gap: 12,
        borderWidth: 1, borderColor: "#e5e7eb",
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    },
    cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    cardName:    { fontSize: 15, fontWeight: "700", color: "#111827" },
    cardSub:     { fontSize: 12, color: "#6b7280", marginTop: 2 },
    cardAddress: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeTxt: { fontSize: 11, fontWeight: "700" },

    // Shared modal
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: {
        backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 20, paddingBottom: 40,
    },
    handle: { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 16 },
    mHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
    mAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
    mName: { fontSize: 17, fontWeight: "800", color: "#111827" },
    mSub:  { fontSize: 12, color: "#6b7280" },
    closeBtn: { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },

    fieldLbl:   { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 },
    fieldInput: {
        backgroundColor: "#f9fafb", borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 15, color: "#111827",
        borderWidth: 1, borderColor: "#e5e7eb",
    },
    saveBtn: {
        backgroundColor: "#15803d", borderRadius: 14, paddingVertical: 16,
        alignItems: "center", marginTop: 8,
    },
    saveTxt: { color: "white", fontWeight: "800", fontSize: 15 },

    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    infoTxt: { fontSize: 13, color: "#6b7280" },
    statusPill: {
        flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 16,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusTxt: { fontSize: 12, fontWeight: "700" },

    subTitle: { fontSize: 14, fontWeight: "800", color: "#111827", marginBottom: 10 },
    driverRow: {
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
    },
    driverAvatar: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center",
    },
    driverAvatarTxt: { fontSize: 16, fontWeight: "800", color: "#15803d" },
    driverName:  { fontSize: 14, fontWeight: "700", color: "#111827" },
    driverEmail: { fontSize: 12, color: "#6b7280" },
    driverBadge: { backgroundColor: "#f0fdf4", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    driverBadgeTxt: { color: "#15803d", fontSize: 11, fontWeight: "700" },

    actionRow: { flexDirection: "row", gap: 10, marginTop: 20 },
    editBtn: {
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 6, backgroundColor: "#f3f4f6", borderRadius: 12, paddingVertical: 14,
    },
    editTxt: { fontWeight: "700", color: "#374151" },
    toggleBtn: {
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 6, borderRadius: 12, paddingVertical: 14,
    },
    toggleTxt: { fontWeight: "700" },
    deleteBtn: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 6, backgroundColor: "#fee2e2", borderRadius: 12, paddingVertical: 14, marginTop: 10,
    },
    deleteTxt: { color: "#dc2626", fontWeight: "700" },
});
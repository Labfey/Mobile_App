import React, { useState } from "react";
import {
    Modal, View, Text, TouchableOpacity, StyleSheet, Alert
} from "react-native";
import { Users, Minus, Plus, DollarSign, X } from "lucide-react-native";

// Fare tiers from your existing mapscreen.tsx getZoneFare logic
const FARE_OPTIONS = [
    { label: "Full Route", amount: 20 },
    { label: "3 Zones",    amount: 17 },
    { label: "2 Zones",    amount: 15 },
    { label: "1 Zone",     amount: 13 },
];

interface PassengerCountModalProps {
    visible: boolean;
    destination: string | null;
    onConfirm: (passengerCount: number, farePerPassenger: number) => void;
    onCancel: () => void;
}

export default function PassengerCountModal({
    visible,
    destination,
    onConfirm,
    onCancel,
}: PassengerCountModalProps) {
    const [count, setCount] = useState(1);
    const [fareIndex, setFareIndex] = useState(0); // default: Full Route ₱20

    const fare = FARE_OPTIONS[fareIndex];
    const total = count * fare.amount;

    const increment = () => setCount((c) => Math.min(c + 1, 30));
    const decrement = () => setCount((c) => Math.max(c - 1, 1));

    const handleConfirm = () => {
        if (count < 1) {
            Alert.alert("Invalid", "Passenger count must be at least 1.");
            return;
        }
        onConfirm(count, fare.amount);
        // Reset for next trip
        setCount(1);
        setFareIndex(0);
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <View style={s.handle} />

                    {/* Header */}
                    <View style={s.headerRow}>
                        <View style={s.headerIcon}>
                            <Users color="#15803d" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.title}>End Trip — Log Revenue</Text>
                            <Text style={s.sub}>
                                {destination ? `Route to ${destination}` : "Balacbac–Town"}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onCancel} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Passenger counter */}
                    <Text style={s.fieldLabel}>Number of Passengers</Text>
                    <View style={s.counter}>
                        <TouchableOpacity
                            style={[s.counterBtn, count <= 1 && s.counterBtnDisabled]}
                            onPress={decrement}
                            disabled={count <= 1}
                        >
                            <Minus color={count <= 1 ? "#d1d5db" : "#15803d"} size={22} />
                        </TouchableOpacity>
                        <View style={s.counterDisplay}>
                            <Text style={s.counterNum}>{count}</Text>
                            <Text style={s.counterLabel}>passengers</Text>
                        </View>
                        <TouchableOpacity
                            style={[s.counterBtn, count >= 30 && s.counterBtnDisabled]}
                            onPress={increment}
                            disabled={count >= 30}
                        >
                            <Plus color={count >= 30 ? "#d1d5db" : "#15803d"} size={22} />
                        </TouchableOpacity>
                    </View>

                    {/* Quick count buttons */}
                    <View style={s.quickRow}>
                        {[5, 10, 15, 20].map((n) => (
                            <TouchableOpacity
                                key={n}
                                style={[s.quickBtn, count === n && s.quickBtnActive]}
                                onPress={() => setCount(n)}
                            >
                                <Text style={[s.quickBtnText, count === n && s.quickBtnTextActive]}>
                                    {n}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Fare selector */}
                    <Text style={s.fieldLabel}>Fare Per Passenger</Text>
                    <View style={s.fareRow}>
                        {FARE_OPTIONS.map((opt, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[s.fareChip, fareIndex === i && s.fareChipActive]}
                                onPress={() => setFareIndex(i)}
                            >
                                <Text style={[s.fareChipLabel, fareIndex === i && s.fareChipLabelActive]}>
                                    {opt.label}
                                </Text>
                                <Text style={[s.fareChipAmount, fareIndex === i && s.fareChipAmountActive]}>
                                    ₱{opt.amount}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Revenue preview */}
                    <View style={s.preview}>
                        <View style={s.previewRow}>
                            <Text style={s.previewLabel}>Passengers</Text>
                            <Text style={s.previewValue}>{count}</Text>
                        </View>
                        <View style={s.previewRow}>
                            <Text style={s.previewLabel}>Fare / passenger</Text>
                            <Text style={s.previewValue}>₱{fare.amount}</Text>
                        </View>
                        <View style={[s.previewRow, s.previewTotal]}>
                            <Text style={s.previewTotalLabel}>Trip Revenue</Text>
                            <Text style={s.previewTotalAmount}>₱{total}</Text>
                        </View>
                    </View>

                    {/* Confirm button */}
                    <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
                        <DollarSign color="white" size={20} />
                        <Text style={s.confirmBtnText}>End Trip & Save ₱{total}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 44,
    },
    handle: {
        width: 40, height: 5, backgroundColor: "#e5e7eb",
        borderRadius: 3, alignSelf: "center", marginBottom: 20,
    },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
    headerIcon: {
        width: 46, height: 46, borderRadius: 14, backgroundColor: "#f0fdf4",
        alignItems: "center", justifyContent: "center",
    },
    title: { fontSize: 17, fontWeight: "800", color: "#111827" },
    sub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
    closeBtn: { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },

    fieldLabel: {
        fontSize: 11, fontWeight: "700", color: "#9ca3af",
        textTransform: "uppercase", marginBottom: 10,
    },

    counter: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        backgroundColor: "#f9fafb", borderRadius: 18, padding: 8, marginBottom: 12,
    },
    counterBtn: {
        width: 48, height: 48, borderRadius: 14, backgroundColor: "#fff",
        alignItems: "center", justifyContent: "center",
        borderWidth: 1.5, borderColor: "#e5e7eb",
    },
    counterBtnDisabled: { borderColor: "#f3f4f6" },
    counterDisplay: { alignItems: "center" },
    counterNum: { fontSize: 36, fontWeight: "900", color: "#111827" },
    counterLabel: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },

    quickRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
    quickBtn: {
        flex: 1, paddingVertical: 8, borderRadius: 10,
        backgroundColor: "#f3f4f6", alignItems: "center",
        borderWidth: 1.5, borderColor: "transparent",
    },
    quickBtnActive: { backgroundColor: "#f0fdf4", borderColor: "#15803d" },
    quickBtnText: { fontSize: 14, fontWeight: "700", color: "#6b7280" },
    quickBtnTextActive: { color: "#15803d" },

    fareRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
    fareChip: {
        flex: 1, borderRadius: 12, padding: 10, alignItems: "center",
        backgroundColor: "#f9fafb", borderWidth: 1.5, borderColor: "#e5e7eb",
    },
    fareChipActive: { backgroundColor: "#f0fdf4", borderColor: "#15803d" },
    fareChipLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af" },
    fareChipLabelActive: { color: "#15803d" },
    fareChipAmount: { fontSize: 15, fontWeight: "900", color: "#374151", marginTop: 2 },
    fareChipAmountActive: { color: "#15803d" },

    preview: {
        backgroundColor: "#f9fafb", borderRadius: 16, padding: 16, marginBottom: 20,
        gap: 8,
    },
    previewRow: { flexDirection: "row", justifyContent: "space-between" },
    previewLabel: { fontSize: 13, color: "#6b7280", fontWeight: "600" },
    previewValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
    previewTotal: {
        borderTopWidth: 1, borderTopColor: "#e5e7eb",
        paddingTop: 10, marginTop: 4,
    },
    previewTotalLabel: { fontSize: 15, fontWeight: "800", color: "#111827" },
    previewTotalAmount: { fontSize: 22, fontWeight: "900", color: "#15803d" },

    confirmBtn: {
        backgroundColor: "#15803d", borderRadius: 16, paddingVertical: 18,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        shadowColor: "#15803d", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    confirmBtnText: { color: "white", fontWeight: "800", fontSize: 16 },
});
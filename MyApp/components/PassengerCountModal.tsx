import React, { useState } from "react";
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    Alert, ScrollView
} from "react-native";
import { Users, Minus, Plus, X, Trash2, CheckCircle } from "lucide-react-native";

const FARE_OPTIONS = [
    { label: "Full Route", amount: 20 },
    { label: "3 Zones",    amount: 17 },
    { label: "2 Zones",    amount: 15 },
    { label: "1 Zone",     amount: 13 },
];

export interface FareGroup {
    passengerCount: number;
    farePerPassenger: number;
}

interface PassengerCountModalProps {
    visible: boolean;
    destination: string | null;
    onConfirm: (groups: FareGroup[]) => void;
    onCancel: () => void;
}

export default function PassengerCountModal({
    visible, destination, onConfirm, onCancel,
}: PassengerCountModalProps) {

    const [count, setCount]         = useState(1);
    const [fareIndex, setFareIndex] = useState(0);
    const [groups, setGroups]       = useState<FareGroup[]>([]);

    const fare           = FARE_OPTIONS[fareIndex];
    const committedTotal = groups.reduce((s, g) => s + g.passengerCount * g.farePerPassenger, 0);
    const committedPax   = groups.reduce((s, g) => s + g.passengerCount, 0);
    const grandTotal     = committedTotal + count * fare.amount;
    const grandPax       = committedPax   + count;

    const increment = () => setCount(c => Math.min(c + 1, 30));
    const decrement = () => setCount(c => Math.max(c - 1, 1));

    const addGroup = () => {
        setGroups(prev => [...prev, { passengerCount: count, farePerPassenger: fare.amount }]);
        setCount(1);
        setFareIndex(0);
    };

    const removeGroup = (idx: number) => setGroups(prev => prev.filter((_, i) => i !== idx));

    const handleDone = () => {
        const allGroups: FareGroup[] = count > 0
            ? [...groups, { passengerCount: count, farePerPassenger: fare.amount }]
            : [...groups];
        if (allGroups.length === 0 || allGroups.every(g => g.passengerCount === 0)) {
            Alert.alert("No passengers", "Please enter at least one passenger.");
            return;
        }
        onConfirm(allGroups);
        reset();
    };

    const reset = () => { setGroups([]); setCount(1); setFareIndex(0); };

    const handleCancel = () => { reset(); onCancel(); };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <View style={s.handle} />

                    {/* Header */}
                    <View style={s.headerRow}>
                        <View style={s.headerIcon}><Users color="#15803d" size={22} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.title}>Log Trip Revenue</Text>
                            <Text style={s.sub}>{destination ? `Route to ${destination}` : "Balacbac–Town"}</Text>
                        </View>
                        <TouchableOpacity onPress={handleCancel} style={s.closeBtn}>
                            <X color="#6b7280" size={20} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>

                        {/* Groups already added */}
                        {groups.length > 0 && (
                            <View style={s.groupsList}>
                                <Text style={s.fieldLabel}>Added Groups</Text>
                                {groups.map((g, i) => (
                                    <View key={i} style={s.groupRow}>
                                        <View style={s.groupNum}><Text style={s.groupNumText}>#{i+1}</Text></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.groupMain}>
                                                {g.passengerCount} pax  ×  <Text style={{ color: "#15803d" }}>₱{g.farePerPassenger}</Text>
                                            </Text>
                                            <Text style={s.groupSub}>= ₱{g.passengerCount * g.farePerPassenger}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => removeGroup(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                            <Trash2 color="#ef4444" size={16} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Current group composer */}
                        <Text style={s.fieldLabel}>
                            {groups.length === 0 ? "How many passengers paid this fare?" : "Add another fare group?"}
                        </Text>

                        {/* Stepper */}
                        <View style={s.counter}>
                            <TouchableOpacity style={[s.counterBtn, count <= 1 && s.counterBtnDis]} onPress={decrement} disabled={count <= 1}>
                                <Minus color={count <= 1 ? "#d1d5db" : "#15803d"} size={22} />
                            </TouchableOpacity>
                            <View style={s.counterDisplay}>
                                <Text style={s.counterNum}>{count}</Text>
                                <Text style={s.counterLabel}>passengers</Text>
                            </View>
                            <TouchableOpacity style={[s.counterBtn, count >= 30 && s.counterBtnDis]} onPress={increment} disabled={count >= 30}>
                                <Plus color={count >= 30 ? "#d1d5db" : "#15803d"} size={22} />
                            </TouchableOpacity>
                        </View>

                        {/* Quick pick */}
                        <View style={s.quickRow}>
                            {[5, 10, 15, 20].map(n => (
                                <TouchableOpacity key={n} style={[s.quickBtn, count === n && s.quickBtnActive]} onPress={() => setCount(n)}>
                                    <Text style={[s.quickBtnText, count === n && s.quickBtnTextActive]}>{n}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Fare selector */}
                        <Text style={s.fieldLabel}>Fare Per Passenger</Text>
                        <View style={s.fareRow}>
                            {FARE_OPTIONS.map((opt, i) => (
                                <TouchableOpacity key={i} style={[s.fareChip, fareIndex === i && s.fareChipActive]} onPress={() => setFareIndex(i)}>
                                    <Text style={[s.fareChipLabel, fareIndex === i && s.fareChipLabelActive]}>{opt.label}</Text>
                                    <Text style={[s.fareChipAmount, fareIndex === i && s.fareChipAmountActive]}>₱{opt.amount}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Preview of current group */}
                        <View style={s.preview}>
                            <Text style={s.previewText}>
                                This group: {count} × ₱{fare.amount} = <Text style={{ color: "#15803d", fontWeight: "900" }}>₱{count * fare.amount}</Text>
                            </Text>
                        </View>

                        {/* Add group button */}
                        <TouchableOpacity style={s.addGroupBtn} onPress={addGroup} activeOpacity={0.8}>
                            <Plus color="#15803d" size={16} />
                            <Text style={s.addGroupBtnText}>Add Another Group</Text>
                        </TouchableOpacity>

                        {/* Running total */}
                        <View style={s.totalBox}>
                            <View style={s.totalRow}>
                                <Text style={s.totalLbl}>Total Passengers</Text>
                                <Text style={s.totalVal}>{grandPax}</Text>
                            </View>
                            <View style={[s.totalRow, { borderTopWidth: 1, borderTopColor: "#bbf7d0", paddingTop: 10, marginTop: 6 }]}>
                                <Text style={s.totalLblBig}>Total Revenue</Text>
                                <Text style={s.totalAmtBig}>₱{grandTotal}</Text>
                            </View>
                        </View>

                    </ScrollView>

                    {/* Done */}
                    <TouchableOpacity style={s.doneBtn} onPress={handleDone} activeOpacity={0.85}>
                        <CheckCircle color="white" size={20} />
                        <Text style={s.doneBtnText}>Done — Save ₱{grandTotal}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    sheet:   { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, maxHeight: "92%" },
    handle:  { width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 20 },

    headerRow:  { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
    headerIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
    title:      { fontSize: 17, fontWeight: "800", color: "#111827" },
    sub:        { fontSize: 12, color: "#6b7280", marginTop: 2 },
    closeBtn:   { padding: 8, backgroundColor: "#f3f4f6", borderRadius: 12 },

    fieldLabel: { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginBottom: 10, marginTop: 4 },

    groupsList: { backgroundColor: "#f9fafb", borderRadius: 14, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: "#e5e7eb" },
    groupRow:   { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
    groupNum:   { width: 22, height: 22, borderRadius: 11, backgroundColor: "#15803d", alignItems: "center", justifyContent: "center" },
    groupNumText: { color: "white", fontSize: 10, fontWeight: "800" },
    groupMain:  { fontSize: 14, fontWeight: "700", color: "#111827" },
    groupSub:   { fontSize: 12, color: "#6b7280" },

    counter:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#f9fafb", borderRadius: 18, padding: 8, marginBottom: 12 },
    counterBtn:    { width: 48, height: 48, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#e5e7eb" },
    counterBtnDis: { borderColor: "#f3f4f6" },
    counterDisplay:{ alignItems: "center" },
    counterNum:    { fontSize: 36, fontWeight: "900", color: "#111827" },
    counterLabel:  { fontSize: 11, color: "#9ca3af", fontWeight: "600" },

    quickRow:          { flexDirection: "row", gap: 8, marginBottom: 20 },
    quickBtn:          { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: "#f3f4f6", alignItems: "center", borderWidth: 1.5, borderColor: "transparent" },
    quickBtnActive:    { backgroundColor: "#f0fdf4", borderColor: "#15803d" },
    quickBtnText:      { fontSize: 14, fontWeight: "700", color: "#6b7280" },
    quickBtnTextActive:{ color: "#15803d" },

    fareRow:              { flexDirection: "row", gap: 8, marginBottom: 16 },
    fareChip:             { flex: 1, borderRadius: 12, padding: 10, alignItems: "center", backgroundColor: "#f9fafb", borderWidth: 1.5, borderColor: "#e5e7eb" },
    fareChipActive:       { backgroundColor: "#f0fdf4", borderColor: "#15803d" },
    fareChipLabel:        { fontSize: 10, fontWeight: "700", color: "#9ca3af" },
    fareChipLabelActive:  { color: "#15803d" },
    fareChipAmount:       { fontSize: 15, fontWeight: "900", color: "#374151", marginTop: 2 },
    fareChipAmountActive: { color: "#15803d" },

    preview:     { backgroundColor: "#f0fdf4", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#bbf7d0" },
    previewText: { fontSize: 14, fontWeight: "600", color: "#374151", textAlign: "center" },

    addGroupBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#f9fafb", borderRadius: 14, paddingVertical: 14, marginBottom: 20, borderWidth: 1.5, borderColor: "#bbf7d0" },
    addGroupBtnText: { fontSize: 14, fontWeight: "700", color: "#15803d" },

    totalBox:   { backgroundColor: "#f0fdf4", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: "#bbf7d0" },
    totalRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
    totalLbl:   { fontSize: 13, color: "#6b7280", fontWeight: "600" },
    totalVal:   { fontSize: 14, fontWeight: "700", color: "#111827" },
    totalLblBig:{ fontSize: 15, fontWeight: "800", color: "#111827" },
    totalAmtBig:{ fontSize: 26, fontWeight: "900", color: "#15803d" },

    doneBtn:     { backgroundColor: "#15803d", borderRadius: 16, paddingVertical: 18, marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#15803d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    doneBtnText: { color: "white", fontWeight: "800", fontSize: 16 },
});
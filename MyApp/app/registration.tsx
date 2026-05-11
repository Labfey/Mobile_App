/**
 * app/registration.tsx
 *
 * Driver application form — updated to include operator selection.
 * Step 1 now fetches registered operators from Firebase and lets the
 * applicant tap-to-select one. A "Not listed — enter manually" fallback
 * is available if their operator isn't in the system yet.
 *
 * The selected operatorId is stored in both users/ and
 * pending_registrations/ so the admin can link driver → operator.
 */

import React, { useState, useEffect } from "react";
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    Alert, ActivityIndicator, StyleSheet, Image,
    Platform, KeyboardAvoidingView, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
    ArrowLeft, ArrowRight, User, Mail, Lock,
    CreditCard, Camera, Check, Building2, FileText, Shield,
    MapPin,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db, ref, onValue } from "../services/firebase";
import { set } from "firebase/database";

const { width } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Operator {
    id: string;
    name: string;
    address?: string;
    contactNumber?: string;
    status: string;
}

interface FormState {
    // Step 0
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
    // Step 1
    licenseNumber: string;
    operatorId: string;       // Firebase key of selected operator
    operatorName: string;     // Display name (selected or manually typed)
    // Step 2
    licenseImageUri: string | null;
    idImageUri: string | null;
    // Step 3
    agreedToTos: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STEP_LABELS = ["Account", "License", "Documents", "Review & Submit"];

async function pickImage(): Promise<string | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
        Alert.alert("Permission required", "Please allow access to your photo library.");
        return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
        allowsEditing: true,
        aspect: [4, 3],
    });
    if (result.canceled || !result.assets[0]) return null;
    const { base64, uri, mimeType } = result.assets[0];
    return base64
        ? `data:${mimeType ?? "image/jpeg"};base64,${base64}`
        : uri;
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
    return (
        <View style={st.indicatorRow}>
            {STEP_LABELS.map((label, i) => (
                <View key={i} style={st.indicatorItem}>
                    <View style={[st.indicatorDot, i <= step && st.indicatorDotActive]}>
                        {i < step
                            ? <Check color="white" size={12} />
                            : <Text style={[st.indicatorNum, i === step && { color: "white" }]}>{i + 1}</Text>
                        }
                    </View>
                    <Text style={[st.indicatorLabel, i === step && st.indicatorLabelActive]} numberOfLines={1}>
                        {label}
                    </Text>
                    {i < STEP_LABELS.length - 1 && (
                        <View style={[st.indicatorLine, i < step && st.indicatorLineActive]} />
                    )}
                </View>
            ))}
        </View>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <Text style={st.fieldLabel}>{children}</Text>;
}

function InputRow({
    icon, value, onChangeText, placeholder, secure, keyboardType, cap, editable,
}: {
    icon: React.ReactNode;
    value: string;
    onChangeText: (v: string) => void;
    placeholder: string;
    secure?: boolean;
    keyboardType?: any;
    cap?: any;
    editable?: boolean;
}) {
    return (
        <View style={st.inputRow}>
            {icon}
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor="#9ca3af"
                secureTextEntry={secure}
                keyboardType={keyboardType ?? "default"}
                autoCapitalize={cap ?? "sentences"}
                editable={editable !== false}
                style={st.input}
            />
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DriverRegistration() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    // ── Operator list from Firebase ───────────────────────────────────────────
    const [operators, setOperators]           = useState<Operator[]>([]);
    const [operatorsLoading, setOperatorsLoading] = useState(true);
    const [showManualEntry, setShowManualEntry]   = useState(false);

    useEffect(() => {
        const unsub = onValue(ref(db, "operators"), (snap) => {
            if (snap.exists()) {
                const list: Operator[] = Object.entries(snap.val())
                    .filter(([_, v]: any) => v.status === "active")
                    .map(([id, v]: any) => ({ id, ...v }))
                    .sort((a: Operator, b: Operator) => a.name.localeCompare(b.name));
                setOperators(list);
            } else {
                setOperators([]);
            }
            setOperatorsLoading(false);
        });
        return () => unsub();
    }, []);

    // ── Form state ────────────────────────────────────────────────────────────
    const [form, setForm] = useState<FormState>({
        fullName: "", email: "", password: "", confirmPassword: "",
        licenseNumber: "", operatorId: "", operatorName: "",
        licenseImageUri: null, idImageUri: null,
        agreedToTos: false,
    });

    const set_ = (key: keyof FormState, value: any) =>
        setForm(prev => ({ ...prev, [key]: value }));

    // ── Validation per step ───────────────────────────────────────────────────

    const validateStep = (): boolean => {
        if (step === 0) {
            if (!form.fullName.trim())           { Alert.alert("Required", "Please enter your full name."); return false; }
            if (!form.email.trim())              { Alert.alert("Required", "Please enter your email."); return false; }
            if (form.password.length < 6)        { Alert.alert("Weak Password", "Password must be at least 6 characters."); return false; }
            if (form.password !== form.confirmPassword) { Alert.alert("Mismatch", "Passwords do not match."); return false; }
        }
        if (step === 1) {
            if (!form.licenseNumber.trim())      { Alert.alert("Required", "Please enter your license number."); return false; }
            if (!form.operatorName.trim())       { Alert.alert("Required", "Please select or enter your operator."); return false; }
        }
        if (step === 2) {
            if (!form.licenseImageUri)           { Alert.alert("Required", "Please upload a photo of your driver's license."); return false; }
            if (!form.idImageUri)                { Alert.alert("Required", "Please upload a photo of your government ID."); return false; }
        }
        if (step === 3) {
            if (!form.agreedToTos)               { Alert.alert("Required", "You must agree to the Terms of Service to proceed."); return false; }
        }
        return true;
    };

    const next = () => { if (validateStep()) setStep(s => s + 1); };
    const back = () => setStep(s => Math.max(0, s - 1));

    // ── Submit ────────────────────────────────────────────────────────────────

    const handleSubmit = async () => {
        if (!validateStep()) return;
        setSubmitting(true);
        try {
            const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
            const uid  = cred.user.uid;

            await set(ref(db, `users/${uid}`), {
                username:      form.fullName.trim(),
                email:         form.email.trim(),
                role:          "pending_driver",
                operatorName:  form.operatorName.trim(),
                operatorId:    form.operatorId || null,
                createdAt:     Date.now(),
            });

            await set(ref(db, `pending_registrations/${uid}`), {
                fullName:      form.fullName.trim(),
                email:         form.email.trim(),
                licenseNumber: form.licenseNumber.trim(),
                operatorName:  form.operatorName.trim(),
                operatorId:    form.operatorId || null,
                licenseImage:  form.licenseImageUri ?? "",
                idImage:       form.idImageUri ?? "",
                status:        "pending",
                submittedAt:   Date.now(),
            });

            Alert.alert(
                "✅ Application Submitted!",
                "Your application has been sent to the admin for review. You will be able to log in once your account is approved.",
                [{ text: "Back to Login", onPress: () => router.replace("/login" as any) }]
            );
        } catch (err: any) {
            if (err.code === "auth/email-already-in-use") {
                Alert.alert("Email Taken", "An account with this email already exists. Please log in or use a different email.");
            } else {
                Alert.alert("Submission Error", err.message ?? "Something went wrong. Check your connection.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    // ── Render step content ───────────────────────────────────────────────────

    const renderStep = () => {
        switch (step) {

            /* ── Step 0: Account Info ──────────────────────────────────────── */
            case 0:
                return (
                    <View style={st.stepBody}>
                        <Text style={st.stepTitle}>Create Your Account</Text>
                        <Text style={st.stepSub}>This will be your driver login credentials.</Text>

                        <FieldLabel>Full Name *</FieldLabel>
                        <InputRow icon={<User color="#9ca3af" size={18} />} value={form.fullName}
                            onChangeText={v => set_("fullName", v)} placeholder="e.g. Juan dela Cruz" cap="words" />

                        <FieldLabel>Email Address *</FieldLabel>
                        <InputRow icon={<Mail color="#9ca3af" size={18} />} value={form.email}
                            onChangeText={v => set_("email", v)} placeholder="driver@email.com"
                            keyboardType="email-address" cap="none" />

                        <FieldLabel>Password * (min. 6 characters)</FieldLabel>
                        <InputRow icon={<Lock color="#9ca3af" size={18} />} value={form.password}
                            onChangeText={v => set_("password", v)} placeholder="Create a password" secure />

                        <FieldLabel>Confirm Password *</FieldLabel>
                        <InputRow icon={<Lock color="#9ca3af" size={18} />} value={form.confirmPassword}
                            onChangeText={v => set_("confirmPassword", v)} placeholder="Re-enter password" secure />
                    </View>
                );

            /* ── Step 1: Professional Info ─────────────────────────────────── */
            case 1:
                return (
                    <View style={st.stepBody}>
                        <Text style={st.stepTitle}>Professional Details</Text>
                        <Text style={st.stepSub}>Enter your license number and select your operator.</Text>

                        <FieldLabel>Driver&apos;s License Number *</FieldLabel>
                        <InputRow icon={<CreditCard color="#9ca3af" size={18} />} value={form.licenseNumber}
                            onChangeText={v => set_("licenseNumber", v)} placeholder="e.g. A01-23-456789"
                            cap="characters" />

                        <FieldLabel>Operator / Franchise *</FieldLabel>

                        {operatorsLoading ? (
                            <View style={st.operatorLoading}>
                                <ActivityIndicator color="#15803d" size="small" />
                                <Text style={st.operatorLoadingTxt}>Loading registered operators…</Text>
                            </View>
                        ) : operators.length === 0 ? (
                            /* No operators in DB → fall straight to manual entry */
                            <>
                                <View style={st.infoBox}>
                                    <FileText color="#6b7280" size={14} />
                                    <Text style={st.infoTxt}>
                                        No registered operators found yet. Please enter your operator manually.
                                    </Text>
                                </View>
                                <InputRow
                                    icon={<Building2 color="#9ca3af" size={18} />}
                                    value={form.operatorName}
                                    onChangeText={v => { set_("operatorName", v); set_("operatorId", ""); }}
                                    placeholder="e.g. Juan Dela Cruz Transport"
                                    cap="words"
                                />
                            </>
                        ) : (
                            <>
                                <Text style={st.operatorPickerHint}>
                                    Tap your operator to select it:
                                </Text>

                                {/* Registered operators list */}
                                {operators.map(op => {
                                    const selected = form.operatorId === op.id;
                                    return (
                                        <TouchableOpacity
                                            key={op.id}
                                            onPress={() => {
                                                set_("operatorId", op.id);
                                                set_("operatorName", op.name);
                                                setShowManualEntry(false);
                                            }}
                                            style={[st.operatorCard, selected && st.operatorCardSelected]}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[
                                                st.operatorIcon,
                                                { backgroundColor: selected ? "#dcfce7" : "#f3f4f6" },
                                            ]}>
                                                <Building2
                                                    color={selected ? "#15803d" : "#9ca3af"}
                                                    size={18}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[
                                                    st.operatorCardName,
                                                    selected && { color: "#15803d" },
                                                ]}>
                                                    {op.name}
                                                </Text>
                                                {!!op.address && (
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                                                        <MapPin size={10} color="#9ca3af" />
                                                        <Text style={st.operatorCardAddr} numberOfLines={1}>
                                                            {op.address}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            {selected && (
                                                <View style={st.operatorCheck}>
                                                    <Check color="white" size={14} />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}

                                {/* "Not listed" toggle */}
                                <TouchableOpacity
                                    onPress={() => {
                                        const next = !showManualEntry;
                                        setShowManualEntry(next);
                                        if (next) {
                                            // Clear any previously selected operator
                                            set_("operatorId", "");
                                            set_("operatorName", "");
                                        }
                                    }}
                                    style={[st.operatorCard, showManualEntry && st.operatorCardManual]}
                                    activeOpacity={0.7}
                                >
                                    <View style={[st.operatorIcon, { backgroundColor: showManualEntry ? "#fef3c7" : "#f3f4f6" }]}>
                                        <Text style={{ fontSize: 16 }}>✏️</Text>
                                    </View>
                                    <Text style={[
                                        st.operatorCardName,
                                        { color: showManualEntry ? "#d97706" : "#6b7280" },
                                    ]}>
                                        Not listed — enter manually
                                    </Text>
                                </TouchableOpacity>

                                {/* Manual text input — shown when toggle is active */}
                                {showManualEntry && (
                                    <InputRow
                                        icon={<Building2 color="#9ca3af" size={18} />}
                                        value={form.operatorName}
                                        onChangeText={v => {
                                            set_("operatorName", v);
                                            set_("operatorId", "");
                                        }}
                                        placeholder="e.g. Juan Dela Cruz Transport"
                                        cap="words"
                                    />
                                )}
                            </>
                        )}

                        <View style={[st.infoBox, { marginTop: 16 }]}>
                            <FileText color="#6b7280" size={14} />
                            <Text style={st.infoTxt}>
                                Your operator name must match your operator certificate issued by the Jeepney Management.
                            </Text>
                        </View>
                    </View>
                );

            /* ── Step 2: Documents ─────────────────────────────────────────── */
            case 2:
                return (
                    <View style={st.stepBody}>
                        <Text style={st.stepTitle}>Upload Documents</Text>
                        <Text style={st.stepSub}>Photos must be clear and legible. Admin will verify these before approval.</Text>

                        <FieldLabel>Driver&apos;s License Photo *</FieldLabel>
                        <TouchableOpacity
                            style={[st.uploadBox, form.licenseImageUri && st.uploadBoxDone]}
                            onPress={async () => { const uri = await pickImage(); if (uri) set_("licenseImageUri", uri); }}
                            activeOpacity={0.8}
                        >
                            {form.licenseImageUri
                                ? <Image source={{ uri: form.licenseImageUri }} style={st.uploadPreview} />
                                : <>
                                    <Camera color="#15803d" size={32} />
                                    <Text style={st.uploadLabel}>Tap to upload license photo</Text>
                                    <Text style={st.uploadHint}>Front side, clear and in focus</Text>
                                  </>
                            }
                            {form.licenseImageUri && (
                                <View style={st.uploadBadge}><Check color="white" size={14} /></View>
                            )}
                        </TouchableOpacity>

                        <FieldLabel>Government ID Photo *</FieldLabel>
                        <TouchableOpacity
                            style={[st.uploadBox, form.idImageUri && st.uploadBoxDone]}
                            onPress={async () => { const uri = await pickImage(); if (uri) set_("idImageUri", uri); }}
                            activeOpacity={0.8}
                        >
                            {form.idImageUri
                                ? <Image source={{ uri: form.idImageUri }} style={st.uploadPreview} />
                                : <>
                                    <Camera color="#15803d" size={32} />
                                    <Text style={st.uploadLabel}>Tap to upload government ID</Text>
                                    <Text style={st.uploadHint}>Passport, PhilSys, SSS, etc.</Text>
                                  </>
                            }
                            {form.idImageUri && (
                                <View style={st.uploadBadge}><Check color="white" size={14} /></View>
                            )}
                        </TouchableOpacity>

                        <View style={st.infoBox}>
                            <Shield color="#6b7280" size={14} />
                            <Text style={st.infoTxt}>
                                Your documents are only used for identity verification and are kept securely.
                                We do not share your personal data with third parties.
                            </Text>
                        </View>
                    </View>
                );

            /* ── Step 3: Terms of Service ──────────────────────────────────── */
            case 3:
                return (
                    <View style={st.stepBody}>
                        <Text style={st.stepTitle}>Terms of Service</Text>
                        <Text style={st.stepSub}>Please read before submitting your application.</Text>

                        <View style={st.tosBox}>
                            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator>
                                <Text style={st.tosSection}>1. Information We Collect</Text>
                                <Text style={st.tosPara}>
                                    By applying as a driver on JeepRoute, you voluntarily provide the following
                                    personal information:
                                </Text>
                                {[
                                    "Full name",
                                    "Email address",
                                    "Driver's license number",
                                    "Photo of your driver's license",
                                    "Photo of a government-issued ID",
                                    "Operator",
                                ].map(item => (
                                    <Text key={item} style={st.tosBullet}>• {item}</Text>
                                ))}

                                <Text style={st.tosSection}>2. How We Use Your Information</Text>
                                <Text style={st.tosPara}>
                                    Your information is used solely to verify your identity and eligibility as a jeepney
                                    driver on the Balacbac–Town route. The admin will review your submitted documents
                                    before approving your account.
                                </Text>

                                <Text style={st.tosSection}>3. Data Storage</Text>
                                <Text style={st.tosPara}>
                                    Your data is stored securely in Firebase (Google Cloud). Access is restricted to
                                    authorized system administrators only.
                                </Text>

                                <Text style={st.tosSection}>4. Your Rights</Text>
                                <Text style={st.tosPara}>
                                    You may request the deletion of your account and associated data at any time by
                                    contacting the system administrator.
                                </Text>

                                <Text style={st.tosSection}>5. Location Data</Text>
                                <Text style={st.tosPara}>
                                    Once approved and actively driving, your real-time GPS location will be shared with
                                    commuters using the app. Location sharing is only active while you have a trip
                                    in progress.
                                </Text>

                                <Text style={st.tosSection}>6. Agreement</Text>
                                <Text style={st.tosPara}>
                                    By checking the box below, you confirm that all information provided is accurate and
                                    that you agree to these terms.
                                </Text>
                            </ScrollView>
                        </View>

                        {/* Summary */}
                        <View style={st.summaryBox}>
                            <Text style={st.summaryTitle}>Submitting as:</Text>
                            <Text style={st.summaryRow}><Text style={st.summaryKey}>Name: </Text>{form.fullName}</Text>
                            <Text style={st.summaryRow}><Text style={st.summaryKey}>Email: </Text>{form.email}</Text>
                            <Text style={st.summaryRow}><Text style={st.summaryKey}>License #: </Text>{form.licenseNumber}</Text>
                            <Text style={st.summaryRow}><Text style={st.summaryKey}>Operator: </Text>{form.operatorName}</Text>
                            <Text style={st.summaryRow}>
                                <Text style={st.summaryKey}>Documents: </Text>
                                {form.licenseImageUri ? "✅" : "❌"} License · {form.idImageUri ? "✅" : "❌"} Gov&apos;t ID
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={st.tosCheckRow}
                            onPress={() => set_("agreedToTos", !form.agreedToTos)}
                            activeOpacity={0.8}
                        >
                            <View style={[st.checkbox, form.agreedToTos && st.checkboxChecked]}>
                                {form.agreedToTos && <Check color="white" size={14} />}
                            </View>
                            <Text style={st.tosCheckLabel}>
                                I have read and agree to the Terms of Service and Privacy Policy.
                            </Text>
                        </TouchableOpacity>
                    </View>
                );

            default:
                return null;
        }
    };

    // ── Main Render ───────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={st.container}>
            <View style={st.header}>
                <TouchableOpacity
                    onPress={() => (step === 0 ? router.back() : back())}
                    style={st.backBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <ArrowLeft color="#374151" size={22} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={st.headerTitle}>Driver Application</Text>
                    <Text style={st.headerSub}>Step {step + 1} of {STEP_LABELS.length}</Text>
                </View>
            </View>

            <StepIndicator step={step} />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
                <ScrollView
                    contentContainerStyle={st.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {renderStep()}

                    <View style={st.navRow}>
                        {step < 3 ? (
                            <TouchableOpacity style={st.nextBtn} onPress={next} activeOpacity={0.85}>
                                <Text style={st.nextBtnTxt}>Continue</Text>
                                <ArrowRight color="white" size={18} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[st.nextBtn, st.submitBtn, submitting && { opacity: 0.6 }]}
                                onPress={handleSubmit}
                                disabled={submitting}
                                activeOpacity={0.85}
                            >
                                {submitting
                                    ? <ActivityIndicator color="white" />
                                    : <><Check color="white" size={18} /><Text style={st.nextBtnTxt}>Submit Application</Text></>
                                }
                            </TouchableOpacity>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
    container:  { flex: 1, backgroundColor: "#f9fafb" },

    header:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", gap: 12 },
    backBtn:    { padding: 4 },
    headerTitle:{ fontSize: 18, fontWeight: "800", color: "#111827" },
    headerSub:  { fontSize: 12, color: "#6b7280", marginTop: 1 },

    // Step indicator
    indicatorRow:        { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
    indicatorItem:       { flex: 1, alignItems: "center", position: "relative" },
    indicatorDot:        { width: 24, height: 24, borderRadius: 12, backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center", marginBottom: 4 },
    indicatorDotActive:  { backgroundColor: "#15803d" },
    indicatorNum:        { fontSize: 11, fontWeight: "700", color: "#9ca3af" },
    indicatorLabel:      { fontSize: 9, color: "#9ca3af", fontWeight: "600", textAlign: "center" },
    indicatorLabelActive:{ color: "#15803d" },
    indicatorLine:       { position: "absolute", top: 12, left: "60%", right: "-60%", height: 2, backgroundColor: "#e5e7eb" },
    indicatorLineActive: { backgroundColor: "#15803d" },

    scrollContent: { padding: 20, paddingBottom: 40 },

    stepBody:  { marginBottom: 8 },
    stepTitle: { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 6 },
    stepSub:   { fontSize: 13, color: "#6b7280", marginBottom: 24, lineHeight: 20 },

    fieldLabel: { fontSize: 11, fontWeight: "700", color: "#374151", textTransform: "uppercase", marginBottom: 8, marginTop: 16 },
    inputRow:   { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: "#e5e7eb" },
    input:      { flex: 1, fontSize: 15, color: "#111827" },

    // ── Operator picker ───────────────────────────────────────────────────────
    operatorLoading:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 20, justifyContent: "center" },
    operatorLoadingTxt: { fontSize: 13, color: "#9ca3af" },
    operatorPickerHint: { fontSize: 12, color: "#6b7280", marginBottom: 10, marginTop: 4 },

    operatorCard: {
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10,
        borderWidth: 1.5, borderColor: "#e5e7eb",
    },
    operatorCardSelected: {
        borderColor: "#15803d", backgroundColor: "#f0fdf4",
    },
    operatorCardManual: {
        borderColor: "#d97706", backgroundColor: "#fffbeb",
    },
    operatorIcon: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    operatorCardName: { fontSize: 14, fontWeight: "700", color: "#111827" },
    operatorCardAddr: { fontSize: 11, color: "#9ca3af" },
    operatorCheck: {
        width: 26, height: 26, borderRadius: 13, backgroundColor: "#15803d",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
    },

    // Upload
    uploadBox:     { backgroundColor: "#fff", borderRadius: 16, borderWidth: 2, borderColor: "#e5e7eb", borderStyle: "dashed", height: 140, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    uploadBoxDone: { borderStyle: "solid", borderColor: "#15803d" },
    uploadPreview: { width: "100%", height: "100%", resizeMode: "cover" },
    uploadLabel:   { fontSize: 14, fontWeight: "700", color: "#15803d", marginTop: 10 },
    uploadHint:    { fontSize: 11, color: "#9ca3af", marginTop: 4 },
    uploadBadge:   { position: "absolute", top: 8, right: 8, backgroundColor: "#15803d", borderRadius: 12, padding: 4 },

    // Info box
    infoBox:   { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#f8fafc", borderRadius: 12, padding: 12 },
    infoTxt:   { flex: 1, fontSize: 12, color: "#6b7280", lineHeight: 18 },

    // ToS
    tosBox:      { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", padding: 16, marginBottom: 16 },
    tosSection:  { fontSize: 13, fontWeight: "800", color: "#111827", marginTop: 14, marginBottom: 4 },
    tosPara:     { fontSize: 12, color: "#6b7280", lineHeight: 18, marginBottom: 4 },
    tosBullet:   { fontSize: 12, color: "#6b7280", lineHeight: 18, paddingLeft: 8 },
    summaryBox:  { backgroundColor: "#f0fdf4", borderRadius: 14, padding: 14, marginBottom: 16 },
    summaryTitle:{ fontSize: 12, fontWeight: "800", color: "#15803d", marginBottom: 8 },
    summaryRow:  { fontSize: 12, color: "#374151", marginBottom: 4, lineHeight: 18 },
    summaryKey:  { fontWeight: "700" },

    tosCheckRow:     { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 4 },
    checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#d1d5db", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 },
    checkboxChecked: { backgroundColor: "#15803d", borderColor: "#15803d" },
    tosCheckLabel:   { flex: 1, fontSize: 13, color: "#374151", lineHeight: 20 },

    navRow:    { marginTop: 28 },
    nextBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#15803d", borderRadius: 16, paddingVertical: 16 },
    nextBtnTxt:{ color: "white", fontWeight: "800", fontSize: 16 },
    submitBtn: { backgroundColor: "#166534" },
});
import React, { useState } from "react";
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Alert, ActivityIndicator, Image, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
    Camera, FileText, User, Mail, Lock, ArrowLeft,
    Upload, CheckCircle, AlertCircle, CreditCard
} from "lucide-react-native";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { ref, set } from "firebase/database";
import { auth, db } from "../services/firebase";

type UploadType = "license" | "id";

interface UploadBoxProps {
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    imageBase64: string | null;
    onPress: () => void;
}

function UploadBox({ label, subtitle, icon, imageBase64, onPress }: UploadBoxProps) {
    return (
        <TouchableOpacity style={s.uploadBox} onPress={onPress} activeOpacity={0.8}>
            {imageBase64 ? (
                <View style={s.uploadedContainer}>
                    <Image
                        source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                        style={s.uploadPreview}
                        resizeMode="cover"
                    />
                    <View style={s.uploadedBadge}>
                        <CheckCircle color="white" size={14} />
                        <Text style={s.uploadedBadgeText}>Uploaded</Text>
                    </View>
                </View>
            ) : (
                <View style={s.uploadPlaceholder}>
                    <View style={s.uploadIconCircle}>{icon}</View>
                    <Text style={s.uploadLabel}>{label}</Text>
                    <Text style={s.uploadSub}>{subtitle}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

export default function DriverRegistration() {
    const router = useRouter();

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [licenseNumber, setLicenseNumber] = useState("");
    const [licenseImage, setLicenseImage] = useState<string | null>(null);
    const [idImage, setIdImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);

    const pickImage = async (type: UploadType) => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission needed", "Please allow access to your photo library.");
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [3, 2],
            quality: 0.2,
            base64: true,
        });
        if (!result.canceled && result.assets[0].base64) {
            if (type === "license") setLicenseImage(result.assets[0].base64);
            else setIdImage(result.assets[0].base64);
        }
    };

    const validateStep1 = () => {
        if (!fullName.trim()) { Alert.alert("Missing Field", "Please enter your full name."); return false; }
        if (!email.trim()) { Alert.alert("Missing Field", "Please enter your email."); return false; }
        if (!password) { Alert.alert("Missing Field", "Please enter a password."); return false; }
        if (password.length < 6) { Alert.alert("Weak Password", "Password must be at least 6 characters."); return false; }
        if (password !== confirmPassword) { Alert.alert("Password Mismatch", "Passwords do not match."); return false; }
        return true;
    };

    const handleNext = () => {
        if (validateStep1()) setStep(2);
    };

    const handleRegister = async () => {
        if (!licenseNumber.trim()) { Alert.alert("Missing Field", "Please enter your license number."); return; }
        if (!licenseImage) { Alert.alert("Missing Document", "Please upload your driver's license photo."); return; }
        if (!idImage) { Alert.alert("Missing Document", "Please upload a government ID photo."); return; }

        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;

            await set(ref(db, `users/${uid}`), {
                username: fullName,
                email: email,
                role: "pending_driver",
                createdAt: Date.now(),
            });

            await set(ref(db, `pending_registrations/${uid}`), {
                uid,
                fullName,
                email,
                licenseNumber: licenseNumber.toUpperCase(),
                licenseImage: `data:image/jpeg;base64,${licenseImage}`,
                idImage: `data:image/jpeg;base64,${idImage}`,
                status: "pending",
                submittedAt: Date.now(),
            });

            await signOut(auth);

            Alert.alert(
                "Application Submitted! 🎉",
                "Your registration is under review. You'll be able to log in once an admin approves your application.",
                [{ text: "Back to Login", onPress: () => router.replace("/login") }]
            );
        } catch (error: any) {
            if (error.code === "auth/email-already-in-use") {
                Alert.alert("Email Taken", "This email is already registered.");
            } else {
                Alert.alert("Registration Failed", error.message ?? "Something went wrong.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.topBar}>
                <TouchableOpacity
                    onPress={() => (step === 2 ? setStep(1) : router.back())}
                    style={s.backBtn}
                >
                    <ArrowLeft color="#15803d" size={22} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.topTitle}>Driver Registration</Text>
                    <Text style={s.topSub}>Step {step} of 2</Text>
                </View>
                {/* Progress dots */}
                <View style={s.stepDots}>
                    <View style={[s.dot, step >= 1 && s.dotActive]} />
                    <View style={[s.dot, step >= 2 && s.dotActive]} />
                </View>
            </View>

            {/* Progress bar */}
            <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: step === 1 ? "50%" : "100%" }]} />
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {step === 1 ? (
                    /* ─── STEP 1: Personal Info ─── */
                    <View>
                        <View style={s.stepHeader}>
                            <View style={s.stepIconCircle}>
                                <User color="#15803d" size={24} />
                            </View>
                            <View>
                                <Text style={s.stepTitle}>Personal Information</Text>
                                <Text style={s.stepDesc}>Your basic account details</Text>
                            </View>
                        </View>

                        <View style={s.card}>
                            <FieldRow
                                icon={<User color="#9ca3af" size={16} />}
                                label="Full Name"
                                placeholder="e.g. Juan dela Cruz"
                                value={fullName}
                                onChangeText={setFullName}
                                autoCapitalize="words"
                            />
                            <FieldRow
                                icon={<Mail color="#9ca3af" size={16} />}
                                label="Email Address"
                                placeholder="your@email.com"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                            <FieldRow
                                icon={<Lock color="#9ca3af" size={16} />}
                                label="Password"
                                placeholder="At least 6 characters"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                            />
                            <FieldRow
                                icon={<Lock color="#9ca3af" size={16} />}
                                label="Confirm Password"
                                placeholder="Re-enter password"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry
                                isLast
                            />
                        </View>

                        <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.85}>
                            <Text style={s.nextBtnText}>Next: Upload Documents →</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    /* ─── STEP 2: Documents ─── */
                    <View>
                        <View style={s.stepHeader}>
                            <View style={s.stepIconCircle}>
                                <FileText color="#15803d" size={24} />
                            </View>
                            <View>
                                <Text style={s.stepTitle}>Documents & License</Text>
                                <Text style={s.stepDesc}>Required for verification</Text>
                            </View>
                        </View>

                        <View style={s.card}>
                            <FieldRow
                                icon={<CreditCard color="#9ca3af" size={16} />}
                                label="Driver's License Number"
                                placeholder="e.g. A01-23-456789"
                                value={licenseNumber}
                                onChangeText={setLicenseNumber}
                                autoCapitalize="characters"
                                isLast
                            />
                        </View>

                        <Text style={s.uploadSectionLabel}>Driver&apos;s License Photo</Text>
                        <Text style={s.uploadSectionSub}>Clear photo of the front side</Text>
                        <UploadBox
                            label="Upload License Photo"
                            subtitle="Tap to choose from gallery"
                            icon={<Camera color="#15803d" size={26} />}
                            imageBase64={licenseImage}
                            onPress={() => pickImage("license")}
                        />

                        <Text style={s.uploadSectionLabel}>Government ID Photo</Text>
                        <Text style={s.uploadSectionSub}>Any valid government-issued ID</Text>
                        <UploadBox
                            label="Upload Government ID"
                            subtitle="PhilSys, Passport, UMID, etc."
                            icon={<Upload color="#15803d" size={26} />}
                            imageBase64={idImage}
                            onPress={() => pickImage("id")}
                        />

                        {/* Info box */}
                        <View style={s.infoBox}>
                            <AlertCircle color="#d97706" size={16} style={{ marginTop: 1 }} />
                            <Text style={s.infoBoxText}>
                                Your documents are reviewed securely by admins only. Your application will be processed within 1–2 business days.
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={[s.submitBtn, loading && { opacity: 0.6 }]}
                            onPress={handleRegister}
                            disabled={loading}
                            activeOpacity={0.85}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={s.submitBtnText}>Submit Application 🚌</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function FieldRow({ icon, label, placeholder, value, onChangeText, isLast = false, ...rest }: any) {
    return (
        <View style={[s.fieldRow, !isLast && s.fieldRowBorder]}>
            <Text style={s.fieldLabel}>{label}</Text>
            <View style={s.fieldInput}>
                {icon}
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor="#d1d5db"
                    style={s.fieldTextInput}
                    {...rest}
                />
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f0fdf4" },
    topBar: {
        flexDirection: "row", alignItems: "center", paddingHorizontal: 20,
        paddingTop: 12, paddingBottom: 14, backgroundColor: "#fff",
        borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12, backgroundColor: "#f0fdf4",
        alignItems: "center", justifyContent: "center", marginRight: 12,
    },
    topTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
    topSub: { fontSize: 12, color: "#6b7280" },
    stepDots: { flexDirection: "row", gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#d1d5db" },
    dotActive: { backgroundColor: "#15803d" },
    progressTrack: { height: 3, backgroundColor: "#e5e7eb" },
    progressFill: { height: 3, backgroundColor: "#15803d", borderRadius: 2 },

    scroll: { padding: 20, paddingBottom: 48 },

    stepHeader: {
        flexDirection: "row", alignItems: "center", gap: 14,
        marginBottom: 20,
    },
    stepIconCircle: {
        width: 52, height: 52, borderRadius: 16,
        backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center",
    },
    stepTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
    stepDesc: { fontSize: 13, color: "#6b7280", marginTop: 2 },

    card: {
        backgroundColor: "#fff", borderRadius: 20, marginBottom: 20,
        borderWidth: 1, borderColor: "#e5e7eb",
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
        overflow: "hidden",
    },
    fieldRow: { paddingHorizontal: 18, paddingVertical: 14 },
    fieldRowBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
    fieldLabel: { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 },
    fieldInput: { flexDirection: "row", alignItems: "center", gap: 8 },
    fieldTextInput: { flex: 1, fontSize: 15, color: "#111827", paddingVertical: 2 },

    uploadSectionLabel: { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 4, marginTop: 4 },
    uploadSectionSub: { fontSize: 12, color: "#6b7280", marginBottom: 10 },
    uploadBox: {
        height: 150, borderRadius: 18, borderWidth: 2, borderColor: "#bbf7d0",
        borderStyle: "dashed", overflow: "hidden", marginBottom: 20,
        backgroundColor: "#fff",
    },
    uploadedContainer: { flex: 1 },
    uploadPreview: { width: "100%", height: "100%" },
    uploadedBadge: {
        position: "absolute", top: 10, right: 10,
        backgroundColor: "#15803d", borderRadius: 20,
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 10, paddingVertical: 5,
    },
    uploadedBadgeText: { color: "white", fontSize: 11, fontWeight: "700" },
    uploadPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
    uploadIconCircle: {
        width: 56, height: 56, borderRadius: 28, backgroundColor: "#f0fdf4",
        alignItems: "center", justifyContent: "center", marginBottom: 4,
    },
    uploadLabel: { fontSize: 14, fontWeight: "700", color: "#15803d" },
    uploadSub: { fontSize: 12, color: "#9ca3af" },

    infoBox: {
        flexDirection: "row", gap: 10, backgroundColor: "#fefce8",
        borderRadius: 14, padding: 14, marginBottom: 20,
        borderWidth: 1, borderColor: "#fde68a", alignItems: "flex-start",
    },
    infoBoxText: { flex: 1, fontSize: 12, color: "#92400e", lineHeight: 18 },

    nextBtn: {
        backgroundColor: "#15803d", borderRadius: 16, paddingVertical: 18,
        alignItems: "center", marginTop: 4,
        shadowColor: "#15803d", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    nextBtnText: { color: "white", fontWeight: "800", fontSize: 16 },
    submitBtn: {
        backgroundColor: "#15803d", borderRadius: 16, paddingVertical: 18,
        alignItems: "center",
        shadowColor: "#15803d", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    submitBtnText: { color: "white", fontWeight: "800", fontSize: 16 },
});
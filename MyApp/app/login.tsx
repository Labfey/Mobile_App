import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ArrowRight, Lock, Mail, MapPin } from "lucide-react-native"; 
import { auth, signInWithEmailAndPassword, db, ref, get, signOut } from "../services/firebase"; 

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert("Missing Info", "Please enter both email and password.");
            return;
        }
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const snapshot = await get(ref(db, `users/${user.uid}`));

            if (snapshot.exists() && snapshot.val().role === 'driver') {
                router.replace("/(tabs)");
            } else {
                await signOut(auth); 
                Alert.alert("Access Denied", "Only drivers can log in. Commuters please use the button below.");
                setLoading(false);
            }
        } catch (error) {
            Alert.alert("Login Failed", "Invalid credentials.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <Text style={s.title}>JeepRoute</Text>
                <Text style={s.subtitle}>Baguio City Transit System</Text>
            </View>

            {/* --- BIG COMMUTER CHOICE --- */}
            <View style={s.commuterSection}>
                <Text style={s.sectionLabel}>ARE YOU A COMMUTER?</Text>
                <TouchableOpacity 
                    onPress={() => router.replace("/(tabs)")} 
                    style={s.guestButton}
                    activeOpacity={0.7}
                >
                    <View style={s.guestBtnContent}>
                        <View style={s.iconCircle}>
                            <MapPin color="white" size={24} />
                        </View>
                        <View style={s.guestTextContainer}>
                            <Text style={s.guestTextMain}>Track Live Jeeps</Text>
                            <Text style={s.guestTextSub}>No account required</Text>
                        </View>
                        <ArrowRight color="#15803d" size={20} />
                    </View>
                </TouchableOpacity>
            </View>

            <View style={s.dividerContainer}>
                <View style={s.divider} />
                <Text style={s.dividerText}>STAFF ONLY</Text>
                <View style={s.divider} />
            </View>

            {/* --- DRIVER LOGIN --- */}
            <View style={s.form}>
                <View style={s.inputGroup}>
                    <View style={s.inputContainer}>
                        <Mail color="#6b7280" size={18} />
                        <TextInput
                            style={s.input}
                            placeholder="Driver Email"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            placeholderTextColor="#9ca3af"
                        />
                    </View>
                </View>

                <View style={s.inputGroup}>
                    <View style={s.inputContainer}>
                        <Lock color="#6b7280" size={18} />
                        <TextInput
                            style={s.input}
                            placeholder="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            placeholderTextColor="#9ca3af"
                        />
                    </View>
                </View>

                <TouchableOpacity 
                    onPress={handleLogin} 
                    style={s.loginButton} 
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={s.loginButtonText}>Driver Log In</Text>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff', padding: 24, justifyContent: 'center' },
    header: { marginBottom: 40, alignItems: 'center' },
    title: { fontSize: 42, fontWeight: '900', color: '#15803d' },
    subtitle: { fontSize: 16, color: '#6b7280' },

    commuterSection: { marginBottom: 10 },
    sectionLabel: { fontSize: 12, fontWeight: '800', color: '#9ca3af', marginBottom: 10, textAlign: 'center' },
    guestButton: { 
        backgroundColor: '#f0fdf4', 
        borderRadius: 24, 
        borderWidth: 2, 
        borderColor: '#15803d',
        padding: 16
    },
    guestBtnContent: {
        flexDirection: 'row', 
        alignItems: 'center',
    },
    iconCircle: { backgroundColor: '#15803d', padding: 10, borderRadius: 12, marginRight: 15 },
    guestTextContainer: { flex: 1 },
    guestTextMain: { color: '#15803d', fontSize: 20, fontWeight: '800' },
    guestTextSub: { color: '#166534', fontSize: 13, opacity: 0.7 },

    dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 30 },
    divider: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
    dividerText: { marginHorizontal: 15, color: '#9ca3af', fontWeight: '700', fontSize: 11 },

    form: { width: '100%' },
    inputGroup: { marginBottom: 12 },
    inputContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#f9fafb', 
        borderRadius: 12, 
        paddingHorizontal: 16, 
        height: 54, 
        borderWidth: 1, 
        borderColor: '#e5e7eb' 
    },
    input: { flex: 1, marginLeft: 10, fontSize: 16, color: '#111827' },
    loginButton: { 
        backgroundColor: '#15803d', 
        height: 54, 
        borderRadius: 12, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginTop: 10 
    },
    loginButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ArrowRight, Lock, Mail } from "lucide-react-native";
import { auth, signInWithEmailAndPassword, db, ref, get, signOut } from "../services/firebase"; 


export default function LoginScreen() {
    const router = useRouter();
    
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [loginRole, setLoginRole] = useState<'passenger' | 'driver'>('passenger'); 

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert("Missing Info", "Please enter both email and password.");
            return;
        }

        setLoading(true);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const userRef = ref(db, `users/${user.uid}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                const actualRole = userData.role || 'passenger'; 

                if (loginRole === 'driver' && actualRole !== 'driver') {
                    await signOut(auth); 
                    Alert.alert("Access Denied", "This account is not registered as a Driver.");
                    setLoading(false);
                    return;
                }
                
                if (loginRole === 'passenger' && actualRole === 'driver') {
                    await signOut(auth); 
                    Alert.alert("Access Denied", "This is a Driver account. Please select 'Driver' to log in.");
                    setLoading(false);
                    return;
                }

                router.replace("/(tabs)");
            } else {
                Alert.alert("Error", "User data not found. Please register or contact support.");
                await signOut(auth);
            }
            
        } catch (error: any) {
            console.error("Login Error:", error); 
            Alert.alert("Login Failed", "Invalid email or password.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={s.container}>
            
            <View style={s.header}>
                <Text style={s.title}>JeepRoute</Text>
                <Text style={s.subtitle}>Log in to continue</Text>
            </View>

            {/* --- ROLE SELECTOR --- */}
            <View style={s.roleContainer}>
                <TouchableOpacity 
                    onPress={() => setLoginRole('passenger')}
                    style={[s.roleBtn, loginRole === 'passenger' && s.roleBtnActive]}
                >
                    <Text style={[s.roleText, loginRole === 'passenger' && s.roleTextActive]}>Passenger</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                    onPress={() => setLoginRole('driver')}
                    style={[s.roleBtn, loginRole === 'driver' && s.roleBtnActive]}
                >
                    <Text style={[s.roleText, loginRole === 'driver' && s.roleTextActive]}>Driver</Text>
                </TouchableOpacity>
            </View>

            <View style={s.form}>
                {/* Email Input */}
                <View style={s.inputGroup}>
                    <Text style={s.label}>Email Address</Text>
                    <View style={s.inputContainer}>
                        <Mail color="#6b7280" size={20} />
                        <TextInput
                            style={s.input}
                            placeholder={loginRole === 'driver' ? "driver@jeeproute.ph" : "juan@example.com"}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>
                </View>

                {/* Password Input */}
                <View style={s.inputGroup}>
                    <Text style={s.label}>Password</Text>
                    <View style={s.inputContainer}>
                        <Lock color="#6b7280" size={20} />
                        <TextInput
                            style={s.input}
                            placeholder="••••••••"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                    </View>
                </View>

                <TouchableOpacity onPress={handleLogin} style={s.loginButton} disabled={loading}>
                    {loading ? <ActivityIndicator color="white" /> : (
                        <>
                            <Text style={s.loginButtonText}>Log In as {loginRole === 'driver' ? 'Driver' : 'Passenger'}</Text>
                            <ArrowRight color="white" size={22} />
                        </>
                    )}
                </TouchableOpacity>

                <View style={s.footer}>
                    <Text style={s.footerText}>Don&apos;t have an account? </Text>
                    <TouchableOpacity onPress={() => router.push("/register" as any)}>
                        <Text style={s.linkText}>Sign Up</Text>
                    </TouchableOpacity>
                </View>
                
                <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={s.guestButton}>
                    <Text style={s.guestText}>Continue as Guest</Text>
                </TouchableOpacity>

            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', padding: 24 },
    header: { marginBottom: 30 },
    title: { fontSize: 36, fontWeight: '800', color: '#15803d', marginBottom: 8 },
    subtitle: { fontSize: 18, color: '#6b7280' },
    
    // Role Styles
    roleContainer: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 25 },
    roleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
    roleBtnActive: { backgroundColor: '#15803d' },
    roleText: { fontWeight: '600', color: '#6b7280' },
    roleTextActive: { color: 'white' },

    form: { width: '100%' },
    inputGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#e5e7eb' },
    input: { flex: 1, marginLeft: 12, fontSize: 16, color: '#1f2937' },
    loginButton: { backgroundColor: '#15803d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, marginTop: 10, shadowColor: '#15803d', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    loginButtonText: { color: 'white', fontSize: 18, fontWeight: '700', marginRight: 8 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
    footerText: { color: '#6b7280', fontSize: 15 },
    linkText: { color: '#15803d', fontWeight: '700', fontSize: 15 },
    guestButton: { marginTop: 24, alignItems: 'center' },
    guestText: { color: '#9ca3af', fontSize: 14, fontWeight: '500' }
});
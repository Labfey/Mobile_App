import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ArrowRight, Lock, Mail } from "lucide-react-native";
import { auth, signInWithEmailAndPassword } from "../services/firebase";

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/(tabs)");
      
    } catch (error: any) {
      console.error(error);
      let msg = "Invalid email or password.";
      
      if (error.code === 'auth/invalid-email') msg = "That email address looks invalid.";
      if (error.code === 'auth/user-not-found') msg = "No account found with this email.";
      if (error.code === 'auth/wrong-password') msg = "Incorrect password.";
      if (error.code === 'auth/too-many-requests') msg = "Too many failed attempts. Try again later.";
      
      Alert.alert("Login Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      
      {/* Header Section */}
      <View style={s.header}>
        <Text style={s.title}>JeepRoute</Text>
        <Text style={s.subtitle}>Welcome back, passenger!</Text>
      </View>

      {/* Form Container */}
      <View style={s.form}>
        
        {/* Email Input */}
        <View style={s.inputGroup}>
          <Text style={s.label}>Email Address</Text>
          <View style={s.inputContainer}>
            <Mail color="#6b7280" size={20} />
            <TextInput
              style={s.input}
              placeholder="juan@example.com"
              placeholderTextColor="#9ca3af"
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
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        </View>

        {/* Login Button */}
        <TouchableOpacity
          onPress={handleLogin}
          style={s.loginButton}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={s.loginButtonText}>Log In</Text>
              <ArrowRight color="white" size={22} />
            </>
          )}
        </TouchableOpacity>

        {/* Register Link */}
        <View style={s.footer}>
          <Text style={s.footerText}>Don&apos;t have an account? </Text>
          <TouchableOpacity onPress={() => router.push("/register" as any)}>
            <Text style={s.linkText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
        
        {/* Guest Mode Link */}
        <TouchableOpacity 
          onPress={() => router.replace("/(tabs)")}
          style={s.guestButton}
        >
          <Text style={s.guestText}>Continue as Guest</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#15803d', // Green-700
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280', // Gray-500
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151', // Gray-700
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6', // Gray-100
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#e5e7eb', // Gray-200
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1f2937', // Gray-800
  },
  loginButton: {
    backgroundColor: '#15803d', // Green-700
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    marginTop: 10,
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#6b7280',
    fontSize: 15,
  },
  linkText: {
    color: '#15803d',
    fontWeight: '700',
    fontSize: 15,
  },
  guestButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  guestText: {
    color: '#9ca3af', // Gray-400
    fontSize: 14,
    fontWeight: '500',
  }
});
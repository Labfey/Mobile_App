import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
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
    <SafeAreaView className="flex-1 bg-white justify-center p-6">
      
      {/* Header Section */}
      <View className="mb-10">
        <Text className="text-4xl font-extrabold text-green-800">JeepRoute</Text>
        <Text className="text-gray-500 text-lg mt-2">Welcome back, passenger!</Text>
      </View>

      {/* Email Input */}
      <View className="mb-4">
        <Text className="text-gray-600 mb-2 font-medium">Email Address</Text>
        <View className="flex-row items-center bg-gray-100 rounded-xl px-4 border border-gray-200 focus:border-green-500">
          <Mail color="gray" size={20} />
          <TextInput
            className="flex-1 p-4 text-gray-800"
            placeholder="juan@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
      </View>

      {/* Password Input */}
      <View className="mb-8">
        <Text className="text-gray-600 mb-2 font-medium">Password</Text>
        <View className="flex-row items-center bg-gray-100 rounded-xl px-4 border border-gray-200">
          <Lock color="gray" size={20} />
          <TextInput
            className="flex-1 p-4 text-gray-800"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>
      </View>

      {/* Login Button */}
      <TouchableOpacity
        onPress={handleLogin}
        className="bg-green-700 p-4 rounded-xl flex-row justify-center items-center shadow-sm"
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Text className="text-white font-bold text-lg mr-2">Log In</Text>
            <ArrowRight color="white" size={22} />
          </>
        )}
      </TouchableOpacity>

      {/* Register Link */}
      <View className="flex-row justify-center mt-8">
        <Text className="text-gray-500">Don&apos;t have an account? </Text>
        {/* We use 'as any' here to prevent TS error if register.tsx doesn't exist yet */}
        <TouchableOpacity onPress={() => router.push("/register" as any)}>
          <Text className="text-green-700 font-bold">Sign Up</Text>
        </TouchableOpacity>
      </View>
      
      {/* Guest Mode Link */}
      <TouchableOpacity 
        onPress={() => router.replace("/(tabs)")}
        className="mt-6 items-center"
      >
        <Text className="text-gray-400 text-sm">Continue as Guest</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
}
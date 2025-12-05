import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useState } from "react";
import { useRouter } from "expo-router";
// ✅ Import Auth & Database tools
import { auth, db, ref, set, createUserWithEmailAndPassword } from "../services/firebase";

export default function RegisterScreen() {
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    // 1. Basic Validation (Empty Fields)
    if (!name || !email || !password) {
      Alert.alert("Missing Info", "Please fill in all fields.");
      return;
    }

    // 2. Email Validation (Regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    // 3. Password Strength (Min 6 chars)
    if (password.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      // 4. Create User in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 5. Create User Profile in Realtime Database
      // We use the unique 'uid' from Auth as the key
      await set(ref(db, 'users/' + user.uid), {
        username: name,
        email: email,
        role: 'passenger', // Default role
        createdAt: Date.now()
      });

      // 6. Success! Go to Home
      Alert.alert("Success", "Account created!", [
        { text: "OK", onPress: () => router.replace("/(tabs)") }
      ]);

    } catch (error: any) {
      console.error(error);
      let msg = error.message;
      
      // Handle Firebase-specific errors
      if (error.code === 'auth/email-already-in-use') msg = "That email is already registered.";
      if (error.code === 'auth/invalid-email') msg = "That email address looks invalid.";
      
      Alert.alert("Registration Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white justify-center p-6">
      <Text className="text-3xl font-bold text-green-800 mb-2">Create Account</Text>
      <Text className="text-gray-500 mb-8">Join JeepRoute today</Text>

      <Text className="text-gray-500 mb-2">Full Name</Text>
      <TextInput
        className="bg-gray-100 p-4 rounded-xl mb-4 text-gray-800"
        placeholder="Juan Dela Cruz"
        value={name}
        onChangeText={setName}
      />

      <Text className="text-gray-500 mb-2">Email</Text>
      <TextInput
        className="bg-gray-100 p-4 rounded-xl mb-4 text-gray-800"
        placeholder="user@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text className="text-gray-500 mb-2">Password</Text>
      <TextInput
        className="bg-gray-100 p-4 rounded-xl mb-8 text-gray-800"
        placeholder="••••••"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        onPress={handleRegister}
        className="bg-green-700 p-4 rounded-xl items-center mb-4 shadow-sm"
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-bold text-lg">Sign Up</Text>
        )}
      </TouchableOpacity>

      <View className="flex-row justify-center mt-4">
        <Text className="text-gray-500">Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push("/login" as any)}>
          <Text className="text-green-700 font-bold">Log In</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useState } from "react";
import { useRouter } from "expo-router";
import { auth, db, ref, set, createUserWithEmailAndPassword } from "../services/firebase";

export default function RegisterScreen() {
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert("Missing Info", "Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // FORCE ROLE TO 'PASSENGER'
      await set(ref(db, 'users/' + user.uid), {
        username: name,
        email: email,
        role: 'passenger', 
        createdAt: Date.now()
      });

      Alert.alert("Success", "Account created! Welcome aboard.", [
        { text: "OK", onPress: () => router.replace("/(tabs)") }
      ]);

    } catch (error: any) {
      Alert.alert("Registration Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white justify-center p-6">
      <Text className="text-3xl font-bold text-green-800 mb-2">Create Account</Text>
      <Text className="text-gray-500 mb-8">Sign up to ride with JeepRoute</Text>

      

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
        className="bg-green-700 p-4 rounded-xl items-center mb-4"
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Sign Up</Text>}
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
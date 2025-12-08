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
  const [role, setRole] = useState<'passenger' | 'driver'>('passenger');
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

      // Save user with their selected ROLE
      await set(ref(db, 'users/' + user.uid), {
        username: name,
        email: email,
        role: role, 
        createdAt: Date.now()
      });

      Alert.alert("Success", `Welcome, ${role === 'driver' ? 'Driver' : 'Passenger'}!`, [
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
      <Text className="text-gray-500 mb-8">Join JeepRoute today</Text>

      {/* ROLE SELECTOR */}
      <View className="flex-row mb-6 bg-gray-100 p-1 rounded-xl">
        <TouchableOpacity 
          onPress={() => setRole('passenger')}
          className={`flex-1 p-3 rounded-lg items-center ${role === 'passenger' ? 'bg-green-700' : 'bg-transparent'}`}
        >
          <Text className={`font-bold ${role === 'passenger' ? 'text-white' : 'text-gray-500'}`}>Passenger</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setRole('driver')}
          className={`flex-1 p-3 rounded-lg items-center ${role === 'driver' ? 'bg-green-700' : 'bg-transparent'}`}
        >
          <Text className={`font-bold ${role === 'driver' ? 'text-white' : 'text-gray-500'}`}>Driver</Text>
        </TouchableOpacity>
      </View>

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
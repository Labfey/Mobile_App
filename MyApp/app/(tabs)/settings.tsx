import { View, Text, Switch, TouchableOpacity, Alert, ScrollView, Modal, TextInput } from "react-native";
import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeContext";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native"; 

const JEEP_GREEN = "#2E7D32";

export default function Settings() {
  const { darkMode, setDarkMode } = useTheme();
  const router = useRouter();

  const [name, setName] = useState("Juan Dela Cruz");
  const [email, setEmail] = useState("juan@jeeproute.ph");


  const [modalType, setModalType] = useState<'none' | 'profile' | 'password'>('none');
  

  const [tempName, setTempName] = useState(name);
  const [tempEmail, setTempEmail] = useState(email);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");



  const openProfileModal = () => {
    setTempName(name);
    setTempEmail(email);
    setModalType('profile');
  };

  const saveProfile = () => {
    if (!tempName.trim()) {
      Alert.alert("Error", "Name cannot be empty.");
      return;
    }


    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(tempEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address (e.g., user@example.com).");
      return;
    }

    setName(tempName);
    setEmail(tempEmail);
    setModalType('none');
    Alert.alert("Success", "Profile updated successfully!");
  };

  const savePassword = () => {
    if (!oldPass || !newPass) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (newPass.length < 6) {
      Alert.alert("Weak Password", "New password must be at least 6 characters long.");
      return;
    }
    setModalType('none');
    setOldPass("");
    setNewPass("");
    Alert.alert("Success", "Password changed successfully!");
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Log Out", 
        style: "destructive", 
        onPress: () => router.replace("/login" as any) 
      }
    ]);
  };


  const bgClass = darkMode ? "bg-black" : "bg-gray-100";
  const cardClass = darkMode ? "bg-gray-800" : "bg-white";
  const textClass = darkMode ? "text-white" : "text-gray-900";
  const subTextClass = darkMode ? "text-gray-400" : "text-gray-500";
  const inputBgClass = darkMode ? "bg-gray-700 text-white" : "bg-gray-100 text-black";

  return (
    <SafeAreaView className={`flex-1 ${bgClass}`}>
      <ScrollView className="px-6 py-4">

        <Text className={`text-3xl font-bold mb-6 ${textClass}`}>Settings</Text>

        {/* --- APPEARANCE CARD --- */}
        <View className={`p-5 rounded-3xl mb-5 ${cardClass}`}>
          <Text className={`text-lg font-semibold mb-4 ${textClass}`}>Appearance</Text>
          <View className="flex-row items-center justify-between py-3">
            <Text className={`text-base ${textClass}`}>Dark Mode</Text>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: "#ccc", true: JEEP_GREEN }}
              thumbColor={darkMode ? "#fff" : "#f4f4f4"}
            />
          </View>
        </View>

        {/* --- ACCOUNT CARD --- */}
        <View className={`p-5 rounded-3xl mb-5 ${cardClass}`}>
          <Text className={`text-lg font-semibold mb-2 ${textClass}`}>Account</Text>
          
          {/* Show current user info to prove edits work */}
          <View className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <Text className={`font-bold text-lg ${textClass}`}>{name}</Text>
            <Text className={`text-sm ${subTextClass}`}>{email}</Text>
          </View>

          <TouchableOpacity className="py-3" onPress={openProfileModal}>
            <Text className={`text-base ${textClass}`}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity className="py-3" onPress={() => setModalType('password')}>
            <Text className={`text-base ${textClass}`}>Change Password</Text>
          </TouchableOpacity>
          
          <TouchableOpacity className="py-3 mt-2" onPress={handleLogout}>
            <Text className="text-red-500 font-bold text-base">Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* --- SUPPORT CARD --- */}
        <View className={`p-5 rounded-3xl mb-5 ${cardClass}`}>
          <Text className={`text-lg font-semibold mb-4 ${textClass}`}>Support</Text>
          <TouchableOpacity className="py-3" onPress={() => Alert.alert("Help", "Opening Help Center...")}>
            <Text className={`text-base ${textClass}`}>Help Center</Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-3" onPress={() => Alert.alert("Report", "Opening Report Form...")}>
            <Text className={`text-base ${textClass}`}>Report a Problem</Text>
          </TouchableOpacity>
        </View>

        <Text className={`text-center mb-10 ${subTextClass}`}>JeepRoute Demo v1.1</Text>
      </ScrollView>



      {/* 1. EDIT PROFILE MODAL */}
      <Modal visible={modalType === 'profile'} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/50">
          <View className={`p-6 rounded-t-3xl ${cardClass} h-[60%]`}>
            
            {/* Modal Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-xl font-bold ${textClass}`}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setModalType('none')}>
                <X size={24} color={darkMode ? "white" : "black"} />
              </TouchableOpacity>
            </View>

            {/* Inputs */}
            <Text className={`mb-2 ${textClass}`}>Full Name</Text>
            <TextInput 
              value={tempName}
              onChangeText={setTempName}
              className={`p-4 rounded-xl mb-4 ${inputBgClass}`}
              placeholder="Enter your name"
              placeholderTextColor="#999"
            />

            <Text className={`mb-2 ${textClass}`}>Email Address</Text>
            <TextInput 
              value={tempEmail}
              onChangeText={setTempEmail}
              className={`p-4 rounded-xl mb-6 ${inputBgClass}`}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="Enter your email"
              placeholderTextColor="#999"
            />

            {/* Save Button */}
            <TouchableOpacity onPress={saveProfile} className="bg-green-700 p-4 rounded-xl items-center">
              <Text className="text-white font-bold text-lg">Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2. CHANGE PASSWORD MODAL */}
      <Modal visible={modalType === 'password'} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/50">
          <View className={`p-6 rounded-t-3xl ${cardClass} h-[50%]`}>
            
            <View className="flex-row justify-between items-center mb-6">
              <Text className={`text-xl font-bold ${textClass}`}>Change Password</Text>
              <TouchableOpacity onPress={() => setModalType('none')}>
                <X size={24} color={darkMode ? "white" : "black"} />
              </TouchableOpacity>
            </View>

            <Text className={`mb-2 ${textClass}`}>Current Password</Text>
            <TextInput 
              value={oldPass}
              onChangeText={setOldPass}
              secureTextEntry
              className={`p-4 rounded-xl mb-4 ${inputBgClass}`}
              placeholder="Current password"
              placeholderTextColor="#999"
            />

            <Text className={`mb-2 ${textClass}`}>New Password</Text>
            <TextInput 
              value={newPass}
              onChangeText={setNewPass}
              secureTextEntry
              className={`p-4 rounded-xl mb-6 ${inputBgClass}`}
              placeholder="New password (min 6 chars)"
              placeholderTextColor="#999"
            />

            <TouchableOpacity onPress={savePassword} className="bg-green-700 p-4 rounded-xl items-center">
              <Text className="text-white font-bold text-lg">Update Password</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
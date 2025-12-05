import { View, Text, Image, TouchableOpacity, ScrollView, Alert, Modal, TextInput, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useState } from "react";
import { useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ComponentProps } from "react";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";

type FontAwesomeName = ComponentProps<typeof FontAwesome>['name'];

interface SettingsRowProps {
  icon: FontAwesomeName;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}

export default function Profile() {
  const { darkMode } = useTheme();
  const router = useRouter();
  
  // --- USER DATA STATE ---
  const [userEmail, setUserEmail] = useState("juan@jeeproute.ph");
  const [userName, setUserName] = useState("Juan Dela Cruz");

  // --- MODAL VISIBILITY ---
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  // --- EDIT PROFILE FORM STATE ---
  const [tempName, setTempName] = useState(userName);
  const [tempEmail, setTempEmail] = useState(userEmail);

  // --- PRIVACY SETTINGS STATE ---
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(true);

  // Theme Colors
  const bg = darkMode ? "#0f172a" : "#F9FAFB";
  const card = darkMode ? "#1e293b" : "#ffffff";
  const text = darkMode ? "#e2e8f0" : "#1f2937";
  const muted = darkMode ? "#94a3b8" : "#6b7280";
  const inputBg = darkMode ? "#334155" : "#f3f4f6";

  // --- HANDLERS ---

  const handleEditProfileOpen = () => {
    setTempName(userName);
    setTempEmail(userEmail);
    setEditModalVisible(true);
  };

  const handleSaveProfile = () => {
    if (!tempName || !tempEmail) {
      Alert.alert("Error", "Name and Email cannot be empty.");
      return;
    }
    setUserName(tempName);
    setUserEmail(tempEmail);
    setEditModalVisible(false);
    Alert.alert("Success", "Profile updated successfully!");
  };

  const handleChangePassword = () => {
    Alert.alert("Reset Password", "A password reset link has been sent to your email.");
  };

  const handlePlaceholder = (featureName: string) => {
    Alert.alert(featureName, `This would open the ${featureName} screen.`);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => {
             // ✅ This effectively logs the user out by redirecting to Login
             // We use 'as any' to bypass TypeScript checks if the route file isn't strictly typed yet
             router.replace("/login" as any); 
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>

        {/* Header */}
        <Text style={{ fontSize: 28, fontWeight: "800", color: text, marginBottom: 20 }}>
          Profile
        </Text>

        {/* Profile Card */}
        <View style={{ backgroundColor: card, padding: 20, borderRadius: 20, alignItems: "center", shadowColor: "#000", elevation: 4, marginBottom: 25 }}>
          <Image
            source={{ uri: "https://i.pravatar.cc/300" }}
            style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 15 }}
          />

          <Text style={{ fontSize: 22, fontWeight: "700", color: text }}>{userName}</Text>
          <Text style={{ fontSize: 14, color: muted, marginBottom: 10 }}>{userEmail}</Text>

          <TouchableOpacity
            onPress={handleEditProfileOpen}
            style={{ marginTop: 10, backgroundColor: "#15803d", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={{ marginBottom: 30 }}>
          <Text style={{ color: text, fontSize: 16, fontWeight: "700", marginBottom: 10 }}>Account</Text>

          <SettingsRow icon="user" label="Personal Information" color={text} bg={card} onPress={handleEditProfileOpen} />
          
          {/* ✅ Connect Privacy Modal Here */}
          <SettingsRow icon="lock" label="Privacy & Security" color={text} bg={card} onPress={() => setPrivacyModalVisible(true)} />
          
          <SettingsRow icon="envelope" label="Notifications" color={text} bg={card} onPress={() => handlePlaceholder("Notification Settings")} />
        </View>

        {/* Help Section */}
        <View style={{ marginBottom: 30 }}>
          <Text style={{ color: text, fontSize: 16, fontWeight: "700", marginBottom: 10 }}>Support</Text>
          <SettingsRow icon="question-circle" label="Help Center" color={text} bg={card} onPress={() => handlePlaceholder("Help Center")} />
          <SettingsRow icon="info-circle" label="About JeepRoute" color={text} bg={card} onPress={() => handlePlaceholder("About Us")} />
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={{ backgroundColor: "#dc2626", padding: 15, alignItems: "center", borderRadius: 12 }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ================= EDIT PROFILE MODAL ================= */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: card, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, minHeight: '50%' }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: text }}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <X color={text} size={24} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: muted, marginBottom: 5 }}>Full Name</Text>
            <TextInput 
              value={tempName}
              onChangeText={setTempName}
              style={{ backgroundColor: inputBg, color: text, padding: 15, borderRadius: 12, marginBottom: 15 }}
            />

            <Text style={{ color: muted, marginBottom: 5 }}>Email Address</Text>
            <TextInput 
              value={tempEmail}
              onChangeText={setTempEmail}
              keyboardType="email-address"
              style={{ backgroundColor: inputBg, color: text, padding: 15, borderRadius: 12, marginBottom: 25 }}
            />

            <TouchableOpacity onPress={handleSaveProfile} style={{ backgroundColor: '#15803d', padding: 15, borderRadius: 12, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Save Changes</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* ================= PRIVACY & SECURITY MODAL ================= */}
      <Modal visible={privacyModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: card, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, minHeight: '45%' }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: text }}>Privacy & Security</Text>
              <TouchableOpacity onPress={() => setPrivacyModalVisible(false)}>
                <X color={text} size={24} />
              </TouchableOpacity>
            </View>

            {/* Toggle 1: Biometrics */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: 10, backgroundColor: inputBg, borderRadius: 12 }}>
              <View>
                <Text style={{ color: text, fontWeight: '600', fontSize: 16 }}>Biometric Login</Text>
                <Text style={{ color: muted, fontSize: 12 }}>Use FaceID/TouchID</Text>
              </View>
              <Switch 
                value={biometricEnabled} 
                onValueChange={setBiometricEnabled}
                trackColor={{ false: "#767577", true: "#15803d" }}
              />
            </View>

            {/* Toggle 2: Location */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: 10, backgroundColor: inputBg, borderRadius: 12 }}>
              <View>
                <Text style={{ color: text, fontWeight: '600', fontSize: 16 }}>Location Sharing</Text>
                <Text style={{ color: muted, fontSize: 12 }}>Visible to other passengers</Text>
              </View>
              <Switch 
                value={locationEnabled} 
                onValueChange={setLocationEnabled}
                trackColor={{ false: "#767577", true: "#15803d" }}
              />
            </View>

            {/* Change Password Button */}
            <TouchableOpacity 
              onPress={handleChangePassword} 
              style={{ backgroundColor: inputBg, padding: 15, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text style={{ color: text, fontWeight: '600' }}>Change Password</Text>
              <FontAwesome name="chevron-right" size={16} color={muted} />
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function SettingsRow({ icon, label, color, bg, onPress }: SettingsRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: bg,
        padding: 15,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
        shadowColor: "#000",
        elevation: 2,
      }}
    >
      <FontAwesome name={icon} size={20} color={color} style={{ width: 28 }} />
      <Text style={{ color, fontSize: 15, fontWeight: "600", flex: 1 }}>
        {label}
      </Text>
      <FontAwesome name="chevron-right" size={18} color={color} />
    </TouchableOpacity>
  );
}
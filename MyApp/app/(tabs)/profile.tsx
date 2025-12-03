import { View, Text, Image, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ComponentProps } from "react";
import { useRouter } from "expo-router";
// import { auth, signOut } from "../../services/firebase";

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
  
  const [userEmail, setUserEmail] = useState("juan@jeeproute.ph");
  const [userName, setUserName] = useState("Juan Dela Cruz");

  // ❌ REMOVED useEffect (No need to check backend)
  /*
  useEffect(() => {
    if (auth.currentUser) {
      setUserEmail(auth.currentUser.email || "JeepRoute User");
    }
  }, []);
  */

  const bg = darkMode ? "#0f172a" : "#F9FAFB";
  const card = darkMode ? "#1e293b" : "#ffffff";
  const text = darkMode ? "#e2e8f0" : "#1f2937";
  const muted = darkMode ? "#94a3b8" : "#6b7280";

  // --- INTERACTION HANDLERS ---

  const handlePlaceholder = (featureName: string) => {
    Alert.alert(
      featureName, 
      `This would open the ${featureName} screen.`
    );
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: () => {
             // ✅ SIMULATED LOGOUT (No backend error)
             //console.log("User logged out locally");
             //router.replace("/login"); 
             
             // ❌ Old Backend Call
             /*
             try {
               await signOut(auth);
               router.replace("/login");
             } catch (error: any) {
               Alert.alert("Error", error.message);
             }
             */
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>

        {/* Header */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: text,
            marginBottom: 20,
          }}
        >
          Profile
        </Text>

        {/* Profile Card */}
        <View
          style={{
            backgroundColor: card,
            padding: 20,
            borderRadius: 20,
            alignItems: "center",
            shadowColor: "#000",
            elevation: 4,
            marginBottom: 25,
          }}
        >
          <Image
            source={{
              uri: "https://i.pravatar.cc/300",
            }}
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              marginBottom: 15,
            }}
          />

          <Text style={{ fontSize: 22, fontWeight: "700", color: text }}>
            {userName}
          </Text>
          <Text style={{ fontSize: 14, color: muted, marginBottom: 10 }}>
            {userEmail}
          </Text>

          <TouchableOpacity
            onPress={() => handlePlaceholder("Edit Profile")}
            style={{
              marginTop: 10,
              backgroundColor: "#15803d",
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>
              Edit Profile
            </Text>
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={{ marginBottom: 30 }}>
          <Text
            style={{
              color: text,
              fontSize: 16,
              fontWeight: "700",
              marginBottom: 10,
            }}
          >
            Account
          </Text>

          <SettingsRow
            icon="user"
            label="Personal Information"
            color={text}
            bg={card}
            onPress={() => handlePlaceholder("Personal Info")}
          />
          <SettingsRow
            icon="lock"
            label="Privacy & Security"
            color={text}
            bg={card}
            onPress={() => handlePlaceholder("Privacy Settings")}
          />
          <SettingsRow
            icon="envelope"
            label="Notifications"
            color={text}
            bg={card}
            onPress={() => handlePlaceholder("Notification Settings")}
          />
        </View>

        {/* Help Section */}
        <View style={{ marginBottom: 30 }}>
          <Text
            style={{
              color: text,
              fontSize: 16,
              fontWeight: "700",
              marginBottom: 10,
            }}
          >
            Support
          </Text>

          <SettingsRow
            icon="question-circle"
            label="Help Center"
            color={text}
            bg={card}
            onPress={() => handlePlaceholder("Help Center")}
          />
          <SettingsRow
            icon="info-circle"
            label="About JeepRoute"
            color={text}
            bg={card}
            onPress={() => handlePlaceholder("About Us")}
          />
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={{
            backgroundColor: "#dc2626",
            padding: 15,
            alignItems: "center",
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
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
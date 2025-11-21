import { View, Text, Image, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React from "react";
import { useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";

export default function Profile() {
  const { darkMode } = useTheme();

  const bg = darkMode ? "#0f172a" : "#F9FAFB";
  const card = darkMode ? "#1e293b" : "#ffffff";
  const text = darkMode ? "#e2e8f0" : "#1f2937";
  const muted = darkMode ? "#94a3b8" : "#6b7280";

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
            Profile Name
          </Text>
          <Text style={{ fontSize: 14, color: muted, marginBottom: 10 }}>
            JeepRoute Passenger
          </Text>

          <TouchableOpacity
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
          />
          <SettingsRow
            icon="lock"
            label="Privacy & Security"
            color={text}
            bg={card}
          />
          <SettingsRow
            icon="envelope"
            label="Notifications"
            color={text}
            bg={card}
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
          />
          <SettingsRow
            icon="info-circle"
            label="About JeepRoute"
            color={text}
            bg={card}
          />
        </View>

        {/* Logout */}
        <TouchableOpacity
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

/* ------ COMPONENT: Settings Row ------- */

function SettingsRow({ icon, label, color, bg }) {
  return (
    <TouchableOpacity
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

import {
  View, Text, Image, TouchableOpacity, ScrollView, Alert,
  Modal, TextInput, Switch, ActivityIndicator, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useState, useEffect } from "react";
import { useTheme } from "../ThemeContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ComponentProps } from "react";
import { useRouter } from "expo-router";
import { X, Camera, Image as ImageIcon } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { auth, db, ref, get, update, signOut } from "../../services/firebase";

type FontAwesomeName = ComponentProps<typeof FontAwesome>["name"];

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

  // ── User data ──────────────────────────────────────────────────────────────
  const [userEmail, setUserEmail]   = useState("Loading...");
  const [userName, setUserName]     = useState("Loading...");
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);

  // ── Modal visibility ───────────────────────────────────────────────────────
  const [editModalVisible, setEditModalVisible]       = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [photoPickerVisible, setPhotoPickerVisible]   = useState(false);

  // ── Edit form ──────────────────────────────────────────────────────────────
  const [tempName, setTempName]     = useState("");
  const [tempEmail, setTempEmail]   = useState("");
  const [tempPic, setTempPic]       = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  // ── Privacy ────────────────────────────────────────────────────────────────
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [locationEnabled, setLocationEnabled]   = useState(true);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const bg      = darkMode ? "#0f172a" : "#F9FAFB";
  const card    = darkMode ? "#1e293b" : "#ffffff";
  const text    = darkMode ? "#e2e8f0" : "#1f2937";
  const muted   = darkMode ? "#94a3b8" : "#6b7280";
  const inputBg = darkMode ? "#334155" : "#f3f4f6";

  // ── Fetch user data ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        try {
          const snapshot = await get(ref(db, `users/${auth.currentUser.uid}`));
          if (snapshot.exists()) {
            const data = snapshot.val();
            setUserName(data.username  || "No Name");
            setUserEmail(data.email    || auth.currentUser.email || "");
            setProfilePic(data.profilePic || null);
          }
        } catch (error) {
          console.log("Error fetching profile:", error);
        }
      }
      setLoading(false);
    };
    fetchUserData();
  }, []);

  // ── Open edit modal ────────────────────────────────────────────────────────
  const handleEditProfileOpen = () => {
    setTempName(userName);
    setTempEmail(userEmail);
    setTempPic(profilePic);
    setEditModalVisible(true);
  };

  // ── Pick image from gallery ────────────────────────────────────────────────
  const pickFromGallery = async () => {
    setPhotoPickerVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please allow access to your photo library in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const { base64, mimeType, uri } = result.assets[0];
      const dataUri = base64
        ? `data:${mimeType ?? "image/jpeg"};base64,${base64}`
        : uri;
      setTempPic(dataUri);
    }
  };

  // ── Take photo with camera ─────────────────────────────────────────────────
  const takePhoto = async () => {
    setPhotoPickerVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please allow camera access in Settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const { base64, mimeType, uri } = result.assets[0];
      const dataUri = base64
        ? `data:${mimeType ?? "image/jpeg"};base64,${base64}`
        : uri;
      setTempPic(dataUri);
    }
  };

  // ── Save profile ───────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!tempName.trim() || !tempEmail.trim()) {
      Alert.alert("Error", "Name and Email cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        username: tempName.trim(),
        email:    tempEmail.trim(),
      };
      if (tempPic !== profilePic) {
        updates.profilePic = tempPic ?? "";
      }

      if (auth.currentUser) {
        await update(ref(db, `users/${auth.currentUser.uid}`), updates);
        // Also update jeep_info so the map shows the new pic
        if (tempPic !== profilePic) {
          await update(ref(db, `jeep_info/${auth.currentUser.uid}`), {
            profilePic: tempPic ?? "",
          });
        }
      }

      setUserName(tempName.trim());
      setUserEmail(tempEmail.trim());
      setProfilePic(tempPic);
      setEditModalVisible(false);
      Alert.alert("✅ Saved", "Profile updated successfully!");
    } catch (error) {
      Alert.alert("Error", "Failed to update profile. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = () => {
    Alert.alert("Reset Password", "A password reset link has been sent to your email.");
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await signOut(auth);
          router.replace("/login" as any);
        },
      },
    ]);
  };

  // ── Avatar helper ──────────────────────────────────────────────────────────
  const AvatarDisplay = ({
    uri, size, fallbackLetter,
  }: { uri: string | null; size: number; fallbackLetter: string }) => {
    const radius = size / 2;
    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius, borderWidth: 3, borderColor: "#15803d" }}
        />
      );
    }
    return (
      <View style={{
        width: size, height: size, borderRadius: radius,
        backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center",
        borderWidth: 3, borderColor: "#15803d",
      }}>
        <Text style={{ fontSize: size * 0.38, fontWeight: "800", color: "#15803d" }}>
          {fallbackLetter.toUpperCase()}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>

        {/* Header */}
        <Text style={{ fontSize: 28, fontWeight: "800", color: text, marginBottom: 20 }}>
          Profile
        </Text>

        {/* Profile Card */}
        <View style={{
          backgroundColor: card, padding: 24, borderRadius: 24,
          alignItems: "center", shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08,
          shadowRadius: 12, elevation: 4, marginBottom: 24,
        }}>
          {loading ? (
            <ActivityIndicator size="large" color="#15803d" style={{ marginVertical: 20 }} />
          ) : (
            <>
              {/* Avatar with edit badge */}
              <View style={{ marginBottom: 16 }}>
                <AvatarDisplay uri={profilePic} size={100} fallbackLetter={userName.charAt(0) || "U"} />
              </View>

              <Text style={{ fontSize: 22, fontWeight: "700", color: text, marginBottom: 4 }}>
                {userName}
              </Text>
              <Text style={{ fontSize: 14, color: muted, marginBottom: 16 }}>{userEmail}</Text>

              <TouchableOpacity
                onPress={handleEditProfileOpen}
                style={{
                  backgroundColor: "#15803d", paddingHorizontal: 24, paddingVertical: 10,
                  borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8,
                }}
              >
                <FontAwesome name="edit" size={14} color="white" />
                <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>Edit Profile</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Account Section */}
        <View style={{ marginBottom: 30 }}>
          <Text style={{ color: text, fontSize: 16, fontWeight: "700", marginBottom: 10 }}>Account</Text>
          <SettingsRow icon="user"     label="Personal Information" color={text} bg={card} onPress={handleEditProfileOpen} />
          <SettingsRow icon="lock"     label="Privacy & Security"   color={text} bg={card} onPress={() => setPrivacyModalVisible(true)} />
          <SettingsRow icon="envelope" label="Notifications"        color={text} bg={card} onPress={() => Alert.alert("Notifications", "Notification settings coming soon.")} />
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={{ backgroundColor: "#dc2626", padding: 15, alignItems: "center", borderRadius: 12 }}
        >
          <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ═══════════════════════════════════════
          EDIT PROFILE MODAL
      ═══════════════════════════════════════ */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: 24, paddingBottom: 40,
          }}>
            {/* Handle */}
            <View style={{ width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 20 }} />

            {/* Header row */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: text }}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={{ padding: 4 }}>
                <X color={muted} size={22} />
              </TouchableOpacity>
            </View>

            {/* Profile photo picker */}
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => setPhotoPickerVisible(true)}
                activeOpacity={0.8}
                style={{ position: "relative" }}
              >
                {tempPic ? (
                  <Image source={{ uri: tempPic }} style={styles.editAvatar} />
                ) : (
                  <View style={[styles.editAvatar, { backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ fontSize: 36, fontWeight: "800", color: "#15803d" }}>
                      {tempName.charAt(0)?.toUpperCase() || "U"}
                    </Text>
                  </View>
                )}
                {/* Camera badge */}
                <View style={styles.cameraBadge}>
                  <Camera color="white" size={14} />
                </View>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: muted, marginTop: 8 }}>Tap to change photo</Text>
            </View>

            {/* Name field */}
            <Text style={{ color: muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>
              Full Name
            </Text>
            <TextInput
              value={tempName}
              onChangeText={setTempName}
              style={{ backgroundColor: inputBg, color: text, padding: 14, borderRadius: 12, marginBottom: 16, fontSize: 15 }}
              placeholderTextColor={muted}
            />

            {/* Email field */}
            <Text style={{ color: muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>
              Email Address
            </Text>
            <TextInput
              value={tempEmail}
              onChangeText={setTempEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{ backgroundColor: inputBg, color: text, padding: 14, borderRadius: 12, marginBottom: 24, fontSize: 15 }}
              placeholderTextColor={muted}
            />

            <TouchableOpacity
              onPress={handleSaveProfile}
              disabled={saving}
              style={{
                backgroundColor: saving ? "#9ca3af" : "#15803d",
                padding: 16, borderRadius: 14, alignItems: "center",
                flexDirection: "row", justifyContent: "center", gap: 8,
              }}
            >
              {saving
                ? <ActivityIndicator color="white" size="small" />
                : <><FontAwesome name="check" size={16} color="white" /><Text style={{ color: "white", fontWeight: "800", fontSize: 15 }}>Save Changes</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════
          PHOTO SOURCE PICKER
      ═══════════════════════════════════════ */}
      <Modal visible={photoPickerVisible} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setPhotoPickerVisible(false)}
        >
          <View style={{ backgroundColor: card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: "800", color: text, marginBottom: 20 }}>Change Profile Photo</Text>

            <TouchableOpacity
              onPress={takePhoto}
              style={[styles.photoOption, { backgroundColor: inputBg }]}
              activeOpacity={0.75}
            >
              <View style={styles.photoOptionIcon}>
                <Camera color="#15803d" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: text }}>Take Photo</Text>
                <Text style={{ fontSize: 12, color: muted, marginTop: 2 }}>Use your camera</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={pickFromGallery}
              style={[styles.photoOption, { backgroundColor: inputBg }]}
              activeOpacity={0.75}
            >
              <View style={styles.photoOptionIcon}>
                <ImageIcon color="#2563eb" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: text }}>Choose from Library</Text>
                <Text style={{ fontSize: 12, color: muted, marginTop: 2 }}>Pick from your gallery</Text>
              </View>
            </TouchableOpacity>

            {(profilePic || tempPic) && (
              <TouchableOpacity
                onPress={() => { setTempPic(null); setPhotoPickerVisible(false); }}
                style={[styles.photoOption, { backgroundColor: "#fee2e2" }]}
                activeOpacity={0.75}
              >
                <View style={[styles.photoOptionIcon, { backgroundColor: "#fecaca" }]}>
                  <X color="#dc2626" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#dc2626" }}>Remove Photo</Text>
                  <Text style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>Use initials instead</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setPhotoPickerVisible(false)} style={{ marginTop: 12, paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: muted, fontSize: 15, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ═══════════════════════════════════════
          PRIVACY & SECURITY MODAL
      ═══════════════════════════════════════ */}
      <Modal visible={privacyModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 40, height: 5, backgroundColor: "#e5e7eb", borderRadius: 3, alignSelf: "center", marginBottom: 20 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: text }}>Privacy & Security</Text>
              <TouchableOpacity onPress={() => setPrivacyModalVisible(false)}>
                <X color={muted} size={22} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: 14, backgroundColor: inputBg, borderRadius: 14 }}>
              <View>
                <Text style={{ color: text, fontWeight: "700", fontSize: 15 }}>Biometric Login</Text>
                <Text style={{ color: muted, fontSize: 12, marginTop: 2 }}>Use FaceID / TouchID</Text>
              </View>
              <Switch value={biometricEnabled} onValueChange={setBiometricEnabled} trackColor={{ false: "#d1d5db", true: "#15803d" }} />
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: 14, backgroundColor: inputBg, borderRadius: 14 }}>
              <View>
                <Text style={{ color: text, fontWeight: "700", fontSize: 15 }}>Location Sharing</Text>
                <Text style={{ color: muted, fontSize: 12, marginTop: 2 }}>Visible to other users</Text>
              </View>
              <Switch value={locationEnabled} onValueChange={setLocationEnabled} trackColor={{ false: "#d1d5db", true: "#15803d" }} />
            </View>

            <TouchableOpacity
              onPress={handleChangePassword}
              style={{ backgroundColor: inputBg, padding: 14, borderRadius: 14, alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={{ color: text, fontWeight: "700", fontSize: 15 }}>Change Password</Text>
              <FontAwesome name="chevron-right" size={14} color={muted} />
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
      style={{ backgroundColor: bg, padding: 15, borderRadius: 14, flexDirection: "row", alignItems: "center", marginBottom: 10, shadowColor: "#000", elevation: 2 }}
    >
      <FontAwesome name={icon} size={18} color={color} style={{ width: 28 }} />
      <Text style={{ color, fontSize: 15, fontWeight: "600", flex: 1 }}>{label}</Text>
      <FontAwesome name="chevron-right" size={14} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  editAvatar: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: "#15803d",
  },
  cameraBadge: {
    position: "absolute", bottom: 0, right: 0,
    backgroundColor: "#15803d", borderRadius: 16, padding: 6,
    borderWidth: 2, borderColor: "white",
  },
  photoOption: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 14, borderRadius: 14, marginBottom: 10,
  },
  photoOptionIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center",
  },
});
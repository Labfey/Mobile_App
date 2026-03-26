import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, KeyboardAvoidingView,
  Platform, FlatList, Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, User, Car, Sparkles, Send, X, ChevronDown } from "lucide-react-native";
import { useTheme } from "../ThemeContext";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { auth, db, ref, get } from "../../services/firebase";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FARE_CONTEXT } from "../../constants/fareInfo";

// ─── Gemini client (key loaded from .env, never hardcoded) ───────────────────
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_KEY ?? "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const SUGGESTIONS = [
  "How much from Town to Balacbac?",
  "What's the student discount?",
  "Fare for Zone 1 only?",
  "Senior citizen rate?",
];

export default function HomeScreen() {
  const { darkMode } = useTheme();
  const router = useRouter();

  const [role, setRole] = useState<"passenger" | "driver" | "guest">("guest");
  const [userName, setUserName] = useState("Commuter");
  const [loading, setLoading] = useState(true);

  // ── AI chat state ──────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      role: "assistant",
      text: "Hi! 👋 Ask me anything about jeepney fares on the Balacbac–Town route.",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const chatRef = useRef<any>(null); // Gemini chat session

  // Theme
  const bg = darkMode ? "#0f172a" : "#F9FAFB";
  const card = darkMode ? "#1e293b" : "#ffffff";
  const cardBorder = darkMode ? "#334155" : "#E5E7EB";
  const textMain = darkMode ? "#f1f5f9" : "#111827";
  const textMuted = darkMode ? "#94a3b8" : "#6B7280";
  const inputBg = darkMode ? "#0f172a" : "#F3F4F6";
  const chatBg = darkMode ? "#0f172a" : "#F8FAFC";

  useEffect(() => {
    const fetchUser = async () => {
      if (auth.currentUser) {
        const snapshot = await get(ref(db, `users/${auth.currentUser.uid}`));
        if (snapshot.exists()) {
          const data = snapshot.val();
          setRole(data.role);
          setUserName(data.username);
        }
      } else {
        setRole("guest");
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  // Initialise a Gemini multi-turn chat session with fare context as system prompt
  const getOrCreateChat = () => {
    if (!chatRef.current) {
      chatRef.current = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: FARE_CONTEXT }],
          },
          {
            role: "model",
            parts: [{ text: "Understood! I'm ready to answer fare and route questions for the Balacbac–Town jeepney route." }],
          },
        ],
      });
    }
    return chatRef.current;
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || aiLoading) return;
    Keyboard.dismiss();

    const userMsg: Message = { id: Date.now().toString(), role: "user", text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setAiLoading(true);

    try {
      const chat = getOrCreateChat();
      const result = await chat.sendMessage(trimmed);
      const reply = result.response.text();
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", text: reply },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", text: "Sorry, I couldn't connect right now. Please try again." },
      ]);
    } finally {
      setAiLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const goToMap = () => router.push("/mapscreen");

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: bg }}>
        <ActivityIndicator size="large" color="#15803d" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <View style={{
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: darkMode ? "#4ade80" : "#15803d" }}>
            JeepRoute
          </Text>
          <Text style={{ fontSize: 12, color: textMuted }}>Baguio City Transit</Text>
        </View>
        <TouchableOpacity
          onPress={() => auth.currentUser ? router.push("/profile") : router.push("/login" as any)}
          style={{ backgroundColor: "#15803d", borderRadius: 999, padding: 8 }}
        >
          <User color="white" size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* ── DRIVER CARD ─────────────────────────────────────────────────── */}
        {role === "driver" && (
          <View style={{ paddingHorizontal: 20, marginBottom: 20, marginTop: 8 }}>
            <View style={{ backgroundColor: "#15803d", borderRadius: 24, padding: 20 }}>
              <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
                Welcome, Driver {userName}!
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: 16 }}>
                Ready to start driving?
              </Text>
              <TouchableOpacity
                onPress={goToMap}
                style={{
                  backgroundColor: "white", paddingVertical: 12, borderRadius: 14,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Car color="#15803d" size={20} />
                <Text style={{ color: "#15803d", fontWeight: "700", fontSize: 15 }}>START ROUTE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── PASSENGER / GUEST GREETING ──────────────────────────────────── */}
        {(role === "passenger" || role === "guest") && (
          <View style={{ paddingHorizontal: 20, marginTop: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: textMain }}>
              Hello, {userName}! 👋
            </Text>
            <Text style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>
              Track live jeeps and check fare zones.
            </Text>
          </View>
        )}

        {/* ── MAP PREVIEW CARD ────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={goToMap}
          activeOpacity={0.8}
          style={{
            marginHorizontal: 20, marginTop: 16, height: 180, borderRadius: 24,
            backgroundColor: darkMode ? "#1e293b" : "#dcfce7",
            alignItems: "center", justifyContent: "center",
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
          }}
        >
          <MapPin color={darkMode ? "#4ade80" : "#166534"} size={48} />
          <Text style={{
            marginTop: 8, fontSize: 16, fontWeight: "700",
            color: darkMode ? "white" : "#166534",
          }}>Open Live Map</Text>
        </TouchableOpacity>

        {/* ── AI FARE ASSISTANT CARD ───────────────────────────────────────── */}
        <View style={{
          marginHorizontal: 20, marginTop: 20,
          backgroundColor: card,
          borderRadius: 24, overflow: "hidden",
          borderWidth: 1, borderColor: cardBorder,
          shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
        }}>
          {/* Card header — tap to expand/collapse */}
          <TouchableOpacity
            onPress={() => setChatOpen(p => !p)}
            activeOpacity={0.8}
            style={{
              flexDirection: "row", alignItems: "center",
              padding: 18, gap: 12,
            }}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 14,
              backgroundColor: darkMode ? "#0f172a" : "#f0fdf4",
              alignItems: "center", justifyContent: "center",
            }}>
              <Sparkles color="#15803d" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: textMain }}>
                Fare Assistant
              </Text>
              <Text style={{ fontSize: 12, color: textMuted, marginTop: 1 }}>
                Ask about prices, zones & discounts
              </Text>
            </View>
            <ChevronDown
              color={textMuted} size={20}
              style={{ transform: [{ rotate: chatOpen ? "180deg" : "0deg" }] }}
            />
          </TouchableOpacity>

          {/* Expanded chat area */}
          {chatOpen && (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              {/* Message list */}
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id}
                style={{ backgroundColor: chatBg, maxHeight: 280 }}
                contentContainerStyle={{ padding: 16, gap: 10 }}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                renderItem={({ item }) => (
                  <View style={{
                    alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                  }}>
                    <View style={{
                      backgroundColor: item.role === "user"
                        ? "#15803d"
                        : darkMode ? "#1e293b" : "#ffffff",
                      borderRadius: 16,
                      borderBottomRightRadius: item.role === "user" ? 4 : 16,
                      borderBottomLeftRadius: item.role === "assistant" ? 4 : 16,
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderWidth: item.role === "assistant" ? 1 : 0,
                      borderColor: cardBorder,
                    }}>
                      <Text style={{
                        color: item.role === "user" ? "white" : textMain,
                        fontSize: 14, lineHeight: 20,
                      }}>
                        {item.text}
                      </Text>
                    </View>
                  </View>
                )}
                ListFooterComponent={aiLoading ? (
                  <View style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 4 }}>
                    <ActivityIndicator size="small" color="#15803d" />
                  </View>
                ) : null}
              />

              {/* Quick suggestion chips */}
              {messages.length <= 1 && (
                <ScrollView
                  horizontal showsHorizontalScrollIndicator={false}
                  style={{ backgroundColor: chatBg }}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}
                >
                  {SUGGESTIONS.map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => sendMessage(s)}
                      style={{
                        backgroundColor: darkMode ? "#1e293b" : "#f0fdf4",
                        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                        borderWidth: 1, borderColor: darkMode ? "#334155" : "#bbf7d0",
                      }}
                    >
                      <Text style={{ color: darkMode ? "#4ade80" : "#15803d", fontSize: 13, fontWeight: "600" }}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Input row */}
              <View style={{
                flexDirection: "row", alignItems: "center",
                paddingHorizontal: 12, paddingVertical: 12,
                gap: 10,
                borderTopWidth: 1, borderTopColor: cardBorder,
                backgroundColor: card,
              }}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  onSubmitEditing={() => sendMessage(inputText)}
                  placeholder="Ask about fares…"
                  placeholderTextColor={textMuted}
                  style={{
                    flex: 1, backgroundColor: inputBg, borderRadius: 20,
                    paddingHorizontal: 16, paddingVertical: 10,
                    fontSize: 14, color: textMain,
                  }}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  onPress={() => sendMessage(inputText)}
                  disabled={!inputText.trim() || aiLoading}
                  style={{
                    backgroundColor: inputText.trim() && !aiLoading ? "#15803d" : (darkMode ? "#1e293b" : "#E5E7EB"),
                    width: 42, height: 42, borderRadius: 21,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Send
                    color={inputText.trim() && !aiLoading ? "white" : textMuted}
                    size={18}
                  />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
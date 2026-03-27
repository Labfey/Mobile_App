import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, KeyboardAvoidingView,
  Platform, FlatList, Keyboard, Modal, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MapPin, User, Car, Sparkles, Send, ChevronDown,
  MessageSquare, Pin, Plus, Trash2, Clock, AlertTriangle,
  Gift, Search, X, Edit3,
} from "lucide-react-native";
import { useTheme } from "../ThemeContext";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "../../services/firebase";
import { ref, get, onValue, push, update, remove, serverTimestamp } from "firebase/database";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FARE_CONTEXT } from "../../constants/fareInfo";

// ─── Gemini client ────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_KEY ?? "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

type Message = { id: string; role: "user" | "assistant"; text: string };

// ── Community post types ──────────────────────────────────────────────────────
type PostCategory = "road" | "special" | "lostandfound" | "general";
type CommunityPost = {
  id: string;
  authorId: string;
  authorName: string;
  category: PostCategory;
  content: string;
  timestamp: number;
};

// ── Bulletin board item ───────────────────────────────────────────────────────
type BulletinItem = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: number;
  expiresAt: number; // timestamp + 7 days
};

const SUGGESTIONS = [
  "How much from Town to Balacbac?",
  "What's the student discount?",
  "Fare for Zone 1 only?",
  "Senior citizen rate?",
];

const POST_CATEGORY_CONFIG: Record<PostCategory, { label: string; emoji: string; color: string; bg: string }> = {
  road:        { label: "Road Update",    emoji: "🚧", color: "#D97706", bg: "#FEF3C7" },
  special:     { label: "Special Trip",   emoji: "🎉", color: "#7C3AED", bg: "#EDE9FE" },
  lostandfound:{ label: "Lost & Found",   emoji: "🔍", color: "#2563EB", bg: "#DBEAFE" },
  general:     { label: "General",        emoji: "📢", color: "#15803d", bg: "#DCFCE7" },
};

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function timeUntilExpiry(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / 86400000);
  const hrs  = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hrs}h left`;
  return `${hrs}h left`;
}

export default function HomeScreen() {
  const { darkMode } = useTheme();
  const router = useRouter();

  const [role, setRole]       = useState<"passenger" | "driver" | "guest">("guest");
  const [userName, setUserName] = useState("Commuter");
  const [userId, setUserId]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── AI chat ───────────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen]     = useState(false);
  const [messages, setMessages]     = useState<Message[]>([{
    id: "0", role: "assistant",
    text: "Hi! 👋 Ask me anything about jeepney fares on the Balacbac–Town route.",
  }]);
  const [inputText, setInputText]   = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const chatRef     = useRef<any>(null);

  // ── Community board ───────────────────────────────────────────────────────
  const [communityPosts, setCommunityPosts]       = useState<CommunityPost[]>([]);
  const [postModalVisible, setPostModalVisible]   = useState(false);
  const [newPostContent, setNewPostContent]       = useState("");
  const [newPostCategory, setNewPostCategory]     = useState<PostCategory>("general");
  const [activeFilter, setActiveFilter]           = useState<PostCategory | "all">("all");

  // ── Bulletin board ────────────────────────────────────────────────────────
  const [bulletinItems, setBulletinItems]           = useState<BulletinItem[]>([]);
  const [bulletinModalVisible, setBulletinModalVisible] = useState(false);
  const [editingBulletin, setEditingBulletin]       = useState<BulletinItem | null>(null);
  const [bulletinContent, setBulletinContent]       = useState("");

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"community" | "bulletin">("community");

  // Theme
  const bg        = darkMode ? "#0f172a" : "#F9FAFB";
  const card      = darkMode ? "#1e293b" : "#ffffff";
  const cardBorder= darkMode ? "#334155" : "#E5E7EB";
  const textMain  = darkMode ? "#f1f5f9" : "#111827";
  const textMuted = darkMode ? "#94a3b8" : "#6B7280";
  const inputBg   = darkMode ? "#0f172a" : "#F3F4F6";
  const chatBg    = darkMode ? "#0f172a" : "#F8FAFC";

  useEffect(() => {
    const fetchUser = async () => {
      if (auth.currentUser) {
        const snapshot = await get(ref(db, `users/${auth.currentUser.uid}`));
        if (snapshot.exists()) {
          const data = snapshot.val();
          setRole(data.role);
          setUserName(data.username);
          setUserId(auth.currentUser.uid);
        }
      } else {
        setRole("guest");
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  // ── Listen to community posts ─────────────────────────────────────────────
  useEffect(() => {
    const postsRef = ref(db, "community_posts");
    const unsub = onValue(postsRef, (snap) => {
      if (!snap.exists()) { setCommunityPosts([]); return; }
      const raw = snap.val() as Record<string, Omit<CommunityPost, "id">>;
      const list = Object.entries(raw)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.timestamp - a.timestamp);
      setCommunityPosts(list);
    });
    return () => unsub();
  }, []);

  // ── Listen to bulletin items — auto-purge expired ─────────────────────────
  useEffect(() => {
    const bulletinRef = ref(db, "bulletin_board");
    const unsub = onValue(bulletinRef, (snap) => {
      if (!snap.exists()) { setBulletinItems([]); return; }
      const raw = snap.val() as Record<string, Omit<BulletinItem, "id">>;
      const now = Date.now();
      const list: BulletinItem[] = [];
      Object.entries(raw).forEach(([id, v]) => {
        if (v.expiresAt && v.expiresAt < now) {
          // Auto-remove expired items
          remove(ref(db, `bulletin_board/${id}`));
        } else {
          list.push({ id, ...v });
        }
      });
      list.sort((a, b) => b.timestamp - a.timestamp);
      setBulletinItems(list);
    });
    return () => unsub();
  }, []);

  // ── Gemini chat ───────────────────────────────────────────────────────────
  const getOrCreateChat = () => {
    if (!chatRef.current) {
      chatRef.current = model.startChat({
        history: [
          { role: "user",  parts: [{ text: FARE_CONTEXT }] },
          { role: "model", parts: [{ text: "Understood! I'm ready to answer fare and route questions for the Balacbac–Town jeepney route." }] },
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
      setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: "assistant", text: result.response.text() }]);
    } catch {
      setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: "assistant", text: "Sorry, I couldn't connect right now. Please try again." }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // ── Community post actions ────────────────────────────────────────────────
  const submitPost = async () => {
    if (!newPostContent.trim()) return;
    if (role !== "driver") { Alert.alert("Drivers only", "Only drivers can post to the community board."); return; }
    await push(ref(db, "community_posts"), {
      authorId:   userId,
      authorName: userName,
      category:   newPostCategory,
      content:    newPostContent.trim(),
      timestamp:  Date.now(),
    });
    setNewPostContent("");
    setNewPostCategory("general");
    setPostModalVisible(false);
  };

  const deletePost = async (postId: string, authorId: string) => {
    if (userId !== authorId) return;
    Alert.alert("Delete Post", "Remove this post?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove(ref(db, `community_posts/${postId}`)) },
    ]);
  };

  // ── Bulletin actions ──────────────────────────────────────────────────────
  const saveBulletin = async () => {
    if (!bulletinContent.trim()) return;
    if (role !== "driver") { Alert.alert("Drivers only", "Only drivers can edit the bulletin board."); return; }
    const now = Date.now();
    const payload = {
      authorId:   userId,
      authorName: userName,
      content:    bulletinContent.trim(),
      timestamp:  now,
      expiresAt:  now + 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    if (editingBulletin) {
      await update(ref(db, `bulletin_board/${editingBulletin.id}`), payload);
    } else {
      await push(ref(db, "bulletin_board"), payload);
    }
    setBulletinContent("");
    setEditingBulletin(null);
    setBulletinModalVisible(false);
  };

  const deleteBulletin = async (item: BulletinItem) => {
    if (userId !== item.authorId) return;
    Alert.alert("Remove Notice", "Remove this bulletin notice?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove(ref(db, `bulletin_board/${item.id}`)) },
    ]);
  };

  const openEditBulletin = (item: BulletinItem) => {
    setEditingBulletin(item);
    setBulletinContent(item.content);
    setBulletinModalVisible(true);
  };

  const goToMap = () => router.push("/mapscreen");

  const filteredPosts = activeFilter === "all"
    ? communityPosts
    : communityPosts.filter(p => p.category === activeFilter);

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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>

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
          <Text style={{ marginTop: 8, fontSize: 16, fontWeight: "700", color: darkMode ? "white" : "#166534" }}>
            Open Live Map
          </Text>
        </TouchableOpacity>

        {/* ── FARE ASSISTANT (passengers & guests only) ───────────────────── */}
        {role !== "driver" && (
          <View style={{
            marginHorizontal: 20, marginTop: 20,
            backgroundColor: card, borderRadius: 24, overflow: "hidden",
            borderWidth: 1, borderColor: cardBorder,
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
          }}>
            <TouchableOpacity
              onPress={() => setChatOpen(p => !p)}
              activeOpacity={0.8}
              style={{ flexDirection: "row", alignItems: "center", padding: 18, gap: 12 }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 14,
                backgroundColor: darkMode ? "#0f172a" : "#f0fdf4",
                alignItems: "center", justifyContent: "center",
              }}>
                <Sparkles color="#15803d" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: textMain }}>Fare Assistant</Text>
                <Text style={{ fontSize: 12, color: textMuted, marginTop: 1 }}>Ask about prices, zones & discounts</Text>
              </View>
              <ChevronDown
                color={textMuted} size={20}
                style={{ transform: [{ rotate: chatOpen ? "180deg" : "0deg" }] }}
              />
            </TouchableOpacity>

            {chatOpen && (
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={item => item.id}
                  style={{ backgroundColor: chatBg, maxHeight: 280 }}
                  contentContainerStyle={{ padding: 16, gap: 10 }}
                  onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                  renderItem={({ item }) => (
                    <View style={{ alignSelf: item.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                      <View style={{
                        backgroundColor: item.role === "user" ? "#15803d" : darkMode ? "#1e293b" : "#ffffff",
                        borderRadius: 16,
                        borderBottomRightRadius: item.role === "user" ? 4 : 16,
                        borderBottomLeftRadius: item.role === "assistant" ? 4 : 16,
                        paddingHorizontal: 14, paddingVertical: 10,
                        borderWidth: item.role === "assistant" ? 1 : 0, borderColor: cardBorder,
                      }}>
                        <Text style={{ color: item.role === "user" ? "white" : textMain, fontSize: 14, lineHeight: 20 }}>
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
                {messages.length <= 1 && (
                  <ScrollView
                    horizontal showsHorizontalScrollIndicator={false}
                    style={{ backgroundColor: chatBg }}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}
                  >
                    {SUGGESTIONS.map(s => (
                      <TouchableOpacity
                        key={s} onPress={() => sendMessage(s)}
                        style={{
                          backgroundColor: darkMode ? "#1e293b" : "#f0fdf4",
                          borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                          borderWidth: 1, borderColor: darkMode ? "#334155" : "#bbf7d0",
                        }}
                      >
                        <Text style={{ color: darkMode ? "#4ade80" : "#15803d", fontSize: 13, fontWeight: "600" }}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <View style={{
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 12, paddingVertical: 12, gap: 10,
                  borderTopWidth: 1, borderTopColor: cardBorder, backgroundColor: card,
                }}>
                  <TextInput
                    value={inputText} onChangeText={setInputText}
                    onSubmitEditing={() => sendMessage(inputText)}
                    placeholder="Ask about fares…" placeholderTextColor={textMuted}
                    style={{
                      flex: 1, backgroundColor: inputBg, borderRadius: 20,
                      paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: textMain,
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
                    <Send color={inputText.trim() && !aiLoading ? "white" : textMuted} size={18} />
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            COMMUNITY BOARD + BULLETIN BOARD SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <View style={{ marginHorizontal: 20, marginTop: 24 }}>

          {/* Section heading + tab switcher */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <View>
              <Text style={{ fontSize: 20, fontWeight: "800", color: textMain }}>Driver Updates</Text>
              <Text style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>Latest news from the road</Text>
            </View>
            {role === "driver" && activeTab === "community" && (
              <TouchableOpacity
                onPress={() => setPostModalVisible(true)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 6,
                  backgroundColor: "#15803d", borderRadius: 20,
                  paddingHorizontal: 14, paddingVertical: 8,
                }}
              >
                <Plus color="white" size={16} />
                <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>Post</Text>
              </TouchableOpacity>
            )}
            {role === "driver" && activeTab === "bulletin" && (
              <TouchableOpacity
                onPress={() => { setEditingBulletin(null); setBulletinContent(""); setBulletinModalVisible(true); }}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 6,
                  backgroundColor: "#7C3AED", borderRadius: 20,
                  paddingHorizontal: 14, paddingVertical: 8,
                }}
              >
                <Plus color="white" size={16} />
                <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>Add Notice</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tab row */}
          <View style={{
            flexDirection: "row", backgroundColor: darkMode ? "#1e293b" : "#F3F4F6",
            borderRadius: 14, padding: 4, marginBottom: 16,
          }}>
            {(["community", "bulletin"] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: "center",
                  backgroundColor: activeTab === tab ? (tab === "community" ? "#15803d" : "#7C3AED") : "transparent",
                }}
              >
                <Text style={{
                  fontWeight: "700", fontSize: 13,
                  color: activeTab === tab ? "white" : textMuted,
                }}>
                  {tab === "community" ? "📢 Community" : "📌 Bulletin"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── COMMUNITY BOARD TAB ────────────────────────────────────── */}
          {activeTab === "community" && (
            <>
              {/* Category filter chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
                <TouchableOpacity
                  onPress={() => setActiveFilter("all")}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: activeFilter === "all" ? "#15803d" : (darkMode ? "#1e293b" : "#F9FAFB"),
                    borderWidth: 1.5,
                    borderColor: activeFilter === "all" ? "#15803d" : cardBorder,
                  }}
                >
                  <Text style={{ fontWeight: "700", fontSize: 12, color: activeFilter === "all" ? "white" : textMuted }}>All</Text>
                </TouchableOpacity>
                {(Object.entries(POST_CATEGORY_CONFIG) as [PostCategory, typeof POST_CATEGORY_CONFIG[PostCategory]][]).map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setActiveFilter(key)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                      flexDirection: "row", alignItems: "center", gap: 5,
                      backgroundColor: activeFilter === key ? cfg.color : (darkMode ? "#1e293b" : "#F9FAFB"),
                      borderWidth: 1.5, borderColor: activeFilter === key ? cfg.color : cardBorder,
                    }}
                  >
                    <Text style={{ fontSize: 12 }}>{cfg.emoji}</Text>
                    <Text style={{ fontWeight: "700", fontSize: 12, color: activeFilter === key ? "white" : textMuted }}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Posts */}
              {filteredPosts.length === 0 ? (
                <View style={{
                  backgroundColor: card, borderRadius: 20, padding: 32,
                  alignItems: "center", borderWidth: 1, borderColor: cardBorder,
                }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
                  <Text style={{ color: textMuted, fontWeight: "600", textAlign: "center" }}>
                    No posts yet.{"\n"}{role === "driver" ? "Be the first to share an update!" : "Check back later for driver updates."}
                  </Text>
                </View>
              ) : (
                filteredPosts.map(post => {
                  const cfg = POST_CATEGORY_CONFIG[post.category] ?? POST_CATEGORY_CONFIG.general;
                  return (
                    <View
                      key={post.id}
                      style={{
                        backgroundColor: card, borderRadius: 18, padding: 16, marginBottom: 12,
                        borderWidth: 1, borderColor: cardBorder,
                        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
                      }}
                    >
                      {/* Post header */}
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                        <View style={{
                          width: 36, height: 36, borderRadius: 18,
                          backgroundColor: cfg.bg, alignItems: "center", justifyContent: "center",
                          marginRight: 10,
                        }}>
                          <Text style={{ fontSize: 18 }}>{cfg.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "700", fontSize: 13, color: textMain }}>{post.authorName}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <View style={{
                              backgroundColor: cfg.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
                            }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: cfg.color }}>{cfg.label}</Text>
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Clock size={10} color={textMuted} />
                              <Text style={{ fontSize: 10, color: textMuted }}>{timeAgo(post.timestamp)}</Text>
                            </View>
                          </View>
                        </View>
                        {userId === post.authorId && (
                          <TouchableOpacity
                            onPress={() => deletePost(post.id, post.authorId)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={16} color="#EF4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={{ fontSize: 14, color: textMain, lineHeight: 20 }}>{post.content}</Text>
                    </View>
                  );
                })
              )}
            </>
          )}

          {/* ── BULLETIN BOARD TAB ─────────────────────────────────────── */}
          {activeTab === "bulletin" && (
            <>
              <View style={{
                backgroundColor: darkMode ? "#1e293b" : "#EDE9FE",
                borderRadius: 14, padding: 12, marginBottom: 14,
                flexDirection: "row", alignItems: "flex-start", gap: 10,
              }}>
                <Pin size={16} color="#7C3AED" style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 12, color: darkMode ? "#c4b5fd" : "#5B21B6", lineHeight: 18 }}>
                  Bulletin notices are posted by drivers and auto-expire after <Text style={{ fontWeight: "800" }}>7 days</Text>. Only drivers can post here.
                </Text>
              </View>

              {bulletinItems.length === 0 ? (
                <View style={{
                  backgroundColor: card, borderRadius: 20, padding: 32,
                  alignItems: "center", borderWidth: 1, borderColor: cardBorder,
                }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>📌</Text>
                  <Text style={{ color: textMuted, fontWeight: "600", textAlign: "center" }}>
                    No bulletin notices.{"\n"}{role === "driver" ? "Pin important info for commuters!" : "Nothing posted yet."}
                  </Text>
                </View>
              ) : (
                bulletinItems.map(item => (
                  <View
                    key={item.id}
                    style={{
                      backgroundColor: card, borderRadius: 18, padding: 16, marginBottom: 12,
                      borderWidth: 1.5, borderColor: darkMode ? "#4C1D95" : "#DDD6FE",
                      shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
                    }}
                  >
                    {/* Bulletin header */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: darkMode ? "#4C1D95" : "#EDE9FE",
                        alignItems: "center", justifyContent: "center", marginRight: 10,
                      }}>
                        <Pin size={18} color="#7C3AED" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", fontSize: 13, color: textMain }}>{item.authorName}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Clock size={10} color={textMuted} />
                            <Text style={{ fontSize: 10, color: textMuted }}>{timeAgo(item.timestamp)}</Text>
                          </View>
                          <View style={{
                            backgroundColor: darkMode ? "#1e293b" : "#F3F4F6",
                            paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
                          }}>
                            <Text style={{ fontSize: 10, color: "#7C3AED", fontWeight: "700" }}>
                              ⏳ {timeUntilExpiry(item.expiresAt)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {userId === item.authorId && (
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <TouchableOpacity onPress={() => openEditBulletin(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Edit3 size={16} color="#7C3AED" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteBulletin(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Trash2 size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 14, color: textMain, lineHeight: 20 }}>{item.content}</Text>
                  </View>
                ))
              )}
            </>
          )}
        </View>
        {/* end community/bulletin section */}

      </ScrollView>

      {/* ── NEW COMMUNITY POST MODAL ─────────────────────────────────────── */}
      <Modal visible={postModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
            <View style={{
              backgroundColor: card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
              padding: 24, paddingBottom: 40,
            }}>
              <View style={{ width: 40, height: 5, backgroundColor: "#E5E7EB", borderRadius: 3, alignSelf: "center", marginBottom: 20 }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: textMain }}>New Post</Text>
                <TouchableOpacity onPress={() => setPostModalVisible(false)}>
                  <X color={textMuted} size={22} />
                </TouchableOpacity>
              </View>

              {/* Category picker */}
              <Text style={{ fontSize: 12, fontWeight: "700", color: textMuted, marginBottom: 10, textTransform: "uppercase" }}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
                {(Object.entries(POST_CATEGORY_CONFIG) as [PostCategory, typeof POST_CATEGORY_CONFIG[PostCategory]][]).map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setNewPostCategory(key)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                      flexDirection: "row", alignItems: "center", gap: 6,
                      backgroundColor: newPostCategory === key ? cfg.color : (darkMode ? "#0f172a" : "#F9FAFB"),
                      borderWidth: 1.5, borderColor: newPostCategory === key ? cfg.color : cardBorder,
                    }}
                  >
                    <Text>{cfg.emoji}</Text>
                    <Text style={{ fontWeight: "700", fontSize: 13, color: newPostCategory === key ? "white" : textMuted }}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Content input */}
              <Text style={{ fontSize: 12, fontWeight: "700", color: textMuted, marginBottom: 8, textTransform: "uppercase" }}>Message</Text>
              <TextInput
                value={newPostContent}
                onChangeText={setNewPostContent}
                placeholder={
                  newPostCategory === "road"         ? "e.g. Road closed at Camp 4 due to construction…" :
                  newPostCategory === "special"      ? "e.g. Special trips available for fiesta weekend…" :
                  newPostCategory === "lostandfound" ? "e.g. Found a black umbrella near Balacbac terminal…" :
                  "Share an update with commuters…"
                }
                placeholderTextColor={textMuted}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: darkMode ? "#0f172a" : "#F9FAFB",
                  borderWidth: 1.5, borderColor: cardBorder, borderRadius: 14,
                  paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 14, color: textMain, minHeight: 110,
                  textAlignVertical: "top",
                }}
              />

              <TouchableOpacity
                onPress={submitPost}
                disabled={!newPostContent.trim()}
                style={{
                  marginTop: 16, backgroundColor: newPostContent.trim() ? "#15803d" : (darkMode ? "#1e293b" : "#E5E7EB"),
                  borderRadius: 14, paddingVertical: 16,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Send color={newPostContent.trim() ? "white" : textMuted} size={18} />
                <Text style={{ fontWeight: "700", fontSize: 15, color: newPostContent.trim() ? "white" : textMuted }}>
                  Post Update
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── BULLETIN ADD / EDIT MODAL ────────────────────────────────────── */}
      <Modal visible={bulletinModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
            <View style={{
              backgroundColor: card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
              padding: 24, paddingBottom: 40,
            }}>
              <View style={{ width: 40, height: 5, backgroundColor: "#E5E7EB", borderRadius: 3, alignSelf: "center", marginBottom: 20 }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: textMain }}>
                  {editingBulletin ? "Edit Notice" : "New Bulletin Notice"}
                </Text>
                <TouchableOpacity onPress={() => { setBulletinModalVisible(false); setEditingBulletin(null); }}>
                  <X color={textMuted} size={22} />
                </TouchableOpacity>
              </View>

              <View style={{
                backgroundColor: darkMode ? "#1e293b" : "#EDE9FE", borderRadius: 12,
                padding: 12, marginBottom: 16, flexDirection: "row", alignItems: "flex-start", gap: 8,
              }}>
                <AlertTriangle size={14} color="#7C3AED" style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 12, color: darkMode ? "#c4b5fd" : "#5B21B6", lineHeight: 18 }}>
                  This notice will be visible to all commuters and <Text style={{ fontWeight: "800" }}>automatically removed after 7 days</Text>.
                </Text>
              </View>

              <Text style={{ fontSize: 12, fontWeight: "700", color: textMuted, marginBottom: 8, textTransform: "uppercase" }}>Notice</Text>
              <TextInput
                value={bulletinContent}
                onChangeText={setBulletinContent}
                placeholder="e.g. Jeep 4A will run special trips on Saturday morning…"
                placeholderTextColor={textMuted}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: darkMode ? "#0f172a" : "#F9FAFB",
                  borderWidth: 1.5, borderColor: cardBorder, borderRadius: 14,
                  paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 14, color: textMain, minHeight: 110,
                  textAlignVertical: "top",
                }}
              />

              <TouchableOpacity
                onPress={saveBulletin}
                disabled={!bulletinContent.trim()}
                style={{
                  marginTop: 16,
                  backgroundColor: bulletinContent.trim() ? "#7C3AED" : (darkMode ? "#1e293b" : "#E5E7EB"),
                  borderRadius: 14, paddingVertical: 16,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Pin color={bulletinContent.trim() ? "white" : textMuted} size={18} />
                <Text style={{ fontWeight: "700", fontSize: 15, color: bulletinContent.trim() ? "white" : textMuted }}>
                  {editingBulletin ? "Save Changes" : "Pin Notice"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
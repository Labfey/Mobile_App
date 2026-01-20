import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, BusFront, User, Car } from "lucide-react-native";
import { useTheme } from "../ThemeContext";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { auth, db, ref, get } from "../../services/firebase";

export default function HomeScreen() {
  const { darkMode } = useTheme();
  const router = useRouter();
  
  const [role, setRole] = useState<'passenger' | 'driver' | 'guest'>('guest'); 
  const [userName, setUserName] = useState("Commuter");
  const [loading, setLoading] = useState(true);

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
        setRole('guest'); // No login required for passengers/commuters
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const goToMap = () => router.push("/mapscreen");

  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="green" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${darkMode ? 'bg-black' : 'bg-[#F9FAFB]'}`}>
      {/* HEADER */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <View>
          <Text className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-green-700'}`}>JeepRoute</Text>
          <Text className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Baguio City Transit</Text>
        </View>
        <TouchableOpacity 
          onPress={() => auth.currentUser ? router.push("/profile") : router.push("/login" as any)}
          className="bg-green-700 rounded-full p-2"
        >
          <User color="white" size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView className="mt-4">
        {/* DRIVER VIEW */}
        {role === 'driver' && (
          <View className="px-5 mb-6">
            <View className={`p-5 rounded-3xl shadow-sm ${darkMode ? 'bg-gray-800' : 'bg-green-700'}`}>
              <Text className="text-white text-lg font-bold">Welcome, Driver {userName}!</Text>
              <Text className="text-white/80 text-sm mb-4">Ready to start your Balacbac route?</Text>
              <TouchableOpacity 
                onPress={goToMap}
                className="bg-white py-3 rounded-xl items-center flex-row justify-center"
              >
                <Car color="#15803d" size={20} className="mr-2" />
                <Text className="text-green-800 font-bold">START ROUTE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* COMMUTER VIEW (GUEST OR PASSENGER) */}
        {(role === 'passenger' || role === 'guest') && (
          <View className="px-5 mb-4">
            <Text className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              Hello, {userName}!
            </Text>
            <Text className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Track live jeeps and check fare zones.
            </Text>
          </View>
        )}

        {/* MAP PREVIEW CARD */}
        <TouchableOpacity
          onPress={goToMap}
          activeOpacity={0.7}
          className={`mx-5 h-52 rounded-3xl items-center justify-center shadow-sm ${darkMode ? 'bg-gray-800' : 'bg-green-100'}`}
        >
          <MapPin color={darkMode ? "#4ade80" : "#166534"} size={50} /> 
          <Text className={`mt-2 text-base font-bold ${darkMode ? 'text-white' : 'text-green-800'}`}>Open Live Map</Text>
        </TouchableOpacity>

        <View className="px-5 mt-8">
          <Text className={`text-lg font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-800'}`}>Available Routes</Text>
          <TouchableOpacity onPress={goToMap} className={`rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <View className="flex-row items-center">
              <View className="bg-green-100 p-2 rounded-lg mr-3">
                <BusFront color="#15803d" size={20} />
              </View>
              <View>
                <Text className={`text-base font-bold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>Balacbac Route</Text>
                <Text className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Active tracking enabled</Text>
              </View>
            </View>
            <Text className="text-green-600 font-bold">VIEW</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
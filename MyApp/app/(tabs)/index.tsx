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
  const [userName, setUserName] = useState("Guest");
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
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const goToMap = () => {
    router.push("/mapscreen");
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="green" />
      </SafeAreaView>
    );
  }

  if (role === 'driver') {
    return (
      <SafeAreaView className={`flex-1 ${darkMode ? 'bg-black' : 'bg-gray-100'}`}>
        <View className="p-6">
          <Text className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-green-800'}`}>
            Driver Dashboard
          </Text>
          <Text className="text-gray-500 mb-6">Welcome back, {userName}</Text>

          <TouchableOpacity 
            onPress={goToMap}
            className="bg-green-700 p-6 rounded-2xl flex-row items-center justify-between mb-4"
          >
            <View>
              <Text className="text-white text-xl font-bold">Start Route</Text>
              <Text className="text-green-100">Go Online & Pick up Passengers</Text>
            </View>
            <Car color="white" size={40} />
          </TouchableOpacity>

          <View className="bg-white p-4 rounded-xl shadow-sm">
            <Text className="font-bold text-gray-700">Assigned Route</Text>
            <Text className="text-lg text-green-700 mt-1">Balacbac ↔ Town</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${darkMode ? 'bg-black' : 'bg-[#F9FAFB]'}`}>
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-green-700'}`}>
          JeepRoute
        </Text>
        <TouchableOpacity className="bg-green-700 rounded-full p-2">
          <User color="white" size={22} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={goToMap}
        activeOpacity={0.7}
        className={`mx-5 mt-2 mb-4 h-52 rounded-2xl items-center justify-center ${
          darkMode ? 'bg-gray-800' : 'bg-green-100' 
        }`}
      >
        <MapPin color={darkMode ? "#9AE6B4" : "#166534"} size={50} /> 
        <Text className={`mt-2 text-base font-medium ${darkMode ? 'text-white' : 'text-green-800'}`}>
          Baguio City
        </Text>
        <Text className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
          Tap to view live map
        </Text>
      </TouchableOpacity>

      <ScrollView className="px-5">
        <Text className={`text-lg font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
          Active Routes
        </Text>

        <TouchableOpacity onPress={goToMap} className={`rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <View>
            <Text className={`text-base font-semibold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
              Balacbac Route
            </Text>
            <Text className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
              Tap to see available jeeps
            </Text>
          </View>
          <BusFront color={darkMode ? "#9AE6B4" : "#15803D"} size={28} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
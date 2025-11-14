import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, Navigation, BusFront, User } from "lucide-react-native";
import { useTheme } from "../ThemeContext"; // ✅ Dark Mode Edit

export default function HomeScreen() {
  const { darkMode } = useTheme(); // ✅ Dark Mode Edit

  return (
    <SafeAreaView
      className={`flex-1 ${darkMode ? 'bg-black' : 'bg-[#F9FAFB]'}`} // ✅ Dark Mode Edit
    >
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text
          className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-green-700'}`} // ✅ Dark Mode Edit
        >
          JeepRoute
        </Text>
        <TouchableOpacity className="bg-green-700 rounded-full p-2">
          <User color="white" size={22} />
        </TouchableOpacity>
      </View>

      {/* Map Preview */}
      <View
        className={`mx-5 mt-2 mb-4 h-52 rounded-2xl items-center justify-center ${
          darkMode ? 'bg-gray-800' : 'bg-green-100' // ✅ Dark Mode Edit
        }`}
      >
        <MapPin color={darkMode ? "#9AE6B4" : "#166534"} size={50} /> {/* ✅ Dark Mode Edit */}
        <Text
          className={`mt-2 text-base font-medium ${
            darkMode ? 'text-white' : 'text-green-800' // ✅ Dark Mode Edit
          }`}
        >
          Baguio City
        </Text>
        <Text
          className={`text-xs ${
            darkMode ? 'text-gray-300' : 'text-gray-500' // ✅ Dark Mode Edit
          }`}
        >
          Your current location
        </Text>
      </View>

      {/* Active Jeepneys */}
      <ScrollView className="px-5">
        <Text
          className={`text-lg font-semibold mb-3 ${
            darkMode ? 'text-white' : 'text-gray-800' // ✅ Dark Mode Edit
          }`}
        >
          Jeeps Nearby
        </Text>

        {/* Jeep Card */}
        <View
          className={`rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center ${
            darkMode ? 'bg-gray-800' : 'bg-white' // ✅ Dark Mode Edit
          }`}
        >
          <View>
            <Text
              className={`text-base font-semibold ${
                darkMode ? 'text-green-400' : 'text-green-700' // ✅ Dark Mode Edit
              }`}
            >
              Jeep
            </Text>
            <Text
              className={`text-xs ${
                darkMode ? 'text-gray-300' : 'text-gray-500' // ✅ Dark Mode Edit
              }`}
            >
              ETA: 3 mins
            </Text>
          </View>
          <BusFront color={darkMode ? "#9AE6B4" : "#15803D"} size={28} /> {/* ✅ Dark Mode Edit */}
        </View>

        {/* Repeat Jeep Card */}
        <View
          className={`rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center ${
            darkMode ? 'bg-gray-800' : 'bg-white' // ✅ Dark Mode Edit
          }`}
        >
          <View>
            <Text
              className={`text-base font-semibold ${
                darkMode ? 'text-green-400' : 'text-green-700' // ✅ Dark Mode Edit
              }`}
            >
              Jeep
            </Text>
            <Text
              className={`text-xs ${
                darkMode ? 'text-gray-300' : 'text-gray-500' // ✅ Dark Mode Edit
              }`}
            >
              ETA: 5 mins
            </Text>
          </View>
          <BusFront color={darkMode ? "#9AE6B4" : "#15803D"} size={28} /> {/* ✅ Dark Mode Edit */}
        </View>

        <View
          className={`rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center ${
            darkMode ? 'bg-gray-800' : 'bg-white' // ✅ Dark Mode Edit
          }`}
        >
          <View>
            <Text
              className={`text-base font-semibold ${
                darkMode ? 'text-green-400' : 'text-green-700' // ✅ Dark Mode Edit
              }`}
            >
              Jeep
            </Text>
            <Text
              className={`text-xs ${
                darkMode ? 'text-gray-300' : 'text-gray-500' // ✅ Dark Mode Edit
              }`}
            >
              ETA: 7 mins
            </Text>
          </View>
          <BusFront color={darkMode ? "#9AE6B4" : "#15803D"} size={28} /> {/* ✅ Dark Mode Edit */}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

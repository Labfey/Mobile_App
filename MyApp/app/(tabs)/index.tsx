import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, Navigation, BusFront, User } from "lucide-react-native";
import { useTheme } from "../ThemeContext";

export default function HomeScreen() {
  const { darkMode } = useTheme(); 

  return (
    <SafeAreaView
      className={`flex-1 ${darkMode ? 'bg-black' : 'bg-[#F9FAFB]'}`} 
    >
      
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text
          className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-green-700'}`} 
        >
          JeepRoute
        </Text>
        <TouchableOpacity className="bg-green-700 rounded-full p-2">
          <User color="white" size={22} />
        </TouchableOpacity>
      </View>

      <View
        className={`mx-5 mt-2 mb-4 h-52 rounded-2xl items-center justify-center ${
          darkMode ? 'bg-gray-800' : 'bg-green-100' 
        }`}
      >
        <MapPin color={darkMode ? "#9AE6B4" : "#166534"} size={50} /> 
        <Text
          className={`mt-2 text-base font-medium ${
            darkMode ? 'text-white' : 'text-green-800' 
          }`}
        >
          Baguio City
        </Text>
        <Text
          className={`text-xs ${
            darkMode ? 'text-gray-300' : 'text-gray-500' 
          }`}
        >
          Your current location
        </Text>
      </View>

      
      <ScrollView className="px-5">
        <Text
          className={`text-lg font-semibold mb-3 ${
            darkMode ? 'text-white' : 'text-gray-800' 
          }`}
        >
          Jeeps Nearby
        </Text>

        
        <View
          className={`rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center ${
            darkMode ? 'bg-gray-800' : 'bg-white' 
          }`}
        >
          <View>
            <Text
              className={`text-base font-semibold ${
                darkMode ? 'text-green-400' : 'text-green-700'
              }`}
            >
              Jeep
            </Text>
            <Text
              className={`text-xs ${
                darkMode ? 'text-gray-300' : 'text-gray-500' 
              }`}
            >
              ETA: 3 mins
            </Text>
          </View>
          <BusFront color={darkMode ? "#9AE6B4" : "#15803D"} size={28} />
        </View>

      
        <View
          className={`rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center ${
            darkMode ? 'bg-gray-800' : 'bg-white' 
          }`}
        >
          <View>
            <Text
              className={`text-base font-semibold ${
                darkMode ? 'text-green-400' : 'text-green-700' 
              }`}
            >
              Jeep
            </Text>
            <Text
              className={`text-xs ${
                darkMode ? 'text-gray-300' : 'text-gray-500'
              }`}
            >
              ETA: 5 mins
            </Text>
          </View>
          <BusFront color={darkMode ? "#9AE6B4" : "#15803D"} size={28} />
        </View>

        <View
          className={`rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`}
        >
          <View>
            <Text
              className={`text-base font-semibold ${
                darkMode ? 'text-green-400' : 'text-green-700' 
              }`}
            >
              Jeep
            </Text>
            <Text
              className={`text-xs ${
                darkMode ? 'text-gray-300' : 'text-gray-500' 
              }`}
            >
              ETA: 7 mins
            </Text>
          </View>
          <BusFront color={darkMode ? "#9AE6B4" : "#15803D"} size={28} /> 
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

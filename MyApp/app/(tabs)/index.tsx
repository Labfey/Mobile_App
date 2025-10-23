import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, Navigation, BusFront, User } from "lucide-react-native";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#F9FAFB]">
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-green-700">JeepRoute</Text>
        <TouchableOpacity className="bg-green-700 rounded-full p-2">
          <User color="white" size={22} />
        </TouchableOpacity>
      </View>

      {/* Map Preview */}
      <View className="mx-5 mt-2 mb-4 h-52 rounded-2xl bg-green-100 items-center justify-center">
        <MapPin color="#166534" size={50} />
        <Text className="text-green-800 mt-2 text-base font-medium">
          Baguio City
        </Text>
        <Text className="text-gray-500 text-xs">Your current location</Text>
      </View>

      {/* Active Jeepneys */}
      <ScrollView className="px-5">
        <Text className="text-lg font-semibold text-gray-800 mb-3">
          Jeeps Nearby
        </Text>

        <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center">
          <View>
            <Text className="text-base font-semibold text-green-700">
              Jeep
            </Text>
            <Text className="text-gray-500 text-xs">ETA: 3 mins</Text>
          </View>
          <BusFront color="#15803D" size={28} />
        </View>

        <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center">
          <View>
            <Text className="text-base font-semibold text-green-700">
              Jeep
            </Text>
            <Text className="text-gray-500 text-xs">ETA: 5 mins</Text>
          </View>
          <BusFront color="#15803D" size={28} />
        </View>

        <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center">
          <View>
            <Text className="text-base font-semibold text-green-700">
              Jeep
            </Text>
            <Text className="text-gray-500 text-xs">ETA: 7 mins</Text>
          </View>
          <BusFront color="#15803D" size={28} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

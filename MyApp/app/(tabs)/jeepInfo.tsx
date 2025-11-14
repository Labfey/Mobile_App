import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { BusFront } from "lucide-react-native";

const jeepneys = [
  { id: "1", route: "Trancoville – Centro", plate: "ABC-1234", driver: "Mang Juan" },
  { id: "2", route: "Aurora Hill – Plaza", plate: "XYZ-5678", driver: "Mang Bert" },
  { id: "3", route: "Loakan – Session", plate: "JKL-9101", driver: "Mang Tomas" },
];

export default function JeepInfoScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white p-5">
      <Text className="text-3xl font-bold text-green-900 mb-4">Jeepney List</Text>

      <FlatList
        data={jeepneys}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Link
            href={`/jeep/${item.id}`}
            asChild
          >
            <TouchableOpacity className="bg-green-700 p-4 rounded-2xl mb-3 flex-row items-center">
              <BusFront color="white" size={32} />
              <View className="ml-4">
                <Text className="text-white text-xl font-semibold">{item.route}</Text>
                <Text className="text-white/80">{item.plate}</Text>
              </View>
            </TouchableOpacity>
          </Link>
        )}
      />
    </SafeAreaView>
  );
}

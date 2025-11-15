import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

const jeepneys = {
  "1": { route: "Jeep 1", plate: "ABC-1234", driver: "Mang Tomas",},
  "2": { route: "Jeep 2", plate: "XYZ-5678", driver: "Mang Tomas",},
  "3": { route: "Jeep 3", plate: "JKL-9101", driver: "Mang Tomas",},
};

export default function JeepProfile() {
  const { id } = useLocalSearchParams();
  const jeep = jeepneys[id];

  if (!jeep) {
    return (
      <SafeAreaView className="flex-1 p-5">
        <Text className="text-xl font-bold text-red-600">Jeepney not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white p-5">
      <Text className="text-3xl font-bold text-green-900 mb-4">Jeepney Details</Text>

      <View className="bg-green-100 p-5 rounded-2xl mb-4">
        <Text className="text-xl font-semibold">{jeep.route}</Text>
        <Text className="text-gray-700 mt-1">Plate Number: {jeep.plate}</Text>
        <Text className="text-gray-700 mt-1">Driver: {jeep.driver}</Text>
        <Text className="text-gray-700 mt-1">Capacity: {jeep.capacity} passengers</Text>
      </View>

      <Text className="text-lg text-gray-600">
        Lorem ipsum dolor sit amet consectetur, adipisicing elit. Eum itaque ullam soluta, consectetur est eos ipsam nobis earum eius dignissimos qui voluptatibus. Nisi laudantium facilis, consequuntur quam cum non voluptas.
      </Text>
    </SafeAreaView>
  );
}

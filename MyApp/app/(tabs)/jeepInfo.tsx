import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { BusFront } from "lucide-react-native";
import { useTheme } from "../ThemeContext";

const jeepneys = [
  { id: "1", route: "Balacbac – Town", plate: "ABC-1234", driver: "Mang Juan" },
  { id: "2", route: "Balacbac – Town", plate: "XYZ-5678", driver: "Mang Bert" },
  { id: "3", route: "Balacbac – Town", plate: "JKL-9101", driver: "Mang Tomas" },
];

export default function JeepInfoScreen() {
  const { darkMode } = useTheme();

  return (
    <SafeAreaView 
      className={`flex-1 p-5 ${darkMode ? "bg-black" : "bg-white"}`}
    >
      <Text 
        className={`text-3xl font-bold mb-4 ${darkMode ? "text-white" : "text-green-900"}`}
      >
        Jeepney List
      </Text>

      <FlatList
        data={jeepneys}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Link
            href={`/jeep/${item.id}`}
            asChild
          >
            <TouchableOpacity 
              className={`p-4 rounded-2xl mb-3 flex-row items-center ${
                darkMode ? "bg-gray-800" : "bg-green-700"
              }`}
            >
              <BusFront color={darkMode ? "#4ade80" : "white"} size={32} />
              <View className="ml-4">
                <Text 
                  className={`text-xl font-semibold ${darkMode ? "text-white" : "text-white"}`}
                >
                  {item.route}
                </Text>
                <Text 
                  className={`${darkMode ? "text-gray-400" : "text-white/80"}`}
                >
                  {item.plate}
                </Text>
              </View>
            </TouchableOpacity>
          </Link>
        )}
      />
    </SafeAreaView>
  );
}
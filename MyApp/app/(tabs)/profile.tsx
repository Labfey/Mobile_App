import { View, Text, Image, TouchableOpacity, ScrollView } from "react-native";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";

const JEEP_GREEN = "#2E7D32";

export default function Profile() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView>

        {/* HEADER */}
        <View
          style={{ backgroundColor: JEEP_GREEN }}
          className="h-56 rounded-b-[40px] items-center justify-center px-6"
        >
          <Image
            source={{ uri: "https://i.pravatar.cc/200" }}
            className="w-32 h-32 rounded-full border-4 border-white shadow-lg"
          />
          <Text className="text-white text-2xl font-bold mt-3">
            John Doe
          </Text>
          <Text className="text-white text-sm opacity-90">
            JeepRoute User
          </Text>
        </View>

        {/* PROFILE CARD */}
        <View className="px-6 -mt-10">
          <View className="bg-white p-6 rounded-3xl shadow-xl">
            <Text className="text-gray-500 text-sm">Email</Text>
            <Text className="text-lg font-semibold mb-4">
              Email@example.com
            </Text>

            <Text className="text-gray-500 text-sm">Phone</Text>
            <Text className="text-lg font-semibold mb-4">
              xxxx xxx xxxx
            </Text>

            <Text className="text-gray-500 text-sm">Location</Text>
            <Text className="text-lg font-semibold">
              Baguio City
            </Text>
          </View>
        </View>

        {/* ACTION BUTTONS */}
        <View className="px-6 mt-8 space-y-4 mb-10">
          <TouchableOpacity
            style={{ backgroundColor: JEEP_GREEN }}
            className="p-4 rounded-2xl"
          >
            <Text className="text-white text-center font-semibold text-base">
              Edit Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-gray-200 p-4 rounded-2xl">
            <Text className="text-center font-semibold text-base">
              Settings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-red-500 p-4 rounded-2xl">
            <Text className="text-white text-center font-semibold text-base">
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

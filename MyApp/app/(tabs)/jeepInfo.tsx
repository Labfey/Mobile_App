import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, Modal, TextInput, Alert, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { BusFront, Edit, X, Save, User } from "lucide-react-native"; 
import { useTheme } from "../ThemeContext";
import { ref, onValue, update, get } from "firebase/database";
import { auth, db } from "../../services/firebase";

export default function JeepInfoScreen() {
  const { darkMode } = useTheme();
  
  const [jeepList, setJeepList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDriver, setIsDriver] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Added profilePic to the state
  const [myInfo, setMyInfo] = useState({
    driverName: '',
    plate: '',
    route: 'Balacbac – Town',
    profilePic: '' // For the driver's image URL
  });

  useEffect(() => {
    const checkRole = async () => {
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        const userRef = ref(db, `users/${uid}`);
        
        try {
          const snapshot = await get(userRef);
          if (snapshot.exists() && snapshot.val().role === 'driver') {
            setIsDriver(true);
            
            const myJeepRef = ref(db, `jeep_info/${uid}`);
            const jeepSnap = await get(myJeepRef);
            if (jeepSnap.exists()) {
              setMyInfo(jeepSnap.val());
            }
          }
        } catch (error) {
          console.log("Error fetching role:", error);
        }
      }
    };
    checkRole();

    const infoRef = ref(db, 'jeep_info');
    const unsubscribe = onValue(infoRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const formattedList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setJeepList(formattedList);
      } else {
        setJeepList([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!auth.currentUser) return;

    try {
      if (!myInfo.driverName || !myInfo.plate) {
        Alert.alert("Error", "Please fill in all fields");
        return;
      }

      const uid = auth.currentUser.uid; 
      await update(ref(db, `jeep_info/${uid}`), {
        driverName: myInfo.driverName,
        plate: myInfo.plate,
        route: myInfo.route,
        profilePic: myInfo.profilePic || "", // Saves the picture URL
        updatedAt: Date.now()
      });
      
      Alert.alert("Success", "Your profile has been updated!");
      setModalVisible(false);
    } catch (error) {
      Alert.alert("Error", "Could not save info.");
    }
  };

  const bg = darkMode ? "bg-black" : "bg-white";
  const textMain = darkMode ? "text-white" : "text-green-900";
  const cardBg = darkMode ? "bg-gray-800" : "bg-green-700";
  const subText = darkMode ? "text-gray-400" : "text-white/80";
  const inputBorder = darkMode ? "border-gray-700 text-white" : "border-gray-300 text-black";
  const modalBg = darkMode ? "bg-gray-900" : "bg-white";

  return (
    <SafeAreaView className={`flex-1 p-5 ${bg}`}>
      <View className="flex-row justify-between items-center mb-4">
        <Text className={`text-3xl font-bold ${textMain}`}>Jeepney List</Text>
        {isDriver && (
          <TouchableOpacity 
            onPress={() => setModalVisible(true)}
            className="bg-blue-600 p-2 rounded-full flex-row items-center px-4 shadow-sm"
          >
            <Edit color="white" size={16} />
            <Text className="text-white font-bold ml-2">Edit My Jeep</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#15803D" className="mt-10" />
      ) : (
        <FlatList
          data={jeepList}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            // This Link now goes to your dynamic [id].tsx profile page
            <Link href={`/jeep/${item.id}`} asChild>
              <TouchableOpacity className={`p-4 rounded-2xl mb-3 flex-row items-center ${cardBg} shadow-sm`}>
                {item.profilePic ? (
                  <Image source={{ uri: item.profilePic }} className="w-12 h-12 rounded-full border-2 border-white" />
                ) : (
                  <View className="bg-white/20 p-2 rounded-full">
                    <BusFront color="white" size={28} />
                  </View>
                )}
                <View className="ml-4 flex-1">
                  <Text className="text-xl font-bold text-white">{item.route}</Text>
                  <Text className={subText}>Plate: {item.plate}</Text>
                  <Text className="text-xs mt-1 text-green-200">Driver: {item.driverName}</Text>
                </View>
              </TouchableOpacity>
            </Link>
          )}
        />
      )}

      {/* EDIT MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className={`w-[85%] p-6 rounded-2xl shadow-lg ${modalBg}`}>
            <Text className={`text-xl font-bold mb-4 ${textMain}`}>Update My Profile</Text>
            
            <Text className={`text-sm mb-1 font-semibold ${subText}`}>Driver Name</Text>
            <TextInput 
              value={myInfo.driverName}
              onChangeText={(t) => setMyInfo({...myInfo, driverName: t})}
              className={`p-3 border rounded-lg mb-3 ${inputBorder}`}
            />

            <Text className={`text-sm mb-1 font-semibold ${subText}`}>Plate Number</Text>
            <TextInput 
              value={myInfo.plate}
              onChangeText={(t) => setMyInfo({...myInfo, plate: t})}
              className={`p-3 border rounded-lg mb-3 ${inputBorder}`}
            />

            <Text className={`text-sm mb-1 font-semibold ${subText}`}>Profile Photo URL</Text>
            <TextInput 
              value={myInfo.profilePic}
              onChangeText={(t) => setMyInfo({...myInfo, profilePic: t})}
              className={`p-3 border rounded-lg mb-6 ${inputBorder}`}
              placeholder="Paste image link here"
            />

            <View className="flex-row justify-end gap-3">
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-3 bg-gray-500 rounded-lg">
                <X color="white" size={24} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} className="p-3 bg-green-600 rounded-lg flex-row items-center px-6">
                <Save color="white" size={20} />
                <Text className="text-white font-bold ml-2">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
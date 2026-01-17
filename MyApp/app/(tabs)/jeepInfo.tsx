import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, Modal, TextInput, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { BusFront, Edit, X, Save } from "lucide-react-native"; 
import { useTheme } from "../ThemeContext";
import { ref, onValue, update, get } from "firebase/database";
import { auth, db } from "../../services/firebase";

export default function JeepInfoScreen() {
  const { darkMode } = useTheme();
  
  // STATE VARIABLES
  const [jeepList, setJeepList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDriver, setIsDriver] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // FORM STATE (For editing info)
  const [myInfo, setMyInfo] = useState({
    driverName: '',
    plate: '',
    route: 'Balacbac – Town' // Default route
  });

  // 1. INITIAL SETUP: Check Role & Listen to Database
  useEffect(() => {
    // A. Check User Role (Driver vs Passenger)
    const checkRole = async () => {
      // FIX: We check if currentUser exists before using it
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        const userRef = ref(db, `users/${uid}`);
        
        try {
          const snapshot = await get(userRef);
          if (snapshot.exists() && snapshot.val().role === 'driver') {
            setIsDriver(true);
            
            // If they are a driver, fetch their existing jeep info to fill the form
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

    // B. Listen for REAL-TIME updates to the Jeep List
    const infoRef = ref(db, 'jeep_info');
    const unsubscribe = onValue(infoRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        // Convert the database object into an array list
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

    // Cleanup listener when leaving screen
    return () => unsubscribe();
  }, []);

  // 2. SAVE FUNCTION (Fixes the 'null' error)
  const handleSave = async () => {
    // FIX: This 'Guard Clause' stops the error. 
    // If no user is logged in, the function stops here.
    if (!auth.currentUser) {
      Alert.alert("Error", "You must be logged in to edit info.");
      return;
    }

    try {
      if (!myInfo.driverName || !myInfo.plate) {
        Alert.alert("Error", "Please fill in all fields");
        return;
      }

      // Now it's safe to use .uid because we checked above
      const uid = auth.currentUser.uid; 

      await update(ref(db, `jeep_info/${uid}`), {
        driverName: myInfo.driverName,
        plate: myInfo.plate,
        route: myInfo.route,
        updatedAt: Date.now()
      });
      
      Alert.alert("Success", "Jeep info updated!");
      setModalVisible(false);
    } catch (error) {
      Alert.alert("Error", "Could not save info. Check your connection.");
    }
  };

  // THEME COLORS
  const bg = darkMode ? "bg-black" : "bg-white";
  const textMain = darkMode ? "text-white" : "text-green-900";
  const cardBg = darkMode ? "bg-gray-800" : "bg-green-700";
  const subText = darkMode ? "text-gray-400" : "text-white/80";
  const inputBorder = darkMode ? "border-gray-700 text-white" : "border-gray-300 text-black";
  const modalBg = darkMode ? "bg-gray-900" : "bg-white";

  return (
    <SafeAreaView className={`flex-1 p-5 ${bg}`}>
      
      {/* HEADER */}
      <View className="flex-row justify-between items-center mb-4">
        <Text className={`text-3xl font-bold ${textMain}`}>
          Jeepney List
        </Text>
        
        {/* Only Drivers see this button */}
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

      {/* LIST OF JEEPS */}
      {loading ? (
        <ActivityIndicator size="large" color="#15803D" className="mt-10" />
      ) : (
        <FlatList
          data={jeepList}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text className="text-gray-500 text-center mt-10 italic">
              No active jeepneys listed yet.
            </Text>
          }
          renderItem={({ item }) => (
            <Link href={`/jeep/${item.id}`} asChild>
              <TouchableOpacity className={`p-4 rounded-2xl mb-3 flex-row items-center ${cardBg} shadow-sm`}>
                <BusFront color={darkMode ? "#4ade80" : "white"} size={32} />
                <View className="ml-4">
                  <Text className={`text-xl font-bold text-white`}>
                    {item.route}
                  </Text>
                  <Text className={subText}>
                    Plate: {item.plate}
                  </Text>
                  <Text className={`text-xs mt-1 ${darkMode ? "text-gray-500" : "text-green-200"}`}>
                    Driver: {item.driverName}
                  </Text>
                </View>
              </TouchableOpacity>
            </Link>
          )}
        />
      )}

      {/* EDIT MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className={`w-[85%] p-6 rounded-2xl shadow-lg ${modalBg}`}>
            <Text className={`text-xl font-bold mb-4 ${textMain}`}>Update Jeep Information</Text>
            
            <Text className={`text-sm mb-1 font-semibold ${subText}`}>Driver Name</Text>
            <TextInput 
              value={myInfo.driverName}
              onChangeText={(t) => setMyInfo({...myInfo, driverName: t})}
              className={`p-3 border rounded-lg mb-3 ${inputBorder}`}
              placeholder="e.g. Mang Juan"
              placeholderTextColor="gray"
            />

            <Text className={`text-sm mb-1 font-semibold ${subText}`}>Plate Number</Text>
            <TextInput 
              value={myInfo.plate}
              onChangeText={(t) => setMyInfo({...myInfo, plate: t})}
              className={`p-3 border rounded-lg mb-3 ${inputBorder}`}
              placeholder="e.g. ABC-1234"
              placeholderTextColor="gray"
            />

            <Text className={`text-sm mb-1 font-semibold ${subText}`}>Route</Text>
            <TextInput 
              value={myInfo.route}
              editable={false} 
              className={`p-3 border rounded-lg mb-6 bg-gray-200 ${darkMode ? "bg-gray-800 text-gray-500 border-gray-700" : "text-gray-500 border-gray-300"}`}
            />

            <View className="flex-row justify-end gap-3">
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-3 bg-gray-500 rounded-lg items-center justify-center">
                <X color="white" size={24} />
              </TouchableOpacity>
              
              <TouchableOpacity onPress={handleSave} className="p-3 bg-green-600 rounded-lg flex-row items-center px-6 shadow-sm">
                <Save color="white" size={20} />
                <Text className="text-white font-bold ml-2">Save Info</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
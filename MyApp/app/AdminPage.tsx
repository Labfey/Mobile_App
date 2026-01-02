import React, { useState } from "react";
import { 
    View, 
    Text, 
    StyleSheet, 
    TextInput, 
    TouchableOpacity, 
    Alert, 
    ScrollView,
    ActivityIndicator 
} from "react-native";
import { ArrowLeft, User, Mail, Lock, CreditCard } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
// Import modular Firebase Functions tools
import { getFunctions, httpsCallable } from "firebase/functions";
// Import the initialized app instance (assuming it's exported from your service file)
import { app } from "../services/firebase"; 

// 1. FIX: Define the expected data structure for the Cloud Function result
interface DriverRegistrationResult {
    uid: string;
    name: string;
}

export default function AdminScreen() {
    const navigation = useNavigation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [plate, setPlate] = useState('');
    const [loading, setLoading] = useState(false);

    // Function to call the secure Cloud Function
    const handleRegisterDriver = async () => {
        if (!email || !password || !name || !plate) {
            Alert.alert("Missing Fields", "Please fill out all required driver information.");
            return;
        }

        setLoading(true);

        try {
            const functions = getFunctions(app);
            const registerDriver = httpsCallable(functions, 'registerDriverByAdmin');
            
            // 2. Call the function with driver data
            const response = await registerDriver({ 
                email: email.trim(), 
                password: password, 
                name: name.trim(), 
                plate: plate.trim() 
            });

            // 3. FIX: Cast the response.data to the defined interface
            const resultData = response.data as DriverRegistrationResult;

            // 4. Success handling (using the typed resultData)
            Alert.alert(
                "Driver Registered", 
                `Account created for ${resultData.name} (UID: ${resultData.uid}). Role set to 'driver'.`,
                [{ text: "OK", onPress: resetForm }]
            );

        } catch (error: any) { // 'error: any' fixes the 'error is of type unknown' issue
            
            console.error("Cloud Function Error:", error);
            let errorMessage = "Failed to register driver. Check console for details.";
            
            if (error.code === 'already-exists') {
                errorMessage = "This email is already linked to an account.";
            } else if (error.code === 'permission-denied') {
                errorMessage = "Access denied. Only authenticated admins can perform this action.";
            } else if (error.message) {
                 errorMessage = error.message; 
            }

            Alert.alert("Registration Error", errorMessage);

        } finally {
            setLoading(false);
        }
    };
    
    const resetForm = () => {
        setEmail('');
        setPassword('');
        setName('');
        setPlate('');
    }

    return (
        <View style={s.container}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                <ArrowLeft color="#1e293b" size={24} />
            </TouchableOpacity>

            <ScrollView contentContainerStyle={s.scrollContent}>
                <Text style={s.header}>Admin Control Panel</Text>
                <Text style={s.subHeader}>Secure Driver Registration</Text>

                <View style={s.formContainer}>
                    {/* --- Input: Driver Email --- */}
                    <View style={s.inputGroup}>
                        <Mail color="#6B7280" size={20} style={s.icon}/>
                        <TextInput
                            style={s.input}
                            placeholder="Driver Email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>

                    {/* --- Input: Temporary Password --- */}
                    <View style={s.inputGroup}>
                        <Lock color="#6B7280" size={20} style={s.icon}/>
                        <TextInput
                            style={s.input}
                            placeholder="Temporary Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                    </View>

                    {/* --- Input: Driver Name --- */}
                    <View style={s.inputGroup}>
                        <User color="#6B7280" size={20} style={s.icon}/>
                        <TextInput
                            style={s.input}
                            placeholder="Driver Full Name"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                        />
                    </View>

                    {/* --- Input: Plate Number --- */}
                    <View style={s.inputGroup}>
                        <CreditCard color="#6B7280" size={20} style={s.icon}/>
                        <TextInput
                            style={s.input}
                            placeholder="Plate Number (e.g., ABC-123)"
                            value={plate}
                            onChangeText={setPlate}
                            autoCapitalize="characters"
                        />
                    </View>
                    
                    {/* --- Submit Button --- */}
                    <TouchableOpacity
                        style={s.registerBtn}
                        onPress={handleRegisterDriver}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" size="small" />
                        ) : (
                            <Text style={s.registerBtnText}>REGISTER NEW DRIVER</Text>
                        )}
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f8f8',
    },
    scrollContent: {
        paddingTop: 80, 
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    backBtn: { 
        position: 'absolute', 
        top: 50, 
        left: 20, 
        backgroundColor: 'white', 
        padding: 10, 
        borderRadius: 12, 
        elevation: 5,
        zIndex: 10,
    },
    header: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#15803d',
        marginBottom: 5,
    },
    subHeader: {
        fontSize: 18,
        color: '#6B7280',
        marginBottom: 30,
    },
    formContainer: {
        backgroundColor: 'white',
        borderRadius: 15,
        padding: 20,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
    },
    inputGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        marginBottom: 20,
        paddingVertical: 5,
    },
    icon: {
        marginRight: 15,
    },
    input: {
        flex: 1,
        height: 40,
        fontSize: 16,
        color: '#111827',
    },
    registerBtn: {
        backgroundColor: '#15803d',
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        minHeight: 50,
    },
    registerBtnText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
});
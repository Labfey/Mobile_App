import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { ref, onValue } from "firebase/database";
import { auth, db } from "../../services/firebase"; 
import { useTheme } from '../ThemeContext'; 
import FontAwesome from "@expo/vector-icons/FontAwesome";

export default function DriverDashboard() {
  const { darkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<any[]>([]);
  const [stats, setStats] = useState({ count: 0, distance: 0 });
  const [earnings, setEarnings] = useState('');
  const [fuelCost, setFuelCost] = useState('');

  const bg = darkMode ? "#0f172a" : "#F3F4F6";
  const cardBg = darkMode ? "#1e293b" : "#ffffff";
  const textMain = darkMode ? "#f3f4f6" : "#111827";
  const textSub = darkMode ? "#9ca3af" : "#6B7280";

  useEffect(() => {
    if (!auth.currentUser) return;
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const unsub = onValue(ref(db, `history/${auth.currentUser.uid}/${dateKey}`), (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ ...data[k], id: k })).reverse();
        setTrips(list);
        setStats({ count: list.length, distance: list.reduce((a, c) => a + (c.distance || 0), 0) });
      } else {
        setTrips([]);
        setStats({ count: 0, distance: 0 });
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const net = (parseFloat(earnings || '0') - parseFloat(fuelCost || '0')).toFixed(2);

  if (loading) return <View style={[s.center, {backgroundColor: bg}]}><ActivityIndicator size="large" color="#15803D" /></View>;

  return (
    <ScrollView style={[s.container, { backgroundColor: bg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: textMain }]}>Driver Dashboard</Text>
        <Text style={[s.date, { color: textSub }]}>{new Date().toDateString()}</Text>
      </View>

      <View style={s.statsRow}>
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <FontAwesome name="map-marker" size={24} color="#1D4ED8" />
          <Text style={[s.statNum, { color: textMain }]}>{stats.count}</Text>
          <Text style={[s.statLabel, { color: textSub }]}>Trips</Text>
        </View>
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <FontAwesome name="road" size={24} color="#15803D" />
          <Text style={[s.statNum, { color: textMain }]}>{stats.distance.toFixed(1)} km</Text>
          <Text style={[s.statLabel, { color: textSub }]}>Distance</Text>
        </View>
      </View>

      <View style={[s.calcCard, { backgroundColor: cardBg }]}>
        <TextInput style={[s.input, { color: textMain, borderBottomColor: textSub }]} placeholder="Total Collection (₱)" placeholderTextColor={textSub} keyboardType="numeric" value={earnings} onChangeText={setEarnings} />
        <TextInput style={[s.input, { color: textMain, borderBottomColor: textSub }]} placeholder="Fuel Cost (₱)" placeholderTextColor={textSub} keyboardType="numeric" value={fuelCost} onChangeText={setFuelCost} />
        <View style={s.netRow}>
          <Text style={[s.netLabel, { color: textMain }]}>Net Income:</Text>
          <Text style={[s.netValue, { color: parseFloat(net) >= 0 ? '#15803D' : '#DC2626' }]}>₱{net}</Text>
        </View>
      </View>

      <Text style={[s.sectionTitle, { color: textSub, marginTop: 20 }]}>Today&apos;s Logs</Text>
      {trips.map(t => (
        <View key={t.id} style={[s.logItem, { backgroundColor: cardBg }]}>
          <View><Text style={[s.logRoute, { color: textMain }]}>{t.route}</Text><Text style={[s.logTime, { color: textSub }]}>{t.startTime} - {t.endTime}</Text></View>
          <Text style={s.logDist}>{t.distance} km</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { marginTop: 40, marginBottom: 20 }, title: { fontSize: 28, fontWeight: 'bold' }, date: { fontSize: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  card: { flex: 0.48, padding: 15, borderRadius: 16, alignItems: 'center', elevation: 2 },
  statNum: { fontSize: 20, fontWeight: 'bold', marginVertical: 5 }, statLabel: { fontSize: 12 },
  calcCard: { borderRadius: 16, padding: 20, elevation: 2 },
  input: { fontSize: 16, borderBottomWidth: 1, marginBottom: 15, padding: 5 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  netLabel: { fontWeight: 'bold' }, netValue: { fontSize: 22, fontWeight: 'bold' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  logItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderRadius: 12, marginBottom: 8 },
  logRoute: { fontWeight: 'bold' }, logTime: { fontSize: 11 }, logDist: { fontWeight: 'bold', color: '#15803D' }
});
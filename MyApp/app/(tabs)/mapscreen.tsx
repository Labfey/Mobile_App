import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Modal, Alert } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { ArrowLeft, Users, Navigation as NavIcon, RefreshCw, Crosshair } from "lucide-react-native"; 
import { ref, onValue, update, get } from "firebase/database";
import { auth, db } from "../../services/firebase"; 
import { FARE_ZONES } from "../../constants/routes"; 

interface ExtendedZone {
  originalIndex: number;
  id: string;
  label: string;
  color: string;
  pts: number[][];
  targetNode?: number[];
}

export default function MapScreen() {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'driver' | 'passenger' | 'guest'>('guest');
  const [isFull, setIsFull] = useState(false);
  const [routeModalVisible, setRouteModalVisible] = useState(false);
  const [currentDest, setCurrentDest] = useState<'Town' | 'Balacbac' | null>(null);
  const activeZonesRef = useRef<ExtendedZone[]>([]);

  // 1. INITIAL ROLE CHECK
  useEffect(() => {
    const fetchRole = async () => {
      if (auth.currentUser) {
        const snap = await get(ref(db, `users/${auth.currentUser.uid}`));
        if (snap.exists()) setRole(snap.val().role);
      } else {
        setRole('guest');
      }
      setLoading(false);
    };
    fetchRole();
  }, []);

  // 2. BIDIRECTIONAL ROUTE FLIP LOGIC
  const drawSegmentedRoute = async (destination: 'Town' | 'Balacbac') => {
    webViewRef.current?.postMessage(JSON.stringify({ type: "CLEAR_ZONES" }));
    
    // Reverse logic for "Vice-Versa"
    const baseZones: ExtendedZone[] = FARE_ZONES.map((z, i) => ({ ...z, originalIndex: i }));
    const zonesToProcess = destination === 'Town' ? [...baseZones].reverse() : [...baseZones];

    const zoneData = await Promise.all(zonesToProcess.map(async (zone) => {
      // If heading to Town, we flip the start and end points of the segment
      const start = destination === 'Town' ? zone.pts[1] : zone.pts[0];
      const end = destination === 'Town' ? zone.pts[0] : zone.pts[1];
      zone.targetNode = end; 

      try {
        const resp = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`);
        const data = await resp.json();
        return { coords: data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]), color: zone.color };
      } catch (e) { return { coords: [], color: zone.color }; }
    }));

    activeZonesRef.current = zonesToProcess;
    webViewRef.current?.postMessage(JSON.stringify({ type: "DRAW_ZONES", zones: zoneData }));
  };

  const handleRouteSelection = (dest: 'Town' | 'Balacbac') => {
    setCurrentDest(dest);
    setRouteModalVisible(false);
    drawSegmentedRoute(dest);
    if (auth.currentUser) {
      update(ref(db, `jeeps/${auth.currentUser.uid}`), { destination: dest });
    }
  };

  // ... (HTML Template and location listeners remain similar but using destination-aware logic)

  return (
    <View style={styles.container}>
      <WebView 
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: `
          <!DOCTYPE html>
          <html>
            <head>
              <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
              <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
              <style>#map { height: 100vh; width: 100vw; }</style>
            </head>
            <body>
              <div id="map"></div>
              <script>
                var map = L.map('map').setView([16.4023, 120.5960], 14);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                var polylines = [];
                var markers = {};

                window.addEventListener('message', function(e) {
                  var data = JSON.parse(e.data);
                  if (data.type === "DRAW_ZONES") {
                    data.zones.forEach(z => {
                      var pl = L.polyline(z.coords, {color: z.color, weight: 6, opacity: 0.8}).addTo(map);
                      polylines.push(pl);
                    });
                  }
                  if (data.type === "CLEAR_ZONES") {
                    polylines.forEach(p => map.removeLayer(p));
                    polylines = [];
                  }
                  // Update Jeep Markers logic...
                });
              </script>
            </body>
          </html>
        ` }}
      />

      {/* DRIVER CONTROLS */}
      {role === 'driver' && (
        <View style={styles.driverPanel}>
          <TouchableOpacity onPress={() => setRouteModalVisible(true)} style={styles.mainBtn}>
            <NavIcon color="white" size={24} />
            <Text style={styles.btnText}>{currentDest ? `Heading: ${currentDest}` : "Select Direction"}</Text>
          </TouchableOpacity>
          <View style={styles.subRow}>
            <TouchableOpacity onPress={() => setIsFull(!isFull)} style={[styles.subBtn, {backgroundColor: isFull ? '#EF4444' : '#15803D'}]}>
              <Users color="white" size={20} />
              <Text style={styles.btnText}>{isFull ? "FULL" : "AVAILABLE"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ROUTE FLIP MODAL */}
      <Modal visible={routeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Destination</Text>
            <TouchableOpacity onPress={() => handleRouteSelection('Town')} style={[styles.routeChoice, {backgroundColor: '#15803D'}]}>
              <Text style={styles.routeChoiceText}>To Baguio Plaza (Town)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleRouteSelection('Balacbac')} style={[styles.routeChoice, {backgroundColor: '#1E40AF'}]}>
              <Text style={styles.routeChoiceText}>To Balacbac Terminal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  driverPanel: { position: 'absolute', bottom: 30, left: 20, right: 20 },
  mainBtn: { backgroundColor: '#15803D', padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', marginBottom: 10 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  subBtn: { flex: 1, padding: 18, borderRadius: 20, flexDirection: 'row', justifyContent: 'center' },
  btnText: { color: 'white', fontWeight: 'bold', marginLeft: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: 'white', padding: 30, borderRadius: 30 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  routeChoice: { padding: 20, borderRadius: 15, marginBottom: 10 },
  routeChoiceText: { color: 'white', fontWeight: 'bold', textAlign: 'center' }
});
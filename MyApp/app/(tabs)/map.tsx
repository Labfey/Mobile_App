import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

export default function MapScreen() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Ref to interact with the map inside the WebView
  const webViewRef = useRef<WebView>(null);

  // 🎨 PROFESSIONAL MAP STYLE: CartoDB Voyager
  // This HTML loads Leaflet and uses the clean "Voyager" tiles
  const leafletHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { height: 100vh; width: 100vw; }
        .leaflet-control-attribution { font-size: 8px; opacity: 0.5; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // 1. Initialize Map (Centered on Baguio)
        const map = L.map('map', { zoomControl: false }).setView([16.4143, 120.5988], 15);

        // 2. Add Professional Tiles (CartoDB Voyager)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap, © CartoDB'
        }).addTo(map);

        // 3. Create a Custom Marker (Blue Dot style)
        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: "<div style='background-color:#007AFF; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);'></div>",
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        let userMarker = L.marker([16.4143, 120.5988], { icon: icon }).addTo(map);

        // 4. Function to update position called from React Native
        function updateLocation(lat, lng) {
          const newLatLng = new L.LatLng(lat, lng);
          userMarker.setLatLng(newLatLng);
          map.setView(newLatLng); 
        }
      </script>
    </body>
    </html>
  `;

  // --- Tracking Logic ---
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      setPermissionGranted(true);

      // Start live tracking
      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (newLocation) => {
          // Send coordinates to the WebView
          if (webViewRef.current) {
            const { latitude, longitude } = newLocation.coords;
            // This line calls the 'updateLocation' function inside the HTML above
            webViewRef.current.injectJavaScript(`updateLocation(${latitude}, ${longitude}); true;`);
          }
        }
      );
    })();
  }, []);

  if (!permissionGranted && !errorMsg) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10, color: '#666' }}>Requesting permissions...</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: 'red' }}>{errorMsg}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* The Map View */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: leafletHtml }}
        style={styles.map}
        scrollEnabled={false} 
      />
      
      {/* Professional "Live" Badge Overlay */}
      <View style={styles.statusBar}>
        <View style={styles.dot} />
        <Text style={styles.statusText}>LIVE GPS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBar: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginRight: 6,
  },
  statusText: {
    color: '#333',
    fontWeight: '700',
    fontSize: 12,
  },
});
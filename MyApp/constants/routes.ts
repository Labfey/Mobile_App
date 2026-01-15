// 1. Raw Terminal Coordinates (for React Native logic/Firebase)
export const BALACBAC_COORD = { 
  latitude: 16.378736032785287, 
  longitude: 120.58602216348046 
}; 

export const SHAGEM_COORD = { 
  latitude: 16.4132, 
  longitude: 120.5975 
}; 

// 2. Leaflet-Friendly Points (for the WebView map)
export const POINTS = {
  TOWN: [16.414019, 120.593455],
  SHELL: [16.393590, 120.579564],
  JUNCTION: [16.388988, 120.575658],
  INTERIOR_A: [16.386876, 120.576439],
  CENTRO: [16.380109, 120.579936],
  FRIENDSHIP: [16.378661, 120.580563],
  TIERRA: [16.378759, 120.586049],
};

// 3. The Segmented Fare Zones
export const FARE_ZONES = [
  { id: 'z1', label: "Town ↔ Shell", reg: 13.00, disc: 10.50, color: '#22c55e', pts: [POINTS.TOWN, POINTS.SHELL] },
  { id: 'z2', label: "Shell ↔ Junction", reg: 15.00, disc: 12.00, color: '#eab308', pts: [POINTS.SHELL, POINTS.JUNCTION] },
  { id: 'z3', label: "Interior A ↔ Centro", reg: 16.50, disc: 13.25, color: '#f97316', pts: [POINTS.INTERIOR_A, POINTS.CENTRO] },
  { id: 'z4', label: "Friendship ↔ Tierra", reg: 18.50, disc: 15.00, color: '#ef4444', pts: [POINTS.FRIENDSHIP, POINTS.TIERRA] },
];

// 4. Fallback/Default Route
export const FALLBACK_ROUTE = [
  BALACBAC_COORD,
  { latitude: 16.4000, longitude: 120.5950 },
  SHAGEM_COORD
];
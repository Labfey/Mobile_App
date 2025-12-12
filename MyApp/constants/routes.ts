// constants/routes.ts

// Balacbac Terminal
export const BALACBAC_COORD = { latitude: 16.3860, longitude: 120.5890 }; // Balacbac Feeder Rd

// Burnham Park (Existing coordinate)
export const BURNHAM_COORD = { latitude: 16.4124, longitude: 120.5929 }; 

// NEW: Shagem Street (Town Terminal) - This resolves the import error
export const SHAGEM_COORD = { latitude: 16.4132, longitude: 120.5975 }; 

export const FALLBACK_ROUTE = [
  BALACBAC_COORD,
  { latitude: 16.4000, longitude: 120.5950 },
  BURNHAM_COORD
];
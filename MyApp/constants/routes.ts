// constants/routes.ts

// Balacbac Terminal
export const BALACBAC_COORD = { 
  latitude: 16.378736032785287, 
  longitude: 120.58602216348046 
}; 

// Shagem Street (Town Terminal)
export const SHAGEM_COORD = { latitude: 16.4132, longitude: 120.5975 }; 

export const FALLBACK_ROUTE = [
  BALACBAC_COORD,
  { latitude: 16.4000, longitude: 120.5950 },
  SHAGEM_COORD
];
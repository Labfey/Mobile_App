// Add this NEW FILE: utils/geofencing.ts

import * as Location from 'expo-location';

/**
 * Check if a point is within a certain distance from a polyline (route)
 * @param point - Current GPS location
 * @param routeCoords - Array of [lat, lng] coordinates representing the route
 * @param maxDistanceMeters - Maximum allowed distance from route (default 100m)
 * @returns true if point is within acceptable distance, false if off-route
 */
export function isPointNearRoute(
  point: { latitude: number; longitude: number },
  routeCoords: number[][],
  maxDistanceMeters: number = 100
): { isNearRoute: boolean; closestDistance: number } {
  if (!routeCoords || routeCoords.length < 2) {
    return { isNearRoute: true, closestDistance: 0 };
  }

  let minDistance = Infinity;

  // Check distance to each segment of the route
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const segmentStart = { latitude: routeCoords[i][0], longitude: routeCoords[i][1] };
    const segmentEnd = { latitude: routeCoords[i + 1][0], longitude: routeCoords[i + 1][1] };
    
    const distance = distanceToSegment(point, segmentStart, segmentEnd);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return {
    isNearRoute: minDistance <= maxDistanceMeters,
    closestDistance: minDistance
  };
}

/**
 * Calculate distance from a point to a line segment
 */
function distanceToSegment(
  point: { latitude: number; longitude: number },
  segStart: { latitude: number; longitude: number },
  segEnd: { latitude: number; longitude: number }
): number {
  // Convert to meters using Haversine formula approximation
  const R = 6371000; // Earth's radius in meters

  const lat1 = toRad(point.latitude);
  const lon1 = toRad(point.longitude);
  const lat2 = toRad(segStart.latitude);
  const lon2 = toRad(segStart.longitude);
  const lat3 = toRad(segEnd.latitude);
  const lon3 = toRad(segEnd.longitude);

  // Vector from segment start to point
  const dx = lon1 - lon2;
  const dy = lat1 - lat2;

  // Vector from segment start to segment end
  const dxLine = lon3 - lon2;
  const dyLine = lat3 - lat2;

  // Calculate projection factor
  const lineLengthSquared = dxLine * dxLine + dyLine * dyLine;
  
  if (lineLengthSquared === 0) {
    // Segment is a point, return distance to that point
    return haversineDistance(point, segStart);
  }

  const t = Math.max(0, Math.min(1, (dx * dxLine + dy * dyLine) / lineLengthSquared));

  // Find closest point on segment
  const closestLat = lat2 + t * dyLine;
  const closestLon = lon2 + t * dxLine;

  // Calculate distance to closest point
  const closestPoint = {
    latitude: toDeg(closestLat),
    longitude: toDeg(closestLon)
  };

  return haversineDistance(point, closestPoint);
}

/**
 * Haversine distance formula
 */
function haversineDistance(
  point1: { latitude: number; longitude: number },
  point2: { latitude: number; longitude: number }
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(point2.latitude - point1.latitude);
  const dLon = toRad(point2.longitude - point1.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.latitude)) *
      Math.cos(toRad(point2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function toDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Log geofence violation to Firebase
 */
export async function logGeofenceViolation(
  driverId: string,
  location: { latitude: number; longitude: number },
  distanceFromRoute: number,
  destination: string
) {
  // Import Firebase here to avoid circular dependencies
  const { ref: dbRef, push, serverTimestamp } = await import('firebase/database');
  const { db } = await import('../services/firebase');

  const violationData = {
    driverId,
    location,
    distanceFromRoute,
    destination,
    timestamp: serverTimestamp(),
    status: 'unresolved'
  };

  try {
    await push(dbRef(db, 'geofence_violations'), violationData);
    console.log('✅ Geofence violation logged to Firebase');
  } catch (error) {
    console.error('❌ Failed to log geofence violation:', error);
  }
}
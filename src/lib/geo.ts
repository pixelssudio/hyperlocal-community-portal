export interface GeoPoint {
  lat: number;
  lng: number;
}

// Center of Rawatbhata (Rajasthan 323303)
export const RAWATBHATA_CENTER: GeoPoint = {
  lat: 24.9338,
  lng: 75.5906,
};

// Exact coordinates for all major Rawatbhata Spots & Landmarks
export const RAWATBHATA_SPOT_COORDINATES: { [key: string]: GeoPoint } = {
  'Sector-1': { lat: 24.9310, lng: 75.5890 },
  'Sector-2': { lat: 24.9350, lng: 75.5920 },
  'Sector-3': { lat: 24.9380, lng: 75.5950 },
  'Sector-4': { lat: 24.9410, lng: 75.5980 },
  'Main Bazar': { lat: 24.9325, lng: 75.5870 },
  'Rawatbhata Main Market': { lat: 24.9325, lng: 75.5870 },
  'Shopping Center Colony': { lat: 24.9345, lng: 75.5910 },
  'RPS Lake Viewpoint': { lat: 24.9280, lng: 75.5820 },
  'Bhabha Colony': { lat: 24.9360, lng: 75.6010 },
  'Hospital Road': { lat: 24.9340, lng: 75.5895 },
  'Heavy Water Plant Gate': { lat: 24.9480, lng: 75.6120 },
  'Charbhuja Temple Square': { lat: 24.9315, lng: 75.5865 },
  'RPS Colony Sector-3': { lat: 24.9380, lng: 75.5950 },
  'Chechat Road Chowk': { lat: 24.9260, lng: 75.5840 },
  'Kota Road Bus Stand': { lat: 24.9290, lng: 75.5880 },
};

/**
 * Calculates Great-Circle / Haversine Distance between two GPS coordinates in Kilometers
 */
export function calculateDistanceKm(
  point1: GeoPoint,
  point2: GeoPoint
): number {
  const R = 6371; // Earth radius in KM
  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const dLon = ((point2.lng - point1.lng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Formats a distance in KM to a user-friendly string (e.g. "350 m" or "1.2 km")
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
}

/**
 * Estimates travel time in minutes based on average town speed (20 km/h)
 */
export function estimateTravelTimeMinutes(distanceKm: number): number {
  const avgSpeedKmh = 20; // 20 km/h average bike/scooter speed in Rawatbhata
  const minutes = Math.ceil((distanceKm / avgSpeedKmh) * 60) + 1; // +1 min buffer
  return Math.max(1, minutes);
}

/**
 * Resolves a spot name or user input string to nearest known GPS coordinates
 */
export function resolveLocationCoordinates(locationName: string): GeoPoint {
  const clean = locationName.trim();
  for (const [spot, coords] of Object.entries(RAWATBHATA_SPOT_COORDINATES)) {
    if (clean.toLowerCase().includes(spot.toLowerCase()) || spot.toLowerCase().includes(clean.toLowerCase())) {
      return coords;
    }
  }
  return RAWATBHATA_CENTER;
}

/**
 * Finds the nearest spot name from a given GPS coordinate
 */
export function findNearestSpotName(coords: GeoPoint): string {
  let nearestSpot = 'Main Bazar';
  let minDistance = Infinity;

  for (const [spot, spotCoords] of Object.entries(RAWATBHATA_SPOT_COORDINATES)) {
    const dist = calculateDistanceKm(coords, spotCoords);
    if (dist < minDistance) {
      minDistance = dist;
      nearestSpot = spot;
    }
  }

  return nearestSpot;
}

/**
 * Browser HTML5 Geolocation helper to get current position
 */
export function getCurrentDeviceLocation(): Promise<GeoPoint> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      resolve(RAWATBHATA_CENTER);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.warn('Geolocation access fallback to Rawatbhata Center:', err.message);
        resolve(RAWATBHATA_CENTER);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000,
      }
    );
  });
}

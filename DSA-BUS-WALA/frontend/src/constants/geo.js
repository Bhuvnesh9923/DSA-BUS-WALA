export const NAGPUR_CENTER = { lat: 21.146, lng: 79.083 };

// Real Aapli Bus (Nagpur) — Kalmeshwar → Maharajbagh along Amravati Road.
export const NAGPUR_SIM_PATH = [
  { lat: 21.2296, lng: 78.9205 },
  { lat: 21.2152, lng: 78.9475 },
  { lat: 21.2040, lng: 78.9685 },
  { lat: 21.1928, lng: 78.9895 },
  { lat: 21.1816, lng: 79.0105 },
  { lat: 21.1704, lng: 79.0315 },
  { lat: 21.1592, lng: 79.0525 },
  { lat: 21.1496, lng: 79.0705 },
  { lat: 21.1460, lng: 79.0830 }
];

// Backward-compatible aliases (old Eluru demo names → Nagpur route).
// Kept so existing components that import ELURU_CENTER / ELURU_SIM_PATH keep working,
// but now they resolve to the real Nagpur Aapli Bus route.
export const ELURU_CENTER = NAGPUR_CENTER;
export const ELURU_SIM_PATH = NAGPUR_SIM_PATH;

export const DEFAULT_MAP_ZOOM = 10;

export const TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_LAYER_ATTRIBUTION = '&copy; OpenStreetMap contributors';

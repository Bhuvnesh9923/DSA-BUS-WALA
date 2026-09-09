/**
 * GPS Ingestion Service — pluggable real GPS provider adapter.
 *
 * The system is designed to receive REAL bus coordinates from whatever
 * provider is available (municipal API, fleet GPS gateway, telematics
 * push, etc.). No mock/demo movement is ever generated here.
 *
 * Provider configuration (env):
 *   GPS_PROVIDER=none|transitland|http|webhook|dummy
 *   GPS_PROVIDER_URL=https://...            (for transitland/http provider)
 *   GPS_PROVIDER_TOKEN=...                  (optional bearer token)
 *   GPS_POLL_INTERVAL_MS=5000               (poll cadence for pull providers)
 *
 * The "dummy" provider is DISABLED by default and never generates fake
 * movement — it only exists to inject a known coordinate for local
 * integration tests. Set GPS_PROVIDER=dummy EXPLICITLY for tests only.
 */
const logger = require('./logger');

// transitland: Transitland REST API v2 GTFS-RT vehicle_positions feed
// http:       generic HTTP provider returning a JSON array of vehicle payloads
// webhook:    provider pushes coordinates to POST /api/gps/ingest (no polling)
// none:       polling disabled
// dummy:      FOR TESTING ONLY — injects a known coordinate for local tests
const PROVIDERS = ['none', 'dummy', 'http', 'webhook', 'transitland'];
const DEFAULT_PROVIDER = process.env.GPS_PROVIDER || 'none';

const validateProvider = (name) => {
  if (!PROVIDERS.includes(name)) {
    logger.warn(`[GPS] Unknown provider "${name}" — falling back to "none"`);
    return 'none';
  }
  return name;
};

/**
 * Normalize any incoming GPS payload to the canonical internal shape:
 *   { busId, lat, lng, speed?, heading?, timestamp?, tripId? }
 *
 * Handles common field-name variants:
 *   - Flat variants: lat/latitude, lng/lon/longitude, speed/speed_kmh, bearing/heading
 *   - Transitland/GTFS-RT nested entities: position.latitude / position.longitude /
 *     position.speed / position.bearing, vehicle.id / vehicle.label, trip.trip_id
 *
 * Returns null when the payload is unusable.
 */
const normalizeGpsPayload = (raw = {}) => {
  // Support both flat and nested (Transitland/GTFS-RT) shapes.
  const pos = raw?.position || {};
  const vehicle = raw?.vehicle || {};
  const trip = raw?.trip || {};

  const busId =
    raw.busId ?? raw.bus_id ?? raw.bus ??
    raw.vehicleId ?? raw.vehicle_id ?? raw.vehicle ??
    vehicle.id ?? vehicle.vehicle_id ?? vehicle.label ??
    null;
  const tripId =
    raw.tripId ?? raw.trip_id ?? raw.trip ??
    trip.trip_id ?? trip.route_id ?? null;

  const lat = Number(raw.lat ?? raw.latitude ?? raw.lat_deg ?? pos.latitude ?? pos.lat ?? null);
  const lng = Number(raw.lng ?? raw.lon ?? raw.lng_deg ?? raw.longitude ?? raw.long ?? pos.longitude ?? pos.lon ?? pos.lng ?? null);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  // GTFS-RT `position.speed` is in m/s; `speed_kmh` is in km/h. Prefer m/s.
  const rawSpeed = raw.speed ?? raw.speed_mps ?? pos.speed ?? null;
  const rawSpeedKmh = raw.speed_kmh ?? pos.speed_kmh ?? null;
  let speed = Number(rawSpeed);
  if (rawSpeedKmh != null && rawSpeed == null && raw.speed_mps == null && pos.speed == null) {
    speed = Number(rawSpeedKmh) / 3.6; // km/h → m/s
  }
  if (!Number.isFinite(speed) || speed < 0) {
    speed = 0;
  }

  // GTFS-RT `position.bearing` is degrees clockwise from true north.
  const heading = Number(raw.heading ?? raw.bearing ?? pos.bearing ?? pos.heading ?? null);
  const normalizedHeading = Number.isFinite(heading) ? heading : 0;

  const timestamp = raw.timestamp
    ? new Date(raw.timestamp)
    : new Date();

  return {
    busId: busId ? String(busId) : null,
    tripId: tripId ? String(tripId) : null,
    lat,
    lng,
    speed,
    heading: normalizedHeading,
    timestamp: timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp : new Date()
  };
};

/**
 * Fetch GPS updates from an HTTP provider endpoint.
 * @returns {Promise<Array<Object>>} Array of normalized GPS payloads
 */
const fetchFromHttpProvider = async () => {
  const url = process.env.GPS_PROVIDER_URL;
  if (!url) {
    logger.warn('[GPS] HTTP provider configured but GPS_PROVIDER_URL is missing');
    return [];
  }

  const token = process.env.GPS_PROVIDER_TOKEN;
  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      logger.warn(`[GPS] Provider responded ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    // Generic HTTP: accept an array, an object with a "vehicles"/"data" array, or a single object.
    const items = Array.isArray(data) ? data : data?.vehicles ?? data?.data ?? [data];
    return items.map(normalizeGpsPayload).filter(Boolean);
  } catch (err) {
    logger.error(`[GPS] Provider fetch error: ${err.message}`);
    return [];
  }
};

/**
 * Fetch GPS updates from a Transitland REST API v2 GTFS-RT vehicle_positions feed.
 *
 * Transitland /api/v2/rest/feeds/:id/download_latest_rt/vehicle_positions.json
 * returns a JSON object (a GTFS-RT-ish entity wrapper) with a top-level
 * "entity" array, each entity carrying nested vehicle / trip / position fields:
 *
 *   { "entity": [ { "id": "...", "vehicle": { "id": "..." },
 *                  "trip": { "trip_id": "...", "route_id": "..." },
 *                  "position": { "latitude": ..., "longitude": ...,
 *                                "bearing": ..., "speed": ... } } ] }
 *
 * @returns {Promise<Array<Object>>} Array of normalized GPS payloads
 */
const fetchFromTransitlandProvider = async () => {
  const url = process.env.GPS_PROVIDER_URL;
  if (!url) {
    logger.warn('[GPS] Transitland provider configured but GPS_PROVIDER_URL is missing');
    return [];
  }

  const token = process.env.GPS_PROVIDER_TOKEN;
  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      logger.warn(`[GPS] Transitland responded ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    // Transitland wraps the GTFS-RT entities under `entity`.
    const items = data?.entity ?? data?.entities ?? data?.data ?? data?.vehicles ?? (Array.isArray(data) ? data : null);
    if (!items) {
      logger.warn('[GPS] Transitland returned no recognizable entity array');
      return [];
    }
    return items.map(normalizeGpsPayload).filter(Boolean);
  } catch (err) {
    logger.error(`[GPS] Transitland fetch error: ${err.message}`);
    return [];
  }
};

/**
 * Main GPS polling loop. Enabled for "http" and "transitland" (pull) providers.
 * @param {(payload: Object) => Promise<void>} onGps — callback per normalized payload
 * @returns {NodeJS.Timeout|null}
 */
const startGpsPolling = (onGps) => {
  const provider = validateProvider(DEFAULT_PROVIDER);
  if (provider !== 'http' && provider !== 'transitland') {
    logger.info(`[GPS] Provider "${provider}" — polling disabled.`);
    return null;
  }

  // Choose the fetch function for the active pull provider.
  const fetchFn = provider === 'transitland' ? fetchFromTransitlandProvider : fetchFromHttpProvider;

  const intervalMs = parseInt(process.env.GPS_POLL_INTERVAL_MS || '5000', 10);
  logger.info(`[GPS] Polling "${provider}" provider every ${intervalMs}ms`);

  const poll = async () => {
    const payloads = await fetchFn();
    for (const payload of payloads) {
      try {
        await onGps(payload);
      } catch (err) {
        logger.error(`[GPS] Handler failed for payload: ${err.message}`);
      }
    }
  };

  poll();
  return setInterval(poll, intervalMs);
};

module.exports = {
  normalizeGpsPayload,
  startGpsPolling,
  fetchFromHttpProvider,
  fetchFromTransitlandProvider,
  validateProvider,
  PROVIDERS
};

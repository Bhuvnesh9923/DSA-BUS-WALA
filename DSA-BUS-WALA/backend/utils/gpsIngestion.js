/**
 * GPS Ingestion Service — pluggable real GPS provider adapter.
 *
 * The system is designed to receive REAL bus coordinates from whatever
 * provider is available (municipal API, fleet GPS gateway, telematics
 * push, etc.). No mock/demo movement is ever generated here.
 *
 * Provider configuration (env):
 *   GPS_PROVIDER=dummy|none|http|webhook
 *   GPS_PROVIDER_URL=https://...            (for http provider)
 *   GPS_PROVIDER_TOKEN=...                  (optional bearer token)
 *   GPS_POLL_INTERVAL_MS=5000               (poll cadence for http provider)
 *
 * The "dummy" provider is DISABLED by default and never generates fake
 * movement — it only exists to inject a known coordinate for local
 * integration tests. Set GPS_PROVIDER=dummy EXPLICITLY for tests only.
 */
const logger = require('./logger');

const PROVIDERS = ['none', 'dummy', 'http', 'webhook'];
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
 * Handles common field-name variants (lat/latitude, lng/lon/longitude,
 * speed/kmh, etc.). Returns null when the payload is unusable.
 */
const normalizeGpsPayload = (raw = {}) => {
  const busId =
    raw.busId ?? raw.bus_id ?? raw.bus ?? raw.vehicleId ?? raw.vehicle_id ?? raw.vehicle ?? null;
  const tripId = raw.tripId ?? raw.trip_id ?? raw.trip ?? null;

  const lat = Number(raw.lat ?? raw.latitude ?? raw.lat_deg ?? null);
  const lng = Number(raw.lng ?? raw.lon ?? raw.lng_deg ?? raw.longitude ?? raw.long ?? null);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  let speed = Number(raw.speed ?? raw.speed_mps ?? raw.speed_kmh ?? null);
  // If speed is provided in km/h, convert to m/s
  if (raw.speed_kmh != null && (raw.speed == null && raw.speed_mps == null)) {
    speed = speed / 3.6;
  }
  if (!Number.isFinite(speed) || speed < 0) {
    speed = 0;
  }

  let heading = Number(raw.heading ?? raw.bearing ?? null);
  if (!Number.isFinite(heading)) {
    heading = 0;
  }

  const timestamp = raw.timestamp
    ? new Date(raw.timestamp)
    : new Date();

  return {
    busId: busId ? String(busId) : null,
    tripId: tripId ? String(tripId) : null,
    lat,
    lng,
    speed,
    heading,
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
    const items = Array.isArray(data) ? data : data?.vehicles ?? data?.data ?? [data];
    return items.map(normalizeGpsPayload).filter(Boolean);
  } catch (err) {
    logger.error(`[GPS] Provider fetch error: ${err.message}`);
    return [];
  }
};

/**
 * Main GPS polling loop. Only enabled for the "http" provider.
 * @param {(payload: Object) => Promise<void>} onGps — callback per normalized payload
 * @returns {NodeJS.Timeout|null}
 */
const startGpsPolling = (onGps) => {
  const provider = validateProvider(DEFAULT_PROVIDER);
  if (provider !== 'http') {
    logger.info(`[GPS] Provider "${provider}" — polling disabled.`);
    return null;
  }

  const intervalMs = parseInt(process.env.GPS_POLL_INTERVAL_MS || '5000', 10);
  logger.info(`[GPS] Polling HTTP provider every ${intervalMs}ms`);

  const poll = async () => {
    const payloads = await fetchFromHttpProvider();
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
  validateProvider,
  PROVIDERS
};

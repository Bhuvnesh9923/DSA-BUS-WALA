/**
 * GPS Persistence Service
 *
 * Stores every validated live GPS update received from the real bus API in
 * MongoDB (LocationEvent) with a deterministic eventId for deduplication, and
 * enqueues the same record to the background Excel exporter for reporting.
 *
 * MongoDB remains the PRIMARY production datastore. The Excel layer is the
 * reporting/export layer only — a failure in Excel export never affects live
 * tracking because the MongoDB write is independent and best-effort.
 */
const crypto = require('crypto');
const logger = require('./logger');
const { enqueueGpsRecord } = require('./excelExporter');

/**
 * Generate a deterministic unique event ID for a GPS record.
 *
 * The same bus + timestamp + coordinates must always produce the same eventId
 * so that when an API retries/sends the same update, we can deduplicate it.
 *
 * @param {{ busId?: String, tripId?: String, lat: Number, lng: Number, timestamp?: Date|Number|String }} record
 * @returns {String} sha1 hash
 */
const buildEventId = ({ busId, tripId, lat, lng, timestamp }) => {
  const ts = timestamp ? new Date(timestamp).toISOString() : 'unknown';
  const key = [busId || 'no-bus', tripId || 'no-trip', lat, lng, ts].join('|');
  return crypto.createHash('sha1').update(key).digest('hex');
};

/**
 * Persist a validated live GPS record to MongoDB and enqueue it for Excel export.
 *
 * @param {Object} payload  Normalized GPS payload from normalizeGpsPayload()
 * @param {Object} context  Additional context (busId, tripId, routeId, source, stopStatus, apiStatus, raw)
 * @returns {Promise<{ ok: boolean, eventId?: String, inserted?: Boolean, error?: String }>}
 */
const persistGpsRecord = async (payload, context = {}) => {
  if (!payload || !Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
    logger.warn('[GPS-Persist] Skipping invalid payload');
    return { ok: false, error: 'invalid_payload' };
  }

  const timestamp = payload.timestamp instanceof Date ? payload.timestamp : new Date(payload.timestamp || Date.now());
  const eventId = buildEventId({
    busId: payload.busId,
    tripId: payload.tripId,
    lat: payload.lat,
    lng: payload.lng,
    timestamp
  });

  const record = {
    eventId,
    trip: payload.tripId || context.tripId || null,
    bus: payload.busId || context.busId || null,
    route: context.routeId || null,
    lat: payload.lat,
    lng: payload.lng,
    speed: payload.speed || 0,
    heading: payload.heading || 0,
    timestamp,
    source: context.source || 'gps-api',
    stopStatus: context.stopStatus || null,
    apiStatus: context.apiStatus || 'OK',
    raw: context.raw || null
  };

  // ── 1. MongoDB write (up-sert on eventId for dedup) ──
  try {
    const LocationEvent = require('../models/LocationEvent');
    const result = await LocationEvent.updateOne(
      { eventId },
      { $setOnInsert: record },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // ── 2. Enqueue the same record to the background Excel exporter ──
    // Fire-and-forget. MongoDB remains the primary datastore; if Excel enqueue
    // fails or the exporter is down, live tracking is completely unaffected.
    enqueueGpsRecord({
      eventId,
      busId: payload.busId || context.busId || null,
      tripId: payload.tripId || context.tripId || null,
      routeId: context.routeId || null,
      lat: payload.lat,
      lng: payload.lng,
      speed: payload.speed || 0,
      heading: payload.heading || 0,
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp,
      source: context.source || 'gps-api',
      stopStatus: context.stopStatus || null,
      apiStatus: context.apiStatus || 'OK',
      raw: context.raw || null
    });

    return {
      ok: true,
      eventId,
      inserted: result.upsertedCount > 0,
      record
    };
  } catch (err) {
    logger.error(`[GPS-Persist] MongoDB write error: ${err.message}`);
    return { ok: false, error: `mongo_write_failed: ${err.message}` };
  }
};

/**
 * Persist a batch of validated live GPS records.
 * @param {Array<Object>} payloads
 * @param {Object} context
 * @returns {Promise<Array<Object>>}
 */
const persistGpsBatch = async (payloads, context = {}) => {
  const results = [];
  for (const payload of payloads) {
    results.push(await persistGpsRecord(payload, context));
  }
  return results;
};

module.exports = {
  buildEventId,
  persistGpsRecord,
  persistGpsBatch
};

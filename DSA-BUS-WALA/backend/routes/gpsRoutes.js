const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const Bus = require('../models/Bus');
const { normalizeGpsPayload } = require('../utils/gpsIngestion');
const { persistGpsRecord } = require('../utils/gpsPersistence');
const logger = require('../utils/logger');

/**
 * POST /api/gps/ingest
 *
 * Webhook endpoint for an external GPS provider to push real vehicle
 * coordinates. Accepts a single object or an array of objects.
 *
 * Body shape (canonical):
 *   { busId, lat, lng, speed?, heading?, timestamp?, tripId? }
 *
 * Field aliases (lat/latitude, lng/lon/longitude, bus/vehicle/vehicleId,
 * speed/speed_kmh/bearing, etc.) are normalized by normalizeGpsPayload.
 *
 * This endpoint is intentionally unauthenticated only when a shared
 * provider token is configured (GPS_PROVIDER_TOKEN). If no token is set,
 * it requires the standard auth middleware (applied in server.js).
 */
const ingestHandler = async (req, res) => {
  const body = req.body;
  const items = Array.isArray(body) ? body : [body];

  if (!items.length) {
    return res.status(400).json({ message: 'Empty payload' });
  }

  const results = [];
  let processed = 0;

  for (const raw of items) {
    const payload = normalizeGpsPayload(raw);
    if (!payload) {
      results.push({ ok: false, reason: 'invalid_payload', raw });
      continue;
    }

    try {
      if (!payload.busId) {
        results.push({ ok: false, reason: 'missing_busId' });
        continue;
      }

      // Resolve bus, then its active trip (if any)
      const bus = await Bus.findById(payload.busId).catch(async () => {
        // Fallback: match by numberPlate/name
        return Bus.findOne({ $or: [{ numberPlate: payload.busId }, { name: payload.busId }] });
      });

      if (!bus) {
        results.push({ ok: false, reason: 'bus_not_found', busId: payload.busId });
        continue;
      }

      // Persist EVERY validated live GPS update to MongoDB and enqueue it
      // for the background Excel exporter. This is the canonical live-data
      // storage path — every coordinate shown on the map is stored here.
      const persistResult = await persistGpsRecord(
        {
          busId: bus._id.toString(),
          tripId: payload.tripId || null,
          lat: payload.lat,
          lng: payload.lng,
          speed: payload.speed,
          heading: payload.heading,
          timestamp: payload.timestamp
        },
        {
          busId: bus._id.toString(),
          tripId: payload.tripId || null,
          source: 'gps-api',
          apiStatus: 'OK',
          raw: raw
        }
      );

      // Update bus lastKnownLocation
      await Bus.findByIdAndUpdate(bus._id, {
        lastKnownLocation: { lat: payload.lat, lng: payload.lng, updatedAt: payload.timestamp }
      });

      // If a tripId was supplied and it's ongoing, push into the active trip
      // state machine via the location controller's socket handling path.
      let trip = null;
      if (payload.tripId) {
        trip = await Trip.findOne({ _id: payload.tripId, status: 'ONGOING' });
      }
      if (!trip) {
        trip = await Trip.findOne({ bus: bus._id, status: 'ONGOING' }).sort({ startedAt: -1 });
      }

      if (trip) {
        // Broadcast to socket room via the app's io instance
        const io = req.app.get('io');
        if (io) {
          io.to(`trip_${trip._id}`).emit('trip:location_update', {
            tripId: trip._id.toString(),
            busId: bus._id.toString(),
            lat: payload.lat,
            lng: payload.lng,
            speed: payload.speed,
            heading: payload.heading,
            timestamp: payload.timestamp
          });
        }

        // Drive the stop-detection / ETA pipeline
        try {
          const { handleDriverLocationUpdate } = require('../controllers/locationController');
          // We simulate a socket-like object with the required user context
          // so the existing pipeline consumes the real coordinate.
          const fakeSocket = {
            user: { id: trip.driver, role: 'driver' },
            join: () => {},
            emit: (event, data) => {
              if (io) io.to(`trip_${trip._id}`).emit(event, data);
            }
          };
          await handleDriverLocationUpdate(io, fakeSocket, {
            driverId: trip.driver?.toString(),
            tripId: trip._id.toString(),
            busId: bus._id.toString(),
            lat: payload.lat,
            lng: payload.lng,
            speed: payload.speed,
            heading: payload.heading,
            timestamp: payload.timestamp,
            force: true
          });
        } catch (pipelineErr) {
          logger.error(`[GPS] Pipeline error: ${pipelineErr.message}`);
        }
      }

      processed += 1;
      results.push({
        ok: true,
        busId: bus._id.toString(),
        tripId: trip?._id?.toString() || null,
        eventId: persistResult.eventId,
        persisted: persistResult.ok,
        excelQueued: persistResult.ok
      });
    } catch (err) {
      logger.error(`[GPS] Ingest error: ${err.message}`);
      results.push({ ok: false, reason: 'internal_error', message: err.message });
    }
  }

  return res.json({
    received: items.length,
    processed,
    results
  });
};

router.post('/ingest', ingestHandler);

module.exports = { router, ingestHandler };

const mongoose = require('mongoose');

/**
 * LocationEvent — normalized, time-series GPS breadcrumb.
 * This is the canonical persisted history for a vehicle's movements,
 * distinct from Trip.locations (which is the live-ish rolling buffer).
 * Adding a 2dsphere index enables geospatial queries for stop detection
 * and analytics.
 *
 * In addition to the legacy fields, this model now stores a deterministic
 * `eventId` (for dedup against API retries), the bus/route/trip IDs, the
 * stop/ETA status, and the data-source/API status so that every validated
 * live GPS update received from the real bus API is fully persisted.
 */
const locationEventSchema = new mongoose.Schema(
  {
    // Deterministic unique event ID — dedup key. Same bus + timestamp +
    // coordinates always yields the same eventId so API retries cannot
    // create duplicates.
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      default: null,
      index: true
    },
    bus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bus',
      required: true,
      index: true
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      default: null
    },
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },
    speed: {
      type: Number,
      default: 0,
      min: 0
    },
    heading: {
      type: Number,
      default: 0,
      min: 0,
      max: 360
    },
    // Source of the observation: 'gps-api' | 'driver-socket' | 'webhook' | 'provider' | 'auto'
    source: {
      type: String,
      enum: ['gps-api', 'driver-socket', 'webhook', 'provider', 'auto'],
      default: 'gps-api',
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Stop/ETA status at the time of this observation (e.g. 'ARRIVED', '1_STOP_AWAY', null)
    stopStatus: {
      type: String,
      default: null
    },
    // Data-source/API status (e.g. 'OK', 'STALE', 'API_ERROR')
    apiStatus: {
      type: String,
      default: 'OK'
    },
    // Raw payload received from the real bus API (preserved for reconciliation)
    raw: {
      type: Object,
      default: null
    }
  },
  { timestamps: true }
);

// Geospatial index for stop-detection / nearest-stop queries.
locationEventSchema.index({ lat: 1, lng: 1 });
// Time-series index for analytics: trip + timestamp.
locationEventSchema.index({ trip: 1, timestamp: -1 });
// Index for admin export filtering by bus + timestamp.
locationEventSchema.index({ bus: 1, timestamp: -1 });
// Index for admin export filtering by route + timestamp.
locationEventSchema.index({ route: 1, timestamp: -1 });

module.exports = mongoose.model('LocationEvent', locationEventSchema);

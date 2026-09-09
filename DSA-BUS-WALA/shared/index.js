/**
 * Shared constants used across the TrackMate monorepo.
 * Import from backend via `require('@trackmate/shared')`
 * or from frontend via `import { ... } from '@trackmate/shared'`.
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  DRIVER: 'driver',
  STUDENT: 'student'
});

const TRIP_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ONGOING: 'ONGOING',
  COMPLETED: 'COMPLETED'
});

const STOP_EVENT_STATUS = Object.freeze({
  ARRIVED: 'ARRIVED',
  LEFT: 'LEFT',
  SOS: 'SOS'
});

const NOTIFICATION_TYPES = Object.freeze({
  PROXIMITY: 'proximity-alert',
  ARRIVAL: 'stop-arrival',
  DEPARTURE: 'stop-departure',
  SOS: 'sos',
  MISSED_BUS: 'missed-bus'
});

const CONFIG = Object.freeze({
  DEFAULT_SEAT_CAPACITY: 40,
  DEFAULT_SEAT_COLUMNS: 3,
  STOP_RADIUS_METERS: 75,
  MIN_UPDATE_INTERVAL_MS: 1000
});

module.exports = {
  ROLES,
  TRIP_STATUS,
  STOP_EVENT_STATUS,
  NOTIFICATION_TYPES,
  CONFIG
};

const mongoose = require('mongoose');

/**
 * Schedule — represents planned daily departure times for a route/bus.
 * Derived from the FETRI dataset or admin-defined timetable.
 * Used to clearly distinguish scheduled ETA from GPS-derived ETA.
 */
const scheduleSchema = new mongoose.Schema(
  {
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
      index: true
    },
    bus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bus',
      default: null
    },
    // Day of week (0=Sunday ... 6=Saturday). -1 = every day.
    dayOfWeek: {
      type: Number,
      default: -1,
      min: -1,
      max: 6
    },
    // Departure time from the first stop (HH:mm 24h)
    departureTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/
    },
    // Optional arrival time at last stop
    arrivalTime: {
      type: String,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
      default: null
    },
    source: {
      type: String,
      enum: ['fetri', 'admin', 'manual'],
      default: 'admin'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// Efficient lookup: route + day + active
scheduleSchema.index({ route: 1, dayOfWeek: 1, isActive: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);

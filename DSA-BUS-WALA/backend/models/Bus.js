const mongoose = require('mongoose');

const busSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    numberPlate: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    capacity: {
      type: Number,
      min: 1,
      default: 40
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastKnownLocation: {
      lat: Number,
      lng: Number,
      updatedAt: Date
    },
    // ── Seat layout & booking ──
    // How many seat columns per row (window|aisle|window pattern). Default 3.
    seatColumns: {
      type: Number,
      default: 3,
      min: 1,
      max: 5
    },
    // Total bookable seats. Defaults to capacity if not set.
    totalSeats: {
      type: Number,
      default: 40,
      min: 1
    },
    // 2D grid describing seat availability. seatMap[row][col] = { seatId, occupiedBy, bookedAt }
    seatMap: {
      type: [[Object]],
      default: []
    }
  },
  { timestamps: true }
);

// Build the default 2D seat map for a bus based on totalSeats & seatColumns.
busSchema.methods.buildDefaultSeatMap = function buildDefaultSeatMap() {
  const rows = Math.max(1, Math.ceil((this.totalSeats || this.capacity || 40) / (this.seatColumns || 3)));
  const cols = this.seatColumns || 3;
  const map = [];
  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      row.push({
        seatId: `${String.fromCharCode(65 + r)}${c + 1}`,
        occupiedBy: null,
        bookedAt: null
      });
    }
    map.push(row);
  }
  return map;
};

busSchema.methods.ensureSeatMap = function ensureSeatMap() {
  if (!Array.isArray(this.seatMap) || this.seatMap.length === 0) {
    this.seatMap = this.buildDefaultSeatMap();
  }
  return this.seatMap;
};

module.exports = mongoose.model('Bus', busSchema);

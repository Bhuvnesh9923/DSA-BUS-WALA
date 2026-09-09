/**
 * Demo Seed — populate a route, stops, a bus, a driver, and an ONGOING trip
 * with a last-known location so a live bus appears on the Admin Fleet Map
 * and the Driver Simulator has a working bus to drive.
 *
 * Run:  node scripts/seedDemo.js
 * (Must be run from the backend directory so dotenv finds backend/.env)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'atlas-credentials.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const Route = require('../models/Route');
const Bus = require('../models/Bus');
const Trip = require('../models/Trip');
const User = require('../models/User');

// Real Aapli Bus (Nagpur) route — Kalmeshwar → Maharajbagh along Amravati Road.
// These stops match the waypoints in nagpur-demo-coordinates.csv.
const DEMO_ROUTE_STOPS = [
  { name: 'Kalmeshwar Bus Stand', lat: 21.2296, lng: 78.9205, seq: 0 },
  { name: 'Kalmeshwar MIDC', lat: 21.2152, lng: 78.9475, seq: 1 },
  { name: 'Amravati Road Junction', lat: 21.2040, lng: 78.9685, seq: 2 },
  { name: 'Hingna T-Point', lat: 21.1928, lng: 78.9895, seq: 3 },
  { name: 'Vidya Nagar', lat: 21.1816, lng: 79.0105, seq: 4 },
  { name: 'Ravine Nagar', lat: 21.1704, lng: 79.0315, seq: 5 },
  { name: 'Vaishali Nagar', lat: 21.1592, lng: 79.0525, seq: 6 },
  { name: 'Ajni Square', lat: 21.1496, lng: 79.0705, seq: 7 },
  { name: 'Maharajbagh', lat: 21.1460, lng: 79.0830, seq: 8 }
];

const seedDemo = async () => {
  await connectDB();
  const log = (...args) => console.log(...args);

  // 0. Clean up any previously-seeded legacy demo bus/trip/route so only the
  //    real Nagpur Aapli Bus demo remains on the live map.
  const legacyBus = await Bus.findOne({ numberPlate: 'AP-39-DEMO-1' });
  if (legacyBus) {
    await Trip.deleteMany({ bus: legacyBus._id });
    await Bus.deleteOne({ _id: legacyBus._id });
    log('🗑️  Removed legacy Eluru demo bus AP-39-DEMO-1 and its trips.');
  }
  const legacyRoute = await Route.findOne({ name: 'Demo Route 1' });
  if (legacyRoute) {
    await Route.deleteOne({ _id: legacyRoute._id });
    log('🗑️  Removed legacy "Demo Route 1".');
  }

  // 1. Create/update driver account: dri1 / dri1
  let driver = await User.findOne({ username: 'dri1', role: 'driver' });
  if (!driver) {
    driver = await User.create({
      username: 'dri1',
      password: await bcrypt.hash('dri1', 10),
      role: 'driver',
      name: 'Demo Driver',
      email: 'demo.driver@example.com',
      firstLogin: true
    });
    log('✅ Created driver: dri1 / dri1');
  } else {
    log('ℹ️  Driver dri1 already exists — skipping.');
  }

  // 2. Create/update route — real Aapli Bus Nagpur route name
  const ROUTE_NAME = 'Kalmeshwar - Maharajbagh (Aapli Bus)';
  let route = await Route.findOne({ name: ROUTE_NAME });
  if (!route) {
    route = await Route.create({
      name: ROUTE_NAME,
      stops: DEMO_ROUTE_STOPS,
      segStats: DEMO_ROUTE_STOPS.map(() => ({ avgSec: 120, samples: 1 }))
    });
    log(`✅ Created route: ${route.name} (${route._id})`);
  } else {
    route.stops = DEMO_ROUTE_STOPS;
    route.segStats = DEMO_ROUTE_STOPS.map(() => ({ avgSec: 120, samples: 1 }));
    await route.save();
    log(`ℹ️  Route ${route.name} already exists — updated stops.`);
  }

  // 3. Create/update bus assigned to the route + driver
  let bus = await Bus.findOne({ numberPlate: 'MH-31-NAG-01' });
  if (!bus) {
    bus = await Bus.create({
      name: 'Aapli Bus - Nagpur',
      numberPlate: 'MH-31-NAG-01',
      capacity: 40,
      totalSeats: 40,
      seatColumns: 3,
      driver: driver._id,
      route: route._id,
      isActive: true,
      lastKnownLocation: { lat: DEMO_ROUTE_STOPS[1].lat, lng: DEMO_ROUTE_STOPS[1].lng, updatedAt: new Date() }
    });
    bus.ensureSeatMap();
    await bus.save();
    log(`✅ Created bus: ${bus.name} (${bus.numberPlate}) [${bus._id}]`);
  } else {
    bus.driver = driver._id;
    bus.route = route._id;
    bus.isActive = true;
    bus.lastKnownLocation = { lat: DEMO_ROUTE_STOPS[1].lat, lng: DEMO_ROUTE_STOPS[1].lng, updatedAt: new Date() };
    await bus.save();
    log(`ℹ️  Bus ${bus.numberPlate} already exists — updated assignment/location.`);
  }

  // Link driverMeta.bus (used by Driver Simulator "assigned bus")
  driver.driverMeta = { ...(driver.driverMeta || {}), bus: bus._id };
  await driver.save();

  // 4. Create an ONGOING trip so `/admin/live-buses` returns the bus
  let trip = await Trip.findOne({ bus: bus._id, status: 'ONGOING' });
  if (!trip) {
    trip = await Trip.create({
      bus: bus._id,
      driver: driver._id,
      route: route._id,
      status: 'ONGOING',
      currentStopIndex: 1,
      startedAt: new Date(),
      lastLocation: { lat: DEMO_ROUTE_STOPS[1].lat, lng: DEMO_ROUTE_STOPS[1].lng, updatedAt: new Date() }
    });
    log(`✅ Created ongoing trip: ${trip._id}`);
  } else {
    log(`ℹ️  Ongoing trip already exists: ${trip._id}`);
  }

  log('\n=== Demo summary ===');
  log(`Driver: dri1 / dri1   (id: ${driver._id})`);
  log(`Bus:    ${bus.numberPlate}   (id: ${bus._id})`);
  log(`Route:  ${route.name}   (id: ${route._id})`);
  log(`Trip:   ${trip._id}  (status: ONGOING)`);
  log('\nA live bus should now appear on the Admin Fleet Map.');
  log('To drive it: open /driver-sim, enter the Bus ID above, Start Trip, Connect Socket, then replay the Excel.');

  await mongoose.disconnect();
  process.exit(0);
};

seedDemo().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});

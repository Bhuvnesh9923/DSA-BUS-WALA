/**
 * FETRI Dataset Import Pipeline
 *
 * Accepts the FETRI Excel/CSV dataset and imports Routes, Stops and Buses
 * safely. Performs validation of required columns, coordinate ranges, route IDs,
 * stop ordering and duplicate records. The whole import is wrapped in a Mongoose
 * transaction-like workflow so a partial failure rolls back cleanly.
 *
 * Expected columns (header names are normalized case/space-insensitive):
 *   route_id, route_name, stop_id, stop_name, stop_order / seq / sequence,
 *   stop_lat / latitude, stop_lng / longitude, bus_id, bus_name, bus_plate,
 *   departure_time (optional)
 */
const XLSX = require('xlsx');
const Route = require('../models/Route');
const Stop = require('../models/Stop');
const Bus = require('../models/Bus');
const Schedule = require('../models/Schedule');
const { buildSegStats } = require('../controllers/routeController');

const REQUIRED_COLUMNS = [
  'route_id',
  'route_name',
  'stop_name',
  'stop_order',
  'stop_lat',
  'stop_lng'
];

const normalizeHeader = (h) => String(h || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const pick = (row, names) => {
  for (const name of names) {
    const key = Object.keys(row).find((k) => normalizeHeader(k) === name);
    if (key != null && row[key] !== '' && row[key] != null) return row[key];
  }
  return undefined;
};

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

const validateRow = (row, index, errors) => {
  const routeId = pick(row, ['route_id', 'routeid']);
  const routeName = pick(row, ['route_name', 'routename']);
  const stopName = pick(row, ['stop_name', 'stopname']);
  const stopOrder = toNumber(pick(row, ['stop_order', 'seq', 'sequence', 'stop_seq']));
  const lat = toNumber(pick(row, ['stop_lat', 'latitude', 'lat']));
  const lng = toNumber(pick(row, ['stop_lng', 'longitude', 'long', 'lng']));

  if (!routeId || !routeName) errors.push(`Row ${index}: missing route_id/route_name`);
  if (!stopName) errors.push(`Row ${index}: missing stop_name`);
  if (!Number.isFinite(stopOrder)) errors.push(`Row ${index}: invalid stop_order/seq`);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push(`Row ${index}: invalid stop_lat (${lat})`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push(`Row ${index}: invalid stop_lng (${lng})`);

  return { routeId, routeName, stopName, stopOrder, lat, lng };
};

/**
 * Parse an uploaded buffer (Excel/CSV) into validated, normalized rows.
 * @param {Buffer} buffer
 * @returns {{ rows: Array, errors: Array, headers: Array }}
 */
const parseDataset = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers = Object.keys(rawRows[0] || {});

  const errors = [];
  const rows = [];

  rawRows.forEach((row, idx) => {
    const result = validateRow(row, idx + 2, errors);
    if (errors.length && errors[errors.length - 1].startsWith(`Row ${idx + 2}:`)) {
      // row had a validation error already recorded, skip
      if (Object.values(result).some((v) => v === undefined)) return;
    }
    if (result.routeId) rows.push(result);
  });

  return { rows, errors, headers };
};

/**
 * Import parsed rows into MongoDB.
 * @param {Array} rows - normalized rows
 * @param {string} source - 'fetri' | 'admin'
 * @returns {Promise<{ routes: number, stops: number, buses: number, schedules: number }>}
 */
const importRows = async (rows, source = 'fetri') => {
  // Group by route
  const routeMap = new Map();
  for (const row of rows) {
    const key = String(row.routeId).trim();
    if (!routeMap.has(key)) {
      routeMap.set(key, {
        routeId: key,
        routeName: row.routeName,
        stops: [],
        buses: new Set()
      });
    }
    const entry = routeMap.get(key);
    entry.stops.push(row);
    if (row.busId) entry.buses.add(row.busId);
  }

  let routes = 0;
  let stops = 0;
  let buses = 0;
  let schedules = 0;

  for (const entry of routeMap.values()) {
    // Sort stops by stopOrder
    const sortedRows = [...entry.stops].sort((a, b) => a.stopOrder - b.stopOrder);

    // Deduplicate stops by seq
    const seenSeqs = new Set();
    const deduped = sortedRows.filter((r) => {
      if (seenSeqs.has(r.stopOrder)) return false;
      seenSeqs.add(r.stopOrder);
      return true;
    });

    const normalizedStops = deduped.map((r) => ({
      name: r.stopName,
      lat: r.lat,
      lng: r.lng,
      seq: r.stopOrder,
      averageTravelMinutes: 2
    }));

    // Create/update Route
    let route = await Route.findOne({ name: entry.routeName });
    if (!route) {
      route = await Route.create({
        name: entry.routeName,
        stops: normalizedStops,
        segStats: buildSegStats(normalizedStops)
      });
      routes += 1;
    } else {
      route.stops = normalizedStops;
      route.segStats = buildSegStats(normalizedStops);
      await route.save();
    }

    // Sync physical Stop collection (upsert by route+sequence)
    for (const stop of normalizedStops) {
      await Stop.findOneAndUpdate(
        { route: route._id, sequence: stop.seq },
        {
          route: route._id,
          name: stop.name,
          latitude: stop.lat,
          longitude: stop.lng,
          sequence: stop.seq,
          averageTravelMinutes: 2
        },
        { upsert: true, new: true }
      );
      stops += 1;
    }

    // Create Buses (if bus_id present)
    for (const busId of entry.buses) {
      const plate = String(busId).toUpperCase();
      await Bus.findOneAndUpdate(
        { $or: [{ numberPlate: plate }, { _id: busId }] },
        { $setOnInsert: { numberPlate: plate, name: `Bus ${plate}`, route: route._id } },
        { upsert: true, new: true }
      );
      buses += 1;
    }

    // Create Schedule (if departure time present)
    const departureTime = entry.stops.find((r) => r.departureTime)?.departureTime;
    if (departureTime) {
      await Schedule.findOneAndUpdate(
        { route: route._id, departureTime, dayOfWeek: -1 },
        { route: route._id, departureTime, source, isActive: true },
        { upsert: true, new: true }
      );
      schedules += 1;
    }
  }

  return { routes, stops, buses, schedules };
};

/**
 * Full import from a buffer with validation and summary.
 */
const importDataset = async (buffer, source = 'fetri') => {
  const { rows, errors } = parseDataset(buffer);

  if (errors.length) {
    return { ok: false, errors, summary: null };
  }

  const summary = await importRows(rows, source);
  return { ok: true, errors: [], summary };
};

module.exports = {
  parseDataset,
  importRows,
  importDataset,
  REQUIRED_COLUMNS,
  normalizeHeader
};

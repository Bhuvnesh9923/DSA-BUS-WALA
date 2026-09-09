/**
 * Demo Replay Controller
 *
 * Parses an uploaded Excel (.xlsx) or CSV file containing bus coordinates and
 * returns them as an ordered list so the frontend can replay them to simulate
 * real-time bus movement for demos.
 *
 * Expected columns (header names are normalized case/space-insensitive):
 *   lat / latitude / Lat / Latitude
 *   lng / lon / longitude / long / Lng / Longitude
 *   (optional) speed / speed_kmh
 *   (optional) timestamp / time
 *   (optional) bus_id / vehicle_id
 *
 * The parser accepts any row that has both a latitude and longitude, and
 * returns rows in file order.
 */
const XLSX = require('xlsx');

const normalizeHeader = (h) =>
  String(h || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

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

/**
 * Parse an uploaded buffer (Excel/CSV) into an ordered coordinate list.
 * @param {Buffer} buffer
 * @returns {{ rows: Array<{lat:number,lng:number,speed?:number}>, errors: string[] }}
 */
const parseCoordinatesFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ['No sheet found in the file'] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const errors = [];
  const rows = [];

  rawRows.forEach((row, idx) => {
    const lat = toNumber(pick(row, ['lat', 'latitude']));
    const lng = toNumber(pick(row, ['lng', 'lon', 'longitude', 'long']));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      errors.push(`Row ${idx + 2}: missing or invalid latitude/longitude`);
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      errors.push(`Row ${idx + 2}: coordinate out of range (${lat}, ${lng})`);
      return;
    }

    const speedRaw = pick(row, ['speed', 'speed_kmh']);
    let speed = toNumber(speedRaw);
    if (!Number.isFinite(speed) || speed < 0) {
      speed = 0;
    }
    // If speed was provided in km/h, convert to m/s (matches backend convention).
    const speedKey = Object.keys(row).find((k) => normalizeHeader(k) === 'speed_kmh');
    if (speedKey != null && speedRaw != null && speedRaw !== '') {
      speed = speed / 3.6;
    }

    rows.push({ lat, lng, speed });
  });

  return { rows, errors };
};

/**
 * Express handler: POST /api/demo/parse-excel
 * Accepts multipart file ("file"), returns the parsed coordinate rows.
 */
const parseExcelHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'A file (.xlsx/.xls/.csv) is required' });
    }

    const { rows, errors } = parseCoordinatesFile(req.file.buffer);

    res.json({
      ok: true,
      total: rows.length,
      rows,
      errors: errors.slice(0, 25),
      errorCount: errors.length
    });
  } catch (error) {
    console.error('parseExcelHandler error:', error);
    res.status(500).json({ message: 'Failed to parse coordinates file', error: error.message });
  }
};

module.exports = {
  parseCoordinatesFile,
  parseExcelHandler
};

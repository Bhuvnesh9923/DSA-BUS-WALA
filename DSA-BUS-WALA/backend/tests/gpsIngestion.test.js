const test = require('node:test');
const assert = require('node:assert');
const { normalizeGpsPayload, validateProvider } = require('../utils/gpsIngestion');

test('normalizeGpsPayload - standard shape', () => {
  const result = normalizeGpsPayload({
    busId: 'bus-1',
    lat: 21.1466,
    lng: 79.08886,
    speed: 10,
    heading: 90,
    timestamp: '2024-01-01T10:00:00Z'
  });
  assert.strictEqual(result.busId, 'bus-1');
  assert.strictEqual(result.lat, 21.1466);
  assert.strictEqual(result.lng, 79.08886);
  assert.strictEqual(result.speed, 10);
  assert.strictEqual(result.heading, 90);
  assert.ok(result.timestamp instanceof Date);
});

test('normalizeGpsPayload - accepts latitude/longitude aliases', () => {
  const result = normalizeGpsPayload({
    vehicle: 'V123',
    latitude: 21.14,
    longitude: 79.08,
  });
  assert.strictEqual(result.busId, 'V123');
  assert.strictEqual(result.lat, 21.14);
  assert.strictEqual(result.lng, 79.08);
  assert.strictEqual(result.speed, 0);
  assert.strictEqual(result.heading, 0);
});

test('normalizeGpsPayload - converts kmh speed to m/s', () => {
  const result = normalizeGpsPayload({
    busId: 'b',
    lat: 0,
    lng: 0,
    speed_kmh: 36
  });
  assert.strictEqual(result.speed, 10); // 36 km/h = 10 m/s
});

test('normalizeGpsPayload - rejects invalid coordinates', () => {
  assert.strictEqual(normalizeGpsPayload({ busId: 'b', lat: 91, lng: 0 }), null);
  assert.strictEqual(normalizeGpsPayload({ busId: 'b', lat: 0, lng: -181 }), null);
  assert.strictEqual(normalizeGpsPayload({ busId: 'b', lat: 'abc', lng: 0 }), null);
  assert.strictEqual(normalizeGpsPayload({ busId: 'b', lat: NaN, lng: 0 }), null);
});

test('normalizeGpsPayload - fills defaults', () => {
  const result = normalizeGpsPayload({ busId: 'b', lat: 10, lng: 20 });
  assert.strictEqual(result.speed, 0);
  assert.strictEqual(result.heading, 0);
  assert.ok(result.timestamp instanceof Date);
});

test('validateProvider - only known providers', () => {
  assert.strictEqual(validateProvider('http'), 'http');
  assert.strictEqual(validateProvider('none'), 'none');
  assert.strictEqual(validateProvider('dummy'), 'dummy');
  assert.strictEqual(validateProvider('unknown'), 'none');
});

/**
 * Live Feed → Excel Exporter
 *
 * A background worker that appends live GPS tracking records to Excel (.xlsx)
 * files WITHOUT blocking the live tracking API. It uses a resilient in-memory
 * + on-disk queue, deduplicates by eventId, retries failures, and partitions
 * by hour/day so files never grow excessively large.
 *
 * IMPORTANT ARCHITECTURE RULE:
 *   MongoDB is the PRIMARY production datastore.
 *   Excel is the REPORTING/EXPORT layer only.
 *   A failure in this exporter NEVER affects live tracking.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const logger = require('./logger');

// ── Config ──
const EXCEL_OUTPUT_DIR = process.env.EXCEL_OUTPUT_DIR || path.join(__dirname, '..', 'exports');
const QUEUE_FILE = path.join(EXCEL_OUTPUT_DIR, 'live-gps-queue.json');
const PROCESSED_LOG = path.join(EXCEL_OUTPUT_DIR, 'processed-events.json');

// Partition mode: 'hourly' (default) or 'daily'
const PARTITION_MODE = process.env.EXCEL_PARTITION_MODE || 'hourly';
const FLUSH_INTERVAL_MS = parseInt(process.env.EXCEL_FLUSH_INTERVAL_MS || '5000', 10);
const MAX_QUEUE_SIZE = parseInt(process.env.EXCEL_MAX_QUEUE || '10000', 10);
const MAX_RETRY = 5;
const RETRY_BACKOFF_MS = 2000;

let queue = [];          // pending records to write
let processedIds = new Set(); // eventIds already written
let running = false;
let flushTimer = null;

// ── Helpers ──
const ensureDir = () => {
  if (!fs.existsSync(EXCEL_OUTPUT_DIR)) {
    fs.mkdirSync(EXCEL_OUTPUT_DIR, { recursive: true });
  }
};

const loadQueueFromDisk = () => {
  ensureDir();
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) || [];
      logger.info(`[Excel] Loaded ${queue.length} queued GPS records from disk`);
    }
  } catch (err) {
    logger.warn(`[Excel] Could not load queue from disk: ${err.message}`);
  }

  try {
    if (fs.existsSync(PROCESSED_LOG)) {
      const ids = JSON.parse(fs.readFileSync(PROCESSED_LOG, 'utf8')) || [];
      processedIds = new Set(ids);
      logger.info(`[Excel] Loaded ${processedIds.size} processed event IDs`);
    }
  } catch (err) {
    logger.warn(`[Excel] Could not load processed IDs: ${err.message}`);
  }
};

const saveQueueToDisk = () => {
  ensureDir();
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue.slice(0, MAX_QUEUE_SIZE)), 'utf8');
  } catch (err) {
    logger.warn(`[Excel] Could not save queue to disk: ${err.message}`);
  }
};

const saveProcessedIds = () => {
  ensureDir();
  try {
    // Keep only the most recent 500k IDs to avoid unbounded growth
    const arr = Array.from(processedIds);
    const trimmed = arr.slice(-500000);
    fs.writeFileSync(PROCESSED_LOG, JSON.stringify(trimmed), 'utf8');
  } catch (err) {
    logger.warn(`[Excel] Could not save processed IDs: ${err.message}`);
  }
};

/**
 * Partition key → Excel file path.
 * Hourly: exports/live-gps-2026-09-09-14.xlsx
 * Daily:  exports/live-gps-2026-09-09.xlsx
 */
const getPartitionPath = (timestamp) => {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hourPart = PARTITION_MODE === 'daily' ? '' : `-${pad(d.getHours())}`;
  return path.join(EXCEL_OUTPUT_DIR, `live-gps-${datePart}${hourPart}.xlsx`);
};

const getSheetName = (timestamp) => {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const recordToRow = (record) => ({
  eventId: record.eventId,
  busId: record.busId,
  tripId: record.tripId,
  routeId: record.routeId,
  lat: record.lat,
  lng: record.lng,
  speed: record.speed,
  heading: record.heading,
  timestamp: record.timestamp instanceof Date ? record.timestamp.toISOString() : record.timestamp,
  source: record.source,
  stopStatus: record.stopStatus,
  apiStatus: record.apiStatus
});

/**
 * Append records to the appropriate partition Excel file.
 * Uses a read-modify-write on the partition file for this window; concurrent
 * appends to the same file are serialized by the single worker loop.
 */
const appendToExcel = (records) => {
  if (!records.length) return { written: 0, skipped: 0 };

  // Group by partition file
  const byPartition = new Map();
  for (const rec of records) {
    const filePath = getPartitionPath(rec.timestamp);
    if (!byPartition.has(filePath)) byPartition.set(filePath, []);
    byPartition.get(filePath).push(rec);
  }

  let written = 0;
  let skipped = 0;

  for (const [filePath, recs] of byPartition.entries()) {
    ensureDir();
    const sheetName = getSheetName(recs[0].timestamp);
    const rows = recs.map(recordToRow);

    let ws;
    if (fs.existsSync(filePath)) {
      try {
        const wb = XLSX.readFile(filePath);
        ws = wb.Sheets[sheetName] || XLSX.utils.json_to_sheet([]);
        wb.SheetNames = wb.SheetNames.includes(sheetName) ? wb.SheetNames : [...wb.SheetNames, sheetName];
        // Append to the existing sheet
        const existing = XLSX.utils.sheet_to_json(ws);
        ws = XLSX.utils.json_to_sheet([...existing, ...rows]);
        wb.Sheets[sheetName] = ws;
        XLSX.writeFile(wb, filePath);
      } catch (err) {
        logger.error(`[Excel] Read-modify-write failed for ${filePath}: ${err.message}. Recreating.`);
        ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, filePath);
      }
      written += recs.length;
    } else {
      // New file
      ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, filePath);
      written += recs.length;
    }
  }

  return { written, skipped };
};

/**
 * Process the queue with retry semantics. Called by the flush timer.
 */
const flushQueue = async () => {
  if (running) return;
  running = true;

  try {
    if (!queue.length) return;

    // Take the first batch (bounded to prevent memory blowups)
    const batch = queue.slice(0, 500);
    // Keep only records we haven't written yet
    const pending = batch.filter((r) => !processedIds.has(r.eventId));

    if (!pending.length) {
      queue = queue.slice(batch.length);
      saveQueueToDisk();
      return;
    }

    try {
      const { written, skipped } = appendToExcel(pending);
      if (written > 0) {
        pending.forEach((r) => processedIds.add(r.eventId));
        logger.info(`[Excel] Wrote ${written} records to Excel, skipped ${skipped}`);
      }
      // Remove from queue
      queue = queue.slice(batch.length);
      saveQueueToDisk();
      saveProcessedIds();
    } catch (err) {
      // Append failed — retry later with backoff. Keep records in queue.
      logger.error(`[Excel] Append failed: ${err.message}. Will retry.`);
      batch.forEach((r) => {
        r._retries = (r._retries || 0) + 1;
      });

      // Split batch into those still worth retrying vs those to drop.
      const retryable = batch.filter((r) => (r._retries || 0) <= MAX_RETRY);
      const dropped = batch.filter((r) => (r._retries || 0) > MAX_RETRY);

      if (dropped.length) {
        logger.warn(`[Excel] Dropping ${dropped.length} record(s) after ${MAX_RETRY} failed attempts.`);
      }

      // Move retryable records back to the queue
      queue = [...queue.slice(batch.length), ...retryable];
      saveQueueToDisk();

      if (queue.length > MAX_QUEUE_SIZE) {
        logger.warn(`[Excel] Queue size ${queue.length} exceeds max ${MAX_QUEUE_SIZE}. Dropping oldest.`);
        queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
        saveQueueToDisk();
      }
    }
  } finally {
    running = false;
  }
};

/**
 * Public API — enqueue a live GPS record for Excel export.
 * Fire-and-forget; never throws.
 */
const enqueueGpsRecord = (record) => {
  if (!record || !record.eventId) return false;

  // Dedup at enqueue time
  if (processedIds.has(record.eventId)) return false;
  if (queue.some((r) => r.eventId === record.eventId)) return false;

  queue.push({
    ...record,
    _retries: 0
  });

  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
    logger.warn(`[Excel] Queue overflow — trimmed to ${MAX_QUEUE_SIZE}`);
  }

  return true;
};

/**
 * Start the Excel exporter background worker.
 * @returns {{ flushQueue, enqueueGpsRecord, getQueueStats }}
 */
const startExcelExporter = () => {
  loadQueueFromDisk();

  // Kick off an immediate flush after startup to drain any persisted queue
  setTimeout(() => flushQueue(), 1000);

  flushTimer = setInterval(() => {
    flushQueue().catch((err) => logger.error(`[Excel] Flush error: ${err.message}`));
  }, FLUSH_INTERVAL_MS);

  logger.info(`[Excel] Exporter started — dir: ${EXCEL_OUTPUT_DIR}, partition: ${PARTITION_MODE}, flush: ${FLUSH_INTERVAL_MS}ms`);

  return {
    flushQueue,
    enqueueGpsRecord,
    getQueueStats: () => ({
      queueSize: queue.length,
      processedCount: processedIds.size
    })
  };
};

const getQueueStats = () => ({
  queueSize: queue.length,
  processedCount: processedIds.size
});

module.exports = {
  enqueueGpsRecord,
  startExcelExporter,
  flushQueue,
  getQueueStats,
  getPartitionPath
};

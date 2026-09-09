require('dotenv').config();

const mongoose = require('mongoose');

const STALE_TRIP_HOURS = parseInt(process.env.STALE_TRIP_HOURS || '12', 10);

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || 'TrackMatev1';

  if (!uri) {
    throw new Error('MONGO_URI is not defined in the environment variables');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName });
  console.log(`[Worker] Connected to MongoDB: ${dbName}`);
};

const cleanStaleTrips = async () => {
  const Trip = mongoose.connection.collection('trips');

  // Find and auto-complete trips that have been ONGOING for too long
  const cutoff = new Date(Date.now() - STALE_TRIP_HOURS * 60 * 60 * 1000);

  const result = await Trip.updateMany(
    {
      status: 'ONGOING',
      startedAt: { $lt: cutoff }
    },
    {
      $set: {
        status: 'COMPLETED',
        endedAt: new Date()
      }
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`[Worker] Auto-ended ${result.modifiedCount} stale trip(s)`);
  }

  return result.modifiedCount;
};

/**
 * Automatic archival/retention for old GPS records.
 *
 * MongoDB remains the primary production datastore, but old LocationEvent
 * GPS breadcrumbs should be archived and purged to keep the collection small
 * and fast. Retention window is configurable via GPS_RETENTION_DAYS
 * (default 7 days). Archived records can be exported to Excel afterwards.
 */
const archiveOldGpsRecords = async () => {
  const LocationEvent = mongoose.connection.collection('locationevents');

  const retentionDays = parseInt(process.env.GPS_RETENTION_DAYS || '7', 10);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await LocationEvent.deleteMany({
    timestamp: { $lt: cutoff }
  });

  if (result.deletedCount > 0) {
    console.log(`[Worker] Archived ${result.deletedCount} old GPS record(s) older than ${retentionDays} days`);
  }

  return result.deletedCount;
};

const run = async () => {
  await connectDB();

  const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // Every 30 minutes
  const ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000; // Once a day (every 24h)

  const tick = async () => {
    try {
      const count = await cleanStaleTrips();
      if (count > 0) {
        console.log(`[Worker] Cleaned up ${count} stale trips`);
      } else {
        console.log('[Worker] No stale trips found');
      }
    } catch (err) {
      console.error('[Worker] Cleanup error:', err.message);
    }
  };

  const archiveTick = async () => {
    try {
      const count = await archiveOldGpsRecords();
      if (count > 0) {
        console.log(`[Worker] Archived ${count} old GPS record(s)`);
      } else {
        console.log('[Worker] No old GPS records to archive');
      }
    } catch (err) {
      console.error('[Worker] Archive error:', err.message);
    }
  };

  await tick();
  setInterval(tick, CLEANUP_INTERVAL_MS);

  // Run archival once at startup, then every 24 hours
  await archiveTick();
  setInterval(archiveTick, ARCHIVE_INTERVAL_MS);
};

run().catch(err => {
  console.error('[Worker] Fatal startup error:', err);
  process.exit(1);
});

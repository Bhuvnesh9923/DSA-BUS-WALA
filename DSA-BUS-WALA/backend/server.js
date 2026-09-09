const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// Also load the root-level Atlas credentials file as a fallback (gitignored).
require('dotenv').config({ path: path.join(__dirname, '..', 'atlas-credentials.env') });

const express = require('express');
const cors = require('cors');
const http = require('http');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { ensureDefaultAccounts } = require('./controllers/authController');
const authRoutes = require('./routes/authRoutes');
const routeRoutes = require('./routes/routeRoutes');
const tripRoutes = require('./routes/tripRoutes');
const adminRoutes = require('./routes/adminRoutes');
const busRoutes = require('./routes/busRoutes');
const driverRoutes = require('./routes/driverRoutes');
const stopRoutes = require('./routes/stopRoutes');
const studentRoutes = require('./routes/studentRoutes');
const eventRoutes = require('./routes/eventRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { registerLocationHandlers } = require('./controllers/locationController');
const publicRoutes = require('./routes/publicRoutes');
const { router: gpsRoutes } = require('./routes/gpsRoutes');
const demoRoutes = require('./routes/demoRoutes');
const { startGpsPolling, normalizeGpsPayload } = require('./utils/gpsIngestion');
const { persistGpsRecord } = require('./utils/gpsPersistence');
const { startExcelExporter } = require('./utils/excelExporter');
const logger = require('./utils/logger');

const app = express();

// Trust proxy on hosted platforms (Render, Heroku, etc.) — required for rate limiting
app.set('trust proxy', 1);

// CORS configuration - use specific origins in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  credentials: true
}));

app.use(express.json());

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per window
  message: { message: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to auth routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 registration attempts per hour
  message: { message: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
}));

app.use('/api/auth', authRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/stops', stopRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/students', studentRoutes); // Alias for frontend compatibility
app.use('/api/events', eventRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/public', publicRoutes);

// GPS ingestion — external real GPS provider pushes coordinates here
app.use('/api/gps', gpsRoutes);

// Demo replay — parse an uploaded Excel/CSV coordinates file for the driver simulator
app.use('/api/demo', demoRoutes);

// Lightweight health check — used by UptimeRobot / cron pings to prevent Render sleep
app.get('/ping', (_req, res) => {
  const uptimeSec = process.uptime();
  const h = Math.floor(uptimeSec / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const s = Math.floor(uptimeSec % 60);
  const uptime = `${h}h ${m}m ${s}s`;

  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>TrackMate — Status</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0e1a;color:#e2e8f0;overflow:hidden}
.bg{position:fixed;inset:0;z-index:0}
.bg span{position:absolute;border-radius:50%;filter:blur(80px);opacity:.12;animation:float 8s ease-in-out infinite alternate}
.bg span:nth-child(1){width:400px;height:400px;background:#FF6B2C;top:-10%;left:-5%}
.bg span:nth-child(2){width:350px;height:350px;background:#3b82f6;bottom:-10%;right:-5%;animation-delay:2s}
.bg span:nth-child(3){width:250px;height:250px;background:#FF6B2C;top:50%;left:50%;transform:translate(-50%,-50%);animation-delay:4s}
@keyframes float{0%{transform:translate(0,0) scale(1)}100%{transform:translate(30px,-20px) scale(1.1)}}
.card{position:relative;z-index:1;background:rgba(15,23,42,.65);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:2.5rem 3rem;text-align:center;max-width:380px;width:90%;box-shadow:0 25px 60px rgba(0,0,0,.4)}
.logo{font-size:1.5rem;font-weight:800;letter-spacing:-.02em;margin-bottom:1.5rem;background:linear-gradient(135deg,#FF6B2C,#ff9a5c);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.logo span{font-size:.7rem;display:block;font-weight:500;letter-spacing:.15em;text-transform:uppercase;-webkit-text-fill-color:#64748b;margin-top:.25rem}
.pulse-wrap{display:flex;align-items:center;justify-content:center;gap:.6rem;margin-bottom:1.75rem}
.pulse{width:12px;height:12px;border-radius:50%;background:#22c55e;box-shadow:0 0 12px #22c55e80;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 8px #22c55e60}50%{box-shadow:0 0 20px #22c55eaa,0 0 40px #22c55e40}}
.status{font-size:1rem;font-weight:600;color:#22c55e}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.5rem}
.stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:.85rem .5rem}
.stat-label{font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:.35rem}
.stat-value{font-size:.95rem;font-weight:700;color:#e2e8f0}
.stat-value.orange{color:#FF6B2C}
.foot{font-size:.65rem;color:#475569;line-height:1.6}
.foot a{color:#FF6B2C;text-decoration:none}
</style>
</head>
<body>
<div class="bg"><span></span><span></span><span></span></div>
<div class="card">
  <div class="logo">TrackMate<span>System Status</span></div>
  <div class="pulse-wrap"><div class="pulse"></div><div class="status">All Systems Operational</div></div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Uptime</div><div class="stat-value orange">${uptime}</div></div>
    <div class="stat"><div class="stat-label">Status</div><div class="stat-value">Online</div></div>
    <div class="stat"><div class="stat-label">Server</div><div class="stat-value">Render</div></div>
    <div class="stat"><div class="stat-label">Checked</div><div class="stat-value">${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</div></div>
  </div>
  <div class="foot">Monitored by UptimeRobot &middot; <a href="https://trackmaterce.onrender.com" target="_blank">Go to TrackMate</a></div>
</div>
</body>
</html>`);
});

app.get('/', (_req, res) => {
  res.json({ message: 'TrackMate backend is running' });
});

// Global error handler - must be last middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(err.status || 500).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to gracefully shut down
  // For now, just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Graceful shutdown
  process.exit(1);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
    credentials: true
  }
});
app.set('io', io);

// --- Live Visitor Counter ---
let liveVisitorCount = 0;

io.on('connection', (socket) => {
  liveVisitorCount++;
  io.emit('stats:live_visitors', liveVisitorCount);

  socket.on('disconnect', () => {
    liveVisitorCount = Math.max(0, liveVisitorCount - 1);
    io.emit('stats:live_visitors', liveVisitorCount);
  });
});

registerLocationHandlers(io);

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  await ensureDefaultAccounts();
  server.listen(PORT, '0.0.0.0', () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🚍 TrackMate backend listening on port ${PORT}`);
    }
  });

  // Start the background Live Feed → Excel exporter. This appends live GPS
  // records to partitioned .xlsx files WITHOUT blocking the tracking API.
  // MongoDB remains the primary datastore; Excel is reporting/export only.
  try {
    startExcelExporter();
  } catch (excelErr) {
    logger.error(`[Excel] Failed to start exporter: ${excelErr.message}`);
  }

  // Start real GPS polling loop if an HTTP provider is configured.
  // This is the ONLY place the system receives production bus coordinates.
  startGpsPolling(async (payload) => {
    if (!payload?.busId) return;
    try {
      const BusModel = require('./models/Bus');
      const TripModel = require('./models/Trip');

      const bus = await BusModel.findById(payload.busId).catch(() => null);
      if (!bus) return;

      // Persist EVERY validated live GPS update to MongoDB + enqueue to Excel.
      await persistGpsRecord(
        {
          busId: bus._id.toString(),
          tripId: payload.tripId || null,
          lat: payload.lat,
          lng: payload.lng,
          speed: payload.speed,
          heading: payload.heading,
          timestamp: payload.timestamp
        },
        {
          busId: bus._id.toString(),
          tripId: payload.tripId || null,
          source: 'provider',
          apiStatus: 'OK'
        }
      );

      await BusModel.findByIdAndUpdate(bus._id, {
        lastKnownLocation: { lat: payload.lat, lng: payload.lng, updatedAt: payload.timestamp }
      });

      // Find ongoing trip for the bus, then drive the stop/ETA pipeline.
      const trip = payload.tripId
        ? await TripModel.findOne({ _id: payload.tripId, status: 'ONGOING' })
        : await TripModel.findOne({ bus: bus._id, status: 'ONGOING' }).sort({ startedAt: -1 });

      if (trip) {
        const { handleDriverLocationUpdate } = require('./controllers/locationController');
        const fakeSocket = {
          user: { id: trip.driver, role: 'driver' },
          join: () => {},
          emit: (event, data) => {
            if (io) io.to(`trip_${trip._id}`).emit(event, data);
          }
        };
        await handleDriverLocationUpdate(io, fakeSocket, {
          driverId: trip.driver?.toString(),
          tripId: trip._id.toString(),
          busId: bus._id.toString(),
          lat: payload.lat,
          lng: payload.lng,
          speed: payload.speed,
          heading: payload.heading,
          timestamp: payload.timestamp,
          force: true
        });
      }
    } catch (err) {
      logger.error(`[GPS] Poll handler error: ${err.message}`);
    }
  });
};

start();

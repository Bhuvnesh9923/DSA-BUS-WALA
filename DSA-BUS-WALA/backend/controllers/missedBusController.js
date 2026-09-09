const Trip = require('../models/Trip');
const Route = require('../models/Route');
const Bus = require('../models/Bus');
const StudentAssignment = require('../models/StudentAssignment');
const { getCachedTripState } = require('../inMemory/activeTrips');

// ── In-memory redirect map: studentId → redirect info ──
const redirectMap = new Map();

/**
 * POST /students/missed-bus
 *
 * Student reports they missed their bus. The system finds the nearest
 * alternative bus (same route first, then cross-route) that hasn't
 * yet passed the student's stop.
 */
const reportMissedBus = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // 1. Get student's assignment & stop info
    const assignment = await StudentAssignment.findOne({ student: userId })
      .populate('bus')
      .populate('stop');

    if (!assignment || !assignment.stop) {
      return res.status(400).json({
        message: 'No bus/stop assignment found. Please set up your bus assignment first.'
      });
    }

    const studentStopName = assignment.stop.name?.trim().toLowerCase();
    const studentBusId = assignment.bus._id.toString();

    if (!studentStopName) {
      return res.status(400).json({ message: 'Your stop does not have a name configured.' });
    }

    // 2. Find ALL ongoing trips (exclude student's own bus)
    const ongoingTrips = await Trip.find({ status: 'ONGOING' })
      .populate('bus', 'name numberPlate lastKnownLocation')
      .populate('driver', 'name phone')
      .populate('route');

    // 3. Find alternative buses that haven't passed the student's stop
    const candidates = [];

    for (const trip of ongoingTrips) {
      // Skip the student's own bus
      if (trip.bus._id.toString() === studentBusId) continue;

      // Skip trips without route/stops
      if (!trip.route?.stops?.length) continue;

      const routeStops = [...trip.route.stops].sort((a, b) => (a.seq || 0) - (b.seq || 0));

      // Find matching stop by name (case-insensitive)
      const matchIndex = routeStops.findIndex(
        (s) => s.name?.trim().toLowerCase() === studentStopName
      );

      if (matchIndex === -1) continue; // Stop not on this route

      const matchingStop = routeStops[matchIndex];
      const currentIndex = trip.currentStopIndex || 0;

      // Bus must NOT have passed this stop yet
      if (currentIndex > matchIndex) continue;

      // Calculate ETA to the matching stop
      let etaMs = null;

      // Try cached ETA first
      const cachedState = getCachedTripState(trip._id);
      if (cachedState?.etaCache) {
        const seqKey = String(matchingStop.seq);
        if (typeof cachedState.etaCache[seqKey] === 'number') {
          etaMs = cachedState.etaCache[seqKey];
        }
      }

      // Fallback: estimate from segment averages
      if (etaMs === null) {
        etaMs = 0;
        for (let i = currentIndex; i < matchIndex; i++) {
          const stop = routeStops[i];
          const avgMin = stop.averageTravelMinutes || 2;
          etaMs += avgMin * 60 * 1000;
        }
        // Use route segStats if available
        if (trip.route.segStats?.length) {
          let segEta = 0;
          for (let i = currentIndex; i < matchIndex; i++) {
            const seg = trip.route.segStats[i];
            segEta += (seg?.avgSec || 120) * 1000;
          }
          if (segEta > 0) etaMs = segEta;
        }
      }

      candidates.push({
        tripId: trip._id.toString(),
        bus: {
          _id: trip.bus._id,
          name: trip.bus.name,
          numberPlate: trip.bus.numberPlate,
          lastKnownLocation: trip.bus.lastKnownLocation
        },
        driver: trip.driver ? {
          name: trip.driver.name,
          phone: trip.driver.phone
        } : null,
        route: {
          _id: trip.route._id,
          name: trip.route.name
        },
        matchingStop: {
          name: matchingStop.name,
          seq: matchingStop.seq,
          lat: matchingStop.lat,
          lng: matchingStop.lng
        },
        stopsAway: matchIndex - currentIndex,
        etaMs,
        etaMinutes: etaMs ? Math.ceil(etaMs / 60000) : null,
        sameRoute: trip.route._id.toString() === assignment.bus.route?.toString()
      });
    }

    // 4. No alternatives found
    if (candidates.length === 0) {
      return res.json({
        found: false,
        message: 'No alternative buses available for your stop right now.',
        redirect: null
      });
    }

    // 5. Sort: same-route first, then by ETA (nearest first)
    candidates.sort((a, b) => {
      if (a.sameRoute !== b.sameRoute) return a.sameRoute ? -1 : 1;
      return (a.etaMs || Infinity) - (b.etaMs || Infinity);
    });

    const best = candidates[0];

    // 6. Store redirect in memory
    const redirectInfo = {
      originalBusId: studentBusId,
      originalBusName: assignment.bus.name,
      redirectedBus: best.bus,
      redirectedTripId: best.tripId,
      redirectedRoute: best.route,
      driver: best.driver,
      matchingStop: best.matchingStop,
      stopsAway: best.stopsAway,
      etaMs: best.etaMs,
      etaMinutes: best.etaMinutes,
      sameRoute: best.sameRoute,
      redirectedAt: new Date().toISOString()
    };

    redirectMap.set(userId, redirectInfo);

    res.json({
      found: true,
      message: best.sameRoute
        ? `Redirected to ${best.bus.name} on the same route — ${best.etaMinutes || '?'} min away`
        : `Redirected to ${best.bus.name} (${best.route.name}) — ${best.etaMinutes || '?'} min away`,
      redirect: redirectInfo,
      alternativesCount: candidates.length
    });
  } catch (error) {
    console.error('reportMissedBus error:', error);
    res.status(500).json({ message: 'Failed to find alternative bus', error: error.message });
  }
};

/**
 * GET /students/redirect-status
 *
 * Returns the current redirect state for the student (if any).
 * Used on page refresh to restore redirect UI.
 */
const getRedirectStatus = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const redirect = redirectMap.get(userId);

    if (!redirect) {
      return res.json({ active: false, redirect: null });
    }

    // Verify the redirected trip is still ongoing
    const trip = await Trip.findById(redirect.redirectedTripId, 'status currentStopIndex');
    if (!trip || trip.status !== 'ONGOING') {
      redirectMap.delete(userId);
      return res.json({ active: false, redirect: null, reason: 'Trip ended' });
    }

    // Check if bus has now passed the stop
    const matchSeq = redirect.matchingStop?.seq;
    if (matchSeq != null && trip.currentStopIndex > matchSeq) {
      // Bus has passed — remove redirect but still inform student
      redirectMap.delete(userId);
      return res.json({
        active: false,
        redirect: null,
        reason: 'Redirected bus has also passed your stop'
      });
    }

    // Update ETA from cache
    const cachedState = getCachedTripState(redirect.redirectedTripId);
    if (cachedState?.etaCache) {
      const seqKey = String(matchSeq);
      if (typeof cachedState.etaCache[seqKey] === 'number') {
        redirect.etaMs = cachedState.etaCache[seqKey];
        redirect.etaMinutes = Math.ceil(redirect.etaMs / 60000);
      }
    }

    res.json({ active: true, redirect });
  } catch (error) {
    console.error('getRedirectStatus error:', error);
    res.status(500).json({ message: 'Failed to get redirect status' });
  }
};

/**
 * POST /students/cancel-redirect
 *
 * Cancels an active redirect and returns student to their original bus.
 */
const cancelRedirect = async (req, res) => {
  const userId = req.user._id.toString();
  const had = redirectMap.delete(userId);
  res.json({
    cancelled: had,
    message: had ? 'Redirect cancelled — back to your original bus' : 'No active redirect'
  });
};

// Cleanup: remove redirects for ended trips (runs every 5 min)
setInterval(async () => {
  for (const [studentId, info] of redirectMap.entries()) {
    try {
      const trip = await Trip.findById(info.redirectedTripId, 'status').lean();
      if (!trip || trip.status !== 'ONGOING') {
        redirectMap.delete(studentId);
      }
    } catch { /* ignore */ }
  }
}, 5 * 60 * 1000);

module.exports = { reportMissedBus, getRedirectStatus, cancelRedirect, getRedirectMap: () => redirectMap };

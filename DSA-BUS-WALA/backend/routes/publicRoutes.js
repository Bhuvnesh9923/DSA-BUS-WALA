const express = require('express');
const router = express.Router();
const Bus = require('../models/Bus');
const Trip = require('../models/Trip');

/**
 * GET /api/public/buses — list all buses for the selector dropdown
 */
router.get('/buses', async (_req, res) => {
    try {
        const buses = await Bus.find({}, 'name numberPlate').sort({ name: 1 }).lean();
        const activeTrips = await Trip.find({ status: 'ONGOING' }, 'bus').lean();
        const activeBusIds = new Set(activeTrips.map(t => t.bus.toString()));
        const result = buses.map(b => ({
            _id: b._id,
            name: b.name,
            numberPlate: b.numberPlate,
            active: activeBusIds.has(b._id.toString())
        }));
        res.json(result);
    } catch (err) {
        console.error('Public buses list error:', err);
        res.status(500).json({ message: 'Failed to load buses' });
    }
});


/**
 * GET /api/public/track/:busIdentifier
 *
 * Public endpoint — no auth required.
 * Looks up a bus by name OR number plate (case-insensitive, space-insensitive).
 * URL "/track/BusNo30" matches DB entry "Bus No 30".
 */
router.get('/track/:busIdentifier', async (req, res) => {
    try {
        const identifier = req.params.busIdentifier.trim();

        // Build a regex that ignores spaces: "BusNo30" → /^B\s*u\s*s\s*N\s*o\s*3\s*0$/i
        const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flexPattern = escaped.split('').join('\\s*');
        const flexRegex = new RegExp('^\\s*' + flexPattern + '\\s*$', 'i');

        const bus = await Bus.findOne({
            $or: [
                { name: flexRegex },
                { numberPlate: flexRegex }
            ]
        }).populate('route').lean();

        if (!bus) {
            return res.status(404).json({
                found: false,
                message: 'Bus not found. Check the bus name or number plate.'
            });
        }

        // Find active trip for this bus
        const trip = await Trip.findOne({ bus: bus._id, status: 'ONGOING' })
            .populate('route')
            .populate('driver', 'name phone')
            .lean();

        if (!trip) {
            return res.json({
                found: true,
                active: false,
                bus: {
                    _id: bus._id,
                    name: bus.name,
                    numberPlate: bus.numberPlate
                },
                message: 'Bus is not currently running. Check back later.'
            });
        }

        res.json({
            found: true,
            active: true,
            bus: {
                _id: bus._id,
                name: bus.name,
                numberPlate: bus.numberPlate,
                lastKnownLocation: bus.lastKnownLocation
            },
            trip: {
                _id: trip._id,
                status: trip.status,
                currentStopIndex: trip.currentStopIndex,
                startedAt: trip.startedAt,
                lastLocation: trip.lastLocation
            },
            route: trip.route ? {
                _id: trip.route._id,
                name: trip.route.name,
                stops: trip.route.stops,
                geojson: trip.route.geojson
            } : null,
            driver: trip.driver ? {
                name: trip.driver.name
            } : null
        });
    } catch (error) {
        console.error('Public track error:', error);
        res.status(500).json({ message: 'Failed to look up bus' });
    }
});

module.exports = router;

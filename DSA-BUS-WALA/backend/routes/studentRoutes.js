const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  getAssignment,
  getEta,
  registerNotificationToken,
  getLiveTrip,
  updateNotificationPreferences,
  getNotificationPreferences,
  updateMyAssignment,
  getBusesWithRoutes,
  getBusSeats,
  bookSeat,
  releaseSeat
} = require('../controllers/studentController');
const {
  reportMissedBus,
  getRedirectStatus,
  cancelRedirect
} = require('../controllers/missedBusController');

const router = express.Router();

router.use(authMiddleware, roleMiddleware('student'));

router.get('/assignment', getAssignment);
router.get('/me', getAssignment);
router.get('/eta', getEta);
router.get('/trip', getLiveTrip);
router.post('/notifications', registerNotificationToken);
router.get('/preferences', getNotificationPreferences);
router.put('/preferences', updateNotificationPreferences);
router.get('/buses', getBusesWithRoutes);
router.put('/assignment', updateMyAssignment);

// Seat booking
router.get('/buses/:busId/seats', getBusSeats);
router.post('/buses/:busId/seats/book', bookSeat);
router.post('/buses/:busId/seats/release', releaseSeat);

// Missed bus redirect
router.post('/missed-bus', reportMissedBus);
router.get('/redirect-status', getRedirectStatus);
router.post('/cancel-redirect', cancelRedirect);

module.exports = router;

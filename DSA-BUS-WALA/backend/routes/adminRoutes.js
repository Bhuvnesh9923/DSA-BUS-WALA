const express = require('express');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  assignStudent,
  getAssignments,
  updateAssignment,
  deleteAssignment,
  getActiveTrips,
  getEventHistory,
  getDashboardStats,
  clearEvents
} = require('../controllers/adminController');
const {
  createDriverAccount,
  getDrivers,
  updateDriverAccount,
  deleteDriverAccount
} = require('../controllers/driverController');
const {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkUploadStudents
} = require('../controllers/studentAdminController');
const { importDatasetHandler } = require('../controllers/adminController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = express.Router();

// Rate limit for CSV export to prevent abuse
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 export requests per window
  message: { message: 'Too many export requests, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false
});


// Export routes before auth middleware - handles their own token auth for browser downloads
// Rate limited to prevent abuse
router.get('/export-trips', exportLimiter, require('../controllers/adminController').exportTripsCSV);
router.get('/export-live-gps', exportLimiter, require('../controllers/adminController').exportLiveGpsExcel);

router.use(authMiddleware, roleMiddleware('admin'));

router.get('/dashboard', getDashboardStats);
router.post('/assignments', assignStudent);
router.get('/assignments', getAssignments);
router.put('/assignments/:id', updateAssignment);
router.delete('/assignments/:id', deleteAssignment);
router.get('/trips', getActiveTrips);
router.get('/live-buses', require('../controllers/adminController').getLiveBusPositions);
router.get('/analytics', require('../controllers/adminController').getTripAnalytics);
router.get('/events', getEventHistory);
router.delete('/events', clearEvents);
router.post('/drivers', createDriverAccount);
router.get('/drivers', getDrivers);
router.put('/drivers/:id', updateDriverAccount);
router.delete('/drivers/:id', deleteDriverAccount);
router.get('/students', listStudents);
router.post('/students', createStudent);
router.post('/students/bulk-upload', upload.single('file'), bulkUploadStudents);
router.put('/students/:id', updateStudent);
router.delete('/students/:id', deleteStudent);
router.post('/import-dataset', upload.single('file'), importDatasetHandler);

module.exports = router;

const express = require('express');
const multer = require('multer');
const { parseExcelHandler } = require('../controllers/demoController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Demo: parse an uploaded Excel/CSV coordinates file and return the ordered rows.
// Use multer memory storage — the file buffer is parsed in-memory, never persisted.
router.post('/parse-excel', upload.single('file'), parseExcelHandler);

module.exports = router;

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const StudentAssignment = require('../models/StudentAssignment');
const Bus = require('../models/Bus');
const Stop = require('../models/Stop');
const Route = require('../models/Route');
const { sendWelcomeEmail } = require('../utils/emailService');

const scrubPassword = (userDoc) => {
  if (!userDoc) return userDoc;
  const obj = userDoc.toObject ? userDoc.toObject() : userDoc;
  delete obj.password;
  return obj;
};

const listStudents = async (_req, res) => {
  const students = await User.find({ role: 'student' }).select('-password');
  res.json(students);
};

const createStudent = async (req, res) => {
  try {
    const { username, password, name, phone, email, busId, stopId } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'username is required' });
    }
    if (!email) {
      return res.status(400).json({ message: 'email is required' });
    }

    const normalizedUsername = username.trim().toUpperCase();
    const plainPassword = (password || normalizedUsername).trim();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Case-insensitive duplicate check
    const existingUser = await User.findOne({
      username: { $regex: new RegExp(`^${normalizedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existingUser) {
      return res.status(409).json({ message: 'Roll number already registered' });
    }

    const student = await User.create({
      username: normalizedUsername,
      password: hashedPassword,
      role: 'student',
      name,
      phone,
      email: email.trim().toLowerCase(),
      firstLogin: true // Force password change on first login
    });

    // Create student assignment if bus provided
    let assignment = null;
    let busNumber = 'Not assigned yet';
    let routeName = 'Not assigned yet';
    let stopName = 'Not assigned yet';

    if (busId) {
      const bus = await Bus.findById(busId).populate('route');
      if (bus) {
        const assignmentData = {
          student: student._id,
          bus: busId
        };

        // Add stop if provided and valid
        if (stopId) {
          const stop = await Stop.findById(stopId);
          if (stop) {
            assignmentData.stop = stopId;
            stopName = stop.name;
          }
        }

        assignment = await StudentAssignment.create(assignmentData);
        busNumber = bus.numberPlate || bus.name;
        routeName = bus.route?.name || 'Unknown';
      }
    }

    // Send welcome email asynchronously (don't wait)
    sendWelcomeEmail({
      email: student.email,
      fullName: student.name || student.username,
      username: student.username,
      busNumber,
      routeName,
      stopName
    }).catch(err => console.error('Welcome email failed:', err.message));

    res.status(201).json({
      student: scrubPassword(student),
      assignment
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateStudent = async (req, res) => {
  try {
    const updates = {};
    ['username', 'name', 'phone', 'email'].forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    });

    if (req.body.password) {
      const hashedPassword = await bcrypt.hash(req.body.password.trim(), 10);
      updates.password = hashedPassword;
    }

    const student = await User.findOneAndUpdate({ _id: req.params.id, role: 'student' }, updates, {
      new: true,
      runValidators: true
    }).select('-password');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteStudent = async (req, res) => {
  const student = await User.findOneAndDelete({ _id: req.params.id, role: 'student' });
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  await StudentAssignment.deleteMany({ student: student._id });
  res.json({ message: 'Student removed' });
};

/**
 * Bulk upload students from CSV file
 * Expected CSV columns: fullname, rollno, email, busname (optional)
 * Password is auto-set to the roll number (uppercase)
 */
const bulkUploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded. Please upload a CSV file.' });
    }

    const csvParser = require('csv-parser');
    const { Readable } = require('stream');

    // Parse CSV from buffer
    const rows = [];
    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer);
      stream
        .pipe(csvParser({
          mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, ''),
          skipLines: 0
        }))
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    if (rows.length === 0) {
      return res.status(400).json({ message: 'CSV file is empty or has no valid rows.' });
    }

    // Validate required columns exist
    const sampleRow = rows[0];
    const hasFullname = 'fullname' in sampleRow || 'name' in sampleRow;
    const hasRollno = 'rollno' in sampleRow || 'rollnumber' in sampleRow || 'username' in sampleRow;
    const hasEmail = 'email' in sampleRow || 'emailid' in sampleRow || 'mailid' in sampleRow;

    if (!hasRollno) {
      return res.status(400).json({
        message: 'CSV must have a "rollno" (or "rollnumber" / "username") column.',
        detectedColumns: Object.keys(sampleRow)
      });
    }

    if (!hasEmail) {
      return res.status(400).json({
        message: 'CSV must have an "email" (or "emailid" / "mailid") column.',
        detectedColumns: Object.keys(sampleRow)
      });
    }

    // Pre-load buses for optional assignment
    const allBuses = await Bus.find({}).populate('route', 'name');
    const busMap = new Map();
    allBuses.forEach(b => {
      busMap.set(b.name?.toLowerCase(), b);
      busMap.set(b.numberPlate?.toLowerCase(), b);
    });

    const results = { created: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2; // +1 for 0-index, +1 for header row

      // Extract fields (handle multiple possible column names)
      const rollno = (row.rollno || row.rollnumber || row.username || '').trim().toUpperCase();
      const fullname = (row.fullname || row.name || '').trim();
      const email = (row.email || row.emailid || row.mailid || '').trim().toLowerCase();
      const busname = (row.busname || row.bus || '').trim();

      // Validate required fields
      if (!rollno) {
        results.errors.push({ row: rowIndex, rollno: '', reason: 'Missing roll number' });
        continue;
      }
      if (!email) {
        results.errors.push({ row: rowIndex, rollno, reason: 'Missing email' });
        continue;
      }

      // Check for duplicate roll number (case-insensitive)
      const existingUser = await User.findOne({
        username: { $regex: new RegExp(`^${rollno.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existingUser) {
        results.skipped++;
        results.errors.push({ row: rowIndex, rollno, reason: 'Roll number already exists' });
        continue;
      }

      try {
        // Create user with password = rollno
        const hashedPassword = await bcrypt.hash(rollno, 10);
        const student = await User.create({
          username: rollno,
          password: hashedPassword,
          role: 'student',
          name: fullname || rollno,
          email,
          firstLogin: true
        });

        // Optional bus assignment
        let busNumber = 'Not assigned yet';
        let routeName = 'Not assigned yet';
        let stopName = 'Not assigned yet';

        if (busname) {
          const bus = busMap.get(busname.toLowerCase());
          if (bus) {
            await StudentAssignment.create({
              student: student._id,
              bus: bus._id
            });
            busNumber = bus.numberPlate || bus.name;
            routeName = bus.route?.name || 'Unknown';
          }
        }

        // Send welcome email asynchronously
        sendWelcomeEmail({
          email: student.email,
          fullName: student.name || student.username,
          username: student.username,
          busNumber,
          routeName,
          stopName
        }).catch(err => console.error(`Welcome email failed for ${rollno}:`, err.message));

        results.created++;
      } catch (err) {
        results.errors.push({ row: rowIndex, rollno, reason: err.message });
      }
    }

    res.json({
      message: `Bulk upload complete: ${results.created} created, ${results.skipped} skipped.`,
      ...results
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ message: 'Failed to process CSV file: ' + error.message });
  }
};

module.exports = { listStudents, createStudent, updateStudent, deleteStudent, bulkUploadStudents };

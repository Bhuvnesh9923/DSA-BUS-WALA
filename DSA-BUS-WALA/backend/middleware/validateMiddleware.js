const mongoose = require('mongoose');

/**
 * Validate that a parameter is a valid MongoDB ObjectId
 * @param {string} paramName - The name of the param to validate (e.g., 'id', 'busId')
 * @returns Express middleware function
 */
const validateObjectId = (paramName) => (req, res, next) => {
  const value = req.params[paramName] || req.body[paramName];

  if (value && !mongoose.Types.ObjectId.isValid(value)) {
    return res.status(400).json({
      message: `Invalid ${paramName}: must be a valid ObjectId`
    });
  }

  next();
};

/**
 * Validate multiple ObjectId params at once
 * @param {...string} paramNames - Names of params to validate
 * @returns Express middleware function
 */
const validateObjectIds = (...paramNames) => (req, res, next) => {
  for (const paramName of paramNames) {
    const value = req.params[paramName] || req.body[paramName];

    if (value && !mongoose.Types.ObjectId.isValid(value)) {
      return res.status(400).json({
        message: `Invalid ${paramName}: must be a valid ObjectId`
      });
    }
  }

  next();
};

/**
 * Validate coordinate values are within valid ranges
 */
const validateCoordinates = (req, res, next) => {
  const { lat, lng } = req.body;

  if (lat !== undefined) {
    if (typeof lat !== 'number' || lat < -90 || lat > 90) {
      return res.status(400).json({
        message: 'Invalid latitude: must be a number between -90 and 90'
      });
    }
  }

  if (lng !== undefined) {
    if (typeof lng !== 'number' || lng < -180 || lng > 180) {
      return res.status(400).json({
        message: 'Invalid longitude: must be a number between -180 and 180'
      });
    }
  }

  next();
};

/**
 * Sanitize string inputs to prevent NoSQL injection
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;

    // Handle arrays — check every element recursively
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (sanitize(item) === null) return null;
      }
      return obj;
    }

    for (const key of Object.keys(obj)) {
      // Reject keys that start with $ (MongoDB operators)
      if (key.startsWith('$')) return null;

      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (sanitize(obj[key]) === null) return null;
      }
    }
    return obj;
  };

  if (sanitize(req.body) === null) {
    return res.status(400).json({ message: 'Invalid input detected' });
  }

  next();
};

module.exports = {
  validateObjectId,
  validateObjectIds,
  validateCoordinates,
  sanitizeInput
};

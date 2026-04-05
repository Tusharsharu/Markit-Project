// middleware/auth.js — JWT authentication middleware
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'markit_secret_dev';

/**
 * Protect routes — requires valid Bearer token
 */
function protect(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized. Token missing.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();

    const user = db.prepare('SELECT id, name, email, plan, avatar_initials, theme, default_exchange FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

/**
 * Optional auth — attaches user if token valid, continues even if not
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    req.user = db.prepare('SELECT id, name, email, plan FROM users WHERE id = ?').get(decoded.id) || null;
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { protect, optionalAuth };

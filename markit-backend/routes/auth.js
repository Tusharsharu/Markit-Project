// routes/auth.js — Authentication routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'markit_secret_dev';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// Helper to generate tokens
function generateTokens(userId) {
  const accessToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ id: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
}

// Helper to save refresh token in DB
function saveRefreshToken(db, userId, refreshToken) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)
  `).run(uuidv4(), userId, refreshToken, expiresAt);
}

// =====================
// POST /api/auth/register
// =====================
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { name, email, password } = req.body;
  const db = getDb();

  // Check if email exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const userId = uuidv4();
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  db.prepare(`
    INSERT INTO users (id, name, email, password, plan, avatar_initials)
    VALUES (?, ?, ?, ?, 'free', ?)
  `).run(userId, name, email, hashedPassword, initials);

  const { accessToken, refreshToken } = generateTokens(userId);
  saveRefreshToken(db, userId, refreshToken);

  const user = db.prepare('SELECT id, name, email, plan, avatar_initials, theme FROM users WHERE id = ?').get(userId);

  res.status(201).json({
    success: true,
    message: 'Account created successfully!',
    data: { user, accessToken, refreshToken }
  });
}));

// =====================
// POST /api/auth/login
// =====================
router.post('/login', [
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { email, password } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const { accessToken, refreshToken } = generateTokens(user.id);
  saveRefreshToken(db, user.id, refreshToken);

  const { password: _, ...safeUser } = user;

  res.json({
    success: true,
    message: `Welcome back, ${user.name}!`,
    data: { user: safeUser, accessToken, refreshToken }
  });
}));

// =====================
// POST /api/auth/refresh
// =====================
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'Refresh token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }

  const db = getDb();
  const stored = db.prepare('SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ?').get(refreshToken, decoded.id);

  if (!stored || new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({ success: false, message: 'Refresh token expired. Please login again.' });
  }

  // Rotate refresh token
  db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.id);
  saveRefreshToken(db, decoded.id, newRefreshToken);

  res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
}));

// =====================
// POST /api/auth/logout
// =====================
router.post('/logout', protect, asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const db = getDb();

  if (refreshToken) {
    db.prepare('DELETE FROM refresh_tokens WHERE token = ? AND user_id = ?').run(refreshToken, req.user.id);
  } else {
    // Logout all sessions
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);
  }

  res.json({ success: true, message: 'Logged out successfully' });
}));

// =====================
// GET /api/auth/me
// =====================
router.get('/me', protect, asyncHandler(async (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, name, email, plan, avatar_initials, theme, default_exchange,
           notifications_price, notifications_daily, notifications_predict,
           compact_mode, auto_refresh, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  res.json({ success: true, data: { user } });
}));

module.exports = router;

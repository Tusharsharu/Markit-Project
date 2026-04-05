// routes/user.js — User profile & settings routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(protect);

// =====================
// GET /api/user/profile
// =====================
router.get('/profile', asyncHandler(async (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, name, email, plan, avatar_initials, theme, default_exchange,
           notifications_price, notifications_daily, notifications_predict,
           compact_mode, auto_refresh, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  res.json({ success: true, data: { user } });
}));

// =====================
// PUT /api/user/profile
// Update name, email
// =====================
router.put('/profile', [
  body('name').optional().trim().notEmpty().isLength({ max: 60 }),
  body('email').optional().isEmail().normalizeEmail(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const db = getDb();
  const { name, email } = req.body;
  const updates = [];
  const values = [];

  if (name) {
    updates.push('name = ?');
    values.push(name);
    updates.push('avatar_initials = ?');
    values.push(name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase());
  }

  if (email) {
    const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
    if (exists) return res.status(409).json({ success: false, message: 'Email already in use' });
    updates.push('email = ?');
    values.push(email);
  }

  if (!updates.length) {
    return res.status(400).json({ success: false, message: 'Nothing to update' });
  }

  updates.push('updated_at = datetime(\'now\')');
  values.push(req.user.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT id, name, email, plan, avatar_initials, theme FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, message: 'Profile updated!', data: { user: updated } });
}));

// =====================
// PUT /api/user/settings
// Update all preference settings
// =====================
router.put('/settings', asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    theme,
    default_exchange,
    notifications_price,
    notifications_daily,
    notifications_predict,
    compact_mode,
    auto_refresh
  } = req.body;

  const updates = [];
  const values = [];

  if (theme !== undefined && ['light', 'dark'].includes(theme)) {
    updates.push('theme = ?'); values.push(theme);
  }
  if (default_exchange !== undefined && ['ALL', 'NSE', 'BSE'].includes(default_exchange)) {
    updates.push('default_exchange = ?'); values.push(default_exchange);
  }
  if (notifications_price !== undefined) {
    updates.push('notifications_price = ?'); values.push(notifications_price ? 1 : 0);
  }
  if (notifications_daily !== undefined) {
    updates.push('notifications_daily = ?'); values.push(notifications_daily ? 1 : 0);
  }
  if (notifications_predict !== undefined) {
    updates.push('notifications_predict = ?'); values.push(notifications_predict ? 1 : 0);
  }
  if (compact_mode !== undefined) {
    updates.push('compact_mode = ?'); values.push(compact_mode ? 1 : 0);
  }
  if (auto_refresh !== undefined) {
    updates.push('auto_refresh = ?'); values.push(auto_refresh ? 1 : 0);
  }

  if (!updates.length) {
    return res.status(400).json({ success: false, message: 'No valid settings provided' });
  }

  updates.push('updated_at = datetime(\'now\')');
  values.push(req.user.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const user = db.prepare(`
    SELECT id, name, email, plan, avatar_initials, theme, default_exchange,
           notifications_price, notifications_daily, notifications_predict,
           compact_mode, auto_refresh
    FROM users WHERE id = ?
  `).get(req.user.id);

  res.json({ success: true, message: 'Settings saved!', data: { user } });
}));

// =====================
// PUT /api/user/password
// Change password
// =====================
router.put('/password', [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Current password incorrect' });
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hashed, req.user.id);

  // Invalidate all refresh tokens (force re-login on other devices)
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);

  res.json({ success: true, message: 'Password changed successfully. Please login again on other devices.' });
}));

// =====================
// GET /api/user/alerts
// Get user price alerts
// =====================
router.get('/alerts', asyncHandler(async (req, res) => {
  const db = getDb();
  const alerts = db.prepare(`
    SELECT pa.*, s.name as stock_name, s.price as current_price
    FROM price_alerts pa
    JOIN stocks s ON pa.symbol = s.symbol
    WHERE pa.user_id = ?
    ORDER BY pa.created_at DESC
  `).all(req.user.id);

  res.json({ success: true, data: { alerts } });
}));

// =====================
// POST /api/user/alerts
// Create price alert
// =====================
router.post('/alerts', [
  body('symbol').notEmpty(),
  body('alert_type').isIn(['above', 'below']),
  body('target_price').isFloat({ min: 0 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { symbol, alert_type, target_price } = req.body;
  const db = getDb();

  const stock = db.prepare('SELECT symbol FROM stocks WHERE symbol = ?').get(symbol.toUpperCase());
  if (!stock) return res.status(404).json({ success: false, message: 'Stock not found' });

  db.prepare(`
    INSERT INTO price_alerts (user_id, symbol, alert_type, target_price)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, symbol.toUpperCase(), alert_type, parseFloat(target_price));

  res.status(201).json({ success: true, message: `Alert created: ${symbol} ${alert_type} ₹${target_price}` });
}));

// =====================
// DELETE /api/user/alerts/:id
// =====================
router.delete('/alerts/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM price_alerts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  res.json({ success: true, message: 'Alert deleted' });
}));

module.exports = router;

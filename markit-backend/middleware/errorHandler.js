// middleware/errorHandler.js — Global error handler + response helpers

/**
 * Global error handler (put last in express middleware chain)
 */
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: err.errors });
  }

  // SQLite unique constraint
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ success: false, message: 'Resource already exists.' });
  }

  const status = err.statusCode || err.status || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ success: false, message });
}

/**
 * 404 handler
 */
function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
}

/**
 * Async wrapper to catch errors without try/catch in every route
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, notFound, asyncHandler };

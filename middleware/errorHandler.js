'use strict';

// Global error handler — must be registered last in server.js.
// Routes signal expected errors by attaching .statusCode to the error object
// and setting .message to a safe, user-facing string.
// Unexpected errors (Docker API failures, fs errors, etc.) are logged
// server-side and return a generic message to the client.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);

  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;

  // Only surface the error message for explicit operational errors (4xx).
  // Never expose internal details for 5xx.
  const message = statusCode < 500
    ? err.message
    : 'An internal error occurred';

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;

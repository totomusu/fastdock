'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const dataStore = require('./utils/dataStore');
const { ASSETS_DIR } = require('./middleware/upload');
const errorHandler = require('./middleware/errorHandler');
const containersRouter = require('./routes/containers');
const appSettingsRouter = require('./routes/appSettings');
const iconsRouter = require('./routes/icons');

const app = express();
// FastDock is commonly deployed behind a reverse proxy (Caddy/Nginx/VPN gateways)
// that sets X-Forwarded-For. express-rate-limit validates this and will throw
// unless `trust proxy` is enabled.
app.set('trust proxy', true);
const PORT = process.env.PORT || 3080;

// ── Security headers ──────────────────────────────────────────────────────────
// index.html uses inline <script> blocks, so 'unsafe-inline' is required for
// scriptSrc. Extracting scripts to public/app.js would allow removing it.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "cdn.jsdelivr.net"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  hsts: false  // disabled: server runs HTTP only (LAN deployment)
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
// LAN-only deployment: allow requests with no origin (same-origin, curl).
// Explicit methods/headers instead of wildcard default.
app.use(cors({
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' }
});

// Stricter limit on the icon download endpoint (external HTTP calls)
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download requests, please slow down' }
});

app.use('/api', apiLimiter);
app.post('/api/download-icon', downloadLimiter);

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(ASSETS_DIR));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', containersRouter);
app.use('/api', appSettingsRouter);
app.use('/api', iconsRouter);

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    // Ensure data/ directory exists and migrate legacy JSON files from public/
    await dataStore.ensureDataDir();

    // Ensure upload directory exists
    await fs.promises.mkdir(ASSETS_DIR, { recursive: true });

    app.listen(PORT, () => {
      console.log(`FastDock running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();

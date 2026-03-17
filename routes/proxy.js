'use strict';

// Server-side proxy for remote FastDock instances.
//
// The browser cannot directly fetch http:// endpoints when the page is served
// over https:// (mixed content policy). These routes accept a ?serverIndex=N
// query param, look up the configured server from appSettings.json, and
// forward the request server-side — no browser ↔ remote HTTP traffic needed.

const express = require('express');
const axios   = require('axios');
const fs      = require('fs');

const dataStore = require('../utils/dataStore');
const { upload, validateMagicBytes } = require('../middleware/upload');

const router = express.Router();

// Same regex used in routes/containers.js
const CONTAINER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,128}$/;

function makeError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Look up a stored server by index. Returns null if index is invalid or
// out of bounds so callers can return a 404 without crashing.
async function resolveServer(rawIndex) {
  const idx = parseInt(rawIndex, 10);
  if (!Number.isInteger(idx) || idx < 0) return null;

  let settings = {};
  try { settings = await dataStore.readJSON('appSettings.json'); } catch { settings = {}; }
  const servers = settings.servers || [];
  return idx < servers.length ? servers[idx] : null;
}

// Build the base URL for a stored server config.
function serverBaseUrl(server) {
  return `${server.address}:${server.port}`;
}

// Translate network / timeout errors from axios into HTTP error codes.
function axiosErrorToHttpError(err) {
  const networkCodes = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'];
  if (networkCodes.includes(err.code)) {
    return makeError('Remote server unreachable', 502);
  }
  if (err.code === 'ECONNABORTED' || (err.message && err.message.includes('timeout'))) {
    return makeError('Remote server timed out', 504);
  }
  return err;
}

// ── GET /api/proxy/containers?serverIndex=N ───────────────────────────────
router.get('/proxy/containers', async (req, res, next) => {
  try {
    const server = await resolveServer(req.query.serverIndex);
    if (!server) return next(makeError('Server not found', 404));

    const url = `${serverBaseUrl(server)}/api/containers`;
    const remote = await axios.get(url, {
      timeout: 10_000,
      validateStatus: () => true   // forward any HTTP status, don't throw
    });

    res.status(remote.status).json(remote.data);
  } catch (err) {
    next(axiosErrorToHttpError(err));
  }
});

// ── POST /api/proxy/containers/:id/start|stop?serverIndex=N ──────────────
async function proxyToggle(action, req, res, next) {
  try {
    const { id } = req.params;
    if (!CONTAINER_ID_RE.test(id)) {
      return next(makeError('Invalid container ID', 400));
    }

    const server = await resolveServer(req.query.serverIndex);
    if (!server) return next(makeError('Server not found', 404));

    const url = `${serverBaseUrl(server)}/api/containers/${id}/${action}`;
    const remote = await axios.post(url, null, {
      timeout: 10_000,
      validateStatus: () => true
    });

    res.status(remote.status).json(remote.data);
  } catch (err) {
    next(axiosErrorToHttpError(err));
  }
}

router.post('/proxy/containers/:id/start', (req, res, next) => proxyToggle('start', req, res, next));
router.post('/proxy/containers/:id/stop',  (req, res, next) => proxyToggle('stop',  req, res, next));

// ── GET /api/proxy/containers/settings?serverIndex=N ─────────────────────
// Fetches container settings from the remote server and rewrites any
// iconPath values from '/assets/...' to '/api/proxy/assets/...?serverIndex=N'
// so the browser always loads icons through this (HTTPS) server — no mixed
// content issues when the page is served over HTTPS.
router.get('/proxy/containers/settings', async (req, res, next) => {
  try {
    const server = await resolveServer(req.query.serverIndex);
    if (!server) return next(makeError('Server not found', 404));

    const url = `${serverBaseUrl(server)}/api/containers/settings`;
    const remote = await axios.get(url, {
      timeout: 10_000,
      validateStatus: () => true
    });

    // Rewrite icon paths so images are served through the proxy.
    if (remote.status === 200 && remote.data && typeof remote.data === 'object') {
      for (const setting of Object.values(remote.data)) {
        if (setting && typeof setting.iconPath === 'string' && setting.iconPath.startsWith('/assets/')) {
          const filename = setting.iconPath.slice('/assets/'.length);
          setting.iconPath = `/api/proxy/assets/${filename}?serverIndex=${req.query.serverIndex}`;
        }
      }
    }

    res.status(remote.status).json(remote.data);
  } catch (err) {
    next(axiosErrorToHttpError(err));
  }
});

// ── GET /api/proxy/assets/:filename?serverIndex=N ────────────────────────
// Fetches a container icon stored on a remote FastDock instance and pipes
// it back through this server, keeping all image requests on the same
// HTTPS origin and avoiding mixed content blocks.
router.get('/proxy/assets/:filename', async (req, res, next) => {
  try {
    // Reject any filename that contains path separators or suspicious chars.
    // Remote asset filenames are generated as '<id>-<name>.<ext>' and are
    // sanitised before being stored, so only alphanumeric + . - _ are valid.
    const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/;
    if (!SAFE_FILENAME_RE.test(req.params.filename)) {
      return next(makeError('Invalid filename', 400));
    }

    const server = await resolveServer(req.query.serverIndex);
    if (!server) return next(makeError('Server not found', 404));

    const url = `${serverBaseUrl(server)}/assets/${req.params.filename}`;
    const remote = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10_000,
      validateStatus: () => true
    });

    if (remote.status !== 200) {
      return res.status(remote.status).end();
    }

    // Forward the Content-Type from the remote response (e.g. image/png).
    const contentType = remote.headers['content-type'] || 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.send(Buffer.from(remote.data));
  } catch (err) {
    next(axiosErrorToHttpError(err));
  }
});

// ── POST /api/proxy/containers/settings/:id?serverIndex=N ────────────────
// Receives an optional icon file + name from the browser, validates it
// locally (magic bytes check), then forwards the upload as multipart to
// the remote server so the icon is stored there, not on this instance.
router.post(
  '/proxy/containers/settings/:id',
  (req, res, next) => {
    upload.single('icon')(req, res, err => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        err.statusCode = 413;
        err.message = 'File must be under 2MB';
      } else if (!err.statusCode) {
        err.statusCode = 400;
      }
      next(err);
    });
  },
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!CONTAINER_ID_RE.test(id)) {
        if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
        return next(makeError('Invalid container ID', 400));
      }

      const server = await resolveServer(req.query.serverIndex);
      if (!server) {
        if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
        return next(makeError('Server not found', 404));
      }

      // Validate magic bytes before forwarding — same check as the local endpoint.
      if (req.file) {
        const isValidImage = await validateMagicBytes(req.file.path);
        if (!isValidImage) {
          await fs.promises.unlink(req.file.path).catch(() => {});
          return next(makeError('Uploaded file is not a valid image', 400));
        }
      }

      // Build a FormData payload to forward to the remote server.
      // Node 18+ has FormData and Blob as globals.
      const form = new FormData();
      form.append('name', typeof req.body.name === 'string' ? req.body.name : '');

      if (req.file) {
        const fileBuffer = await fs.promises.readFile(req.file.path);
        form.append(
          'icon',
          new Blob([fileBuffer], { type: req.file.mimetype }),
          req.file.originalname || 'icon'
        );
        await fs.promises.unlink(req.file.path).catch(() => {});
      }

      const url = `${serverBaseUrl(server)}/api/containers/settings/${id}`;
      const remote = await axios.post(url, form, {
        timeout: 15_000,   // slightly longer — file transfer involved
        validateStatus: () => true
      });

      res.status(remote.status).json(remote.data);
    } catch (err) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
      next(axiosErrorToHttpError(err));
    }
  }
);

// ── POST /api/proxy/download-icon?serverIndex=N ───────────────────────────
// Forwards an icon-download request (CDN URL + containerId) to the remote
// server so the icon is fetched and stored there, not on this instance.
router.post('/proxy/download-icon', async (req, res, next) => {
  try {
    const server = await resolveServer(req.query.serverIndex);
    if (!server) return next(makeError('Server not found', 404));

    const url = `${serverBaseUrl(server)}/api/download-icon`;
    const remote = await axios.post(url, req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
      validateStatus: () => true
    });

    res.status(remote.status).json(remote.data);
  } catch (err) {
    next(axiosErrorToHttpError(err));
  }
});

module.exports = router;

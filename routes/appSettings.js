'use strict';

const express = require('express');
const dataStore = require('../utils/dataStore');

const router = express.Router();

function makeError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function hasScheme(value) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

function formatHost(hostname) {
  // URL.hostname for IPv6 omits brackets; callers building URLs need them.
  return hostname.includes(':') ? `[${hostname}]` : hostname;
}

function normalizeServerAddress(address) {
  if (!address || typeof address !== 'string') {
    return { error: 'Server address is required' };
  }

  let raw = address.trim();
  if (raw.length === 0) return { error: 'Server address is required' };

  // Accept values with or without scheme; FastDock remote servers are HTTP-only.
  if (!hasScheme(raw)) raw = `http://${raw}`;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: 'Server address is not a valid URL' };
  }

  if (!parsed.hostname) {
    return { error: 'Server address must include a hostname or IP' };
  }

  if (parsed.protocol !== 'http:') {
    return { error: 'Server address must use http:// (HTTPS is not supported)' };
  }

  // Keep only host part (no path/query/hash). Port is stored separately.
  const normalized = `http://${formatHost(parsed.hostname)}`;
  return { address: normalized };
}

function validateServer({ name, address, port }) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return 'Server name is required';
  }
  if (name.length > 100) {
    return 'Server name must be 100 characters or less';
  }
  if (!address || typeof address !== 'string') {
    return 'Server address is required';
  }

  // Accept address with/without scheme; normalize and validate.
  const normalized = normalizeServerAddress(address);
  if (normalized.error) return normalized.error;

  const portNum = parseInt(port, 10);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return 'Port must be an integer between 1 and 65535';
  }
  return null;
}

// GET /api/app-settings
router.get('/app-settings', async (req, res, next) => {
  try {
    const settings = await dataStore.readJSON('appSettings.json');
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// POST /api/app-settings/servers
router.post('/app-settings/servers', async (req, res, next) => {
  try {
    const { name, address, port } = req.body;

    const validationError = validateServer({ name, address, port });
    if (validationError) return next(makeError(validationError, 400));

    const normalizedAddress = normalizeServerAddress(address);
    if (normalizedAddress.error) {
      return next(makeError(normalizedAddress.error, 400));
    }

    let settings = { servers: [] };
    try { settings = await dataStore.readJSON('appSettings.json'); } catch { settings = { servers: [] }; }

    settings.servers.push({
      name: name.trim().substring(0, 100),
      address: normalizedAddress.address,
      port: parseInt(port, 10)
    });

    await dataStore.writeJSON('appSettings.json', settings);
    res.json({ success: true, servers: settings.servers });
  } catch (err) {
    next(err);
  }
});

// PUT /api/app-settings/servers/:index
router.put('/app-settings/servers/:index', async (req, res, next) => {
  try {
    const serverIndex = parseInt(req.params.index, 10);
    const { name, address, port } = req.body;

    if (!Number.isInteger(serverIndex) || serverIndex < 0) {
      return next(makeError('Invalid server index', 400));
    }

    const validationError = validateServer({ name, address, port });
    if (validationError) return next(makeError(validationError, 400));

    const normalizedAddress = normalizeServerAddress(address);
    if (normalizedAddress.error) {
      return next(makeError(normalizedAddress.error, 400));
    }

    let settings = { servers: [] };
    try { settings = await dataStore.readJSON('appSettings.json'); } catch { settings = { servers: [] }; }

    if (serverIndex >= settings.servers.length) {
      return next(makeError('Server not found', 404));
    }

    settings.servers[serverIndex] = {
      name: name.trim().substring(0, 100),
      address: normalizedAddress.address,
      port: parseInt(port, 10)
    };

    await dataStore.writeJSON('appSettings.json', settings);
    res.json({ success: true, servers: settings.servers });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/app-settings/servers/:index
router.delete('/app-settings/servers/:index', async (req, res, next) => {
  try {
    const serverIndex = parseInt(req.params.index, 10);

    if (!Number.isInteger(serverIndex) || serverIndex < 0) {
      return next(makeError('Invalid server index', 400));
    }

    let settings = { servers: [] };
    try { settings = await dataStore.readJSON('appSettings.json'); } catch { settings = { servers: [] }; }

    if (serverIndex >= settings.servers.length) {
      return next(makeError('Server not found', 404));
    }

    settings.servers.splice(serverIndex, 1);
    await dataStore.writeJSON('appSettings.json', settings);
    res.json({ success: true, servers: settings.servers });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

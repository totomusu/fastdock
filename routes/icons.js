'use strict';

const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const Docker = require('dockerode');

const dataStore = require('../utils/dataStore');
const { ASSETS_DIR } = require('../middleware/upload');

const router = express.Router();
const docker = new Docker();

const ALLOWED_ICON_HOSTNAME = 'cdn.jsdelivr.net';
const ICON_NAME_RE = /^[\w-]+$/;

// Validates an icon search name and proxies availability checks to jsdelivr.
// GET /api/search-icon/:name
router.get('/search-icon/:name', async (req, res, next) => {
  try {
    const iconName = req.params.name;

    if (!iconName || iconName.length > 100 || !ICON_NAME_RE.test(iconName)) {
      const err = new Error('Invalid icon name');
      err.statusCode = 400;
      return next(err);
    }

    const normalized = iconName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const formats = ['svg', 'png', 'webp'];
    const variants = ['', '-dark', '-light'];
    const availableIcons = [];

    for (const format of formats) {
      for (const variant of variants) {
        const url = `https://cdn.jsdelivr.net/gh/selfhst/icons/${format}/${normalized}${variant}.${format}`;
        try {
          const response = await axios.head(url);
          if (response.status === 200) {
            availableIcons.push({ url, format, variant: variant || 'default' });
          }
        } catch {
          // Icon variant not found — skip
        }
      }
    }

    if (availableIcons.length === 0) {
      return res.status(404).json({ error: 'No icon found' });
    }

    res.json(availableIcons);
  } catch (err) {
    next(err);
  }
});

// SSRF-safe icon download: only allows URLs from cdn.jsdelivr.net over HTTPS.
// POST /api/download-icon  { url, containerId }
router.post('/download-icon', async (req, res, next) => {
  try {
    const { url, containerId } = req.body;

    if (!url || typeof url !== 'string') {
      const err = new Error('Missing url');
      err.statusCode = 400;
      return next(err);
    }

    // SSRF guard — whitelist host and protocol, block redirects
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      const err = new Error('Invalid URL');
      err.statusCode = 400;
      return next(err);
    }

    if (parsed.hostname !== ALLOWED_ICON_HOSTNAME || parsed.protocol !== 'https:') {
      const err = new Error('URL not allowed');
      err.statusCode = 400;
      return next(err);
    }

    if (!containerId || typeof containerId !== 'string') {
      const err = new Error('Missing containerId');
      err.statusCode = 400;
      return next(err);
    }

    // Verify the container actually exists
    const containers = await docker.listContainers({ all: true });
    const container = containers.find(c => c.Id === containerId);
    if (!container) {
      const err = new Error('Container not found');
      err.statusCode = 404;
      return next(err);
    }

    const containerName = container.Names[0].replace(/^\//, '').replace(/[^a-zA-Z0-9]/g, '-');

    // Fetch icon — no redirects to prevent redirect-based SSRF bypass
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      maxRedirects: 0
    });
    const buffer = Buffer.from(response.data);

    // Derive extension from URL path (already whitelisted to jsdelivr)
    const urlExt = path.extname(parsed.pathname).replace(/^\./, '').toLowerCase();
    const allowedExts = ['svg', 'png', 'webp', 'jpg', 'jpeg', 'gif'];
    const extension = allowedExts.includes(urlExt) ? urlExt : 'png';

    const filename = `${containerId}-${containerName}.${extension}`;

    // Path traversal guard
    const destPath = path.resolve(ASSETS_DIR, filename);
    if (!destPath.startsWith(path.resolve(ASSETS_DIR))) {
      const err = new Error('Invalid file path');
      err.statusCode = 400;
      return next(err);
    }

    await fs.promises.writeFile(destPath, buffer);

    let settings = {};
    try { settings = await dataStore.readJSON('containerSettings.json'); } catch { settings = {}; }

    if (!settings[containerId]) settings[containerId] = {};
    settings[containerId].iconPath = `/assets/${filename}`;
    settings[containerId].originalName = containerName;

    await dataStore.writeJSON('containerSettings.json', settings);

    res.json({ success: true, iconPath: `/assets/${filename}` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

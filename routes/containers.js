'use strict';

const express = require('express');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');

const dataStore = require('../utils/dataStore');
const { upload, validateMagicBytes, ASSETS_DIR } = require('../middleware/upload');

const router = express.Router();
const docker = new Docker();

// Valid Docker container ID: hex string or container name
const CONTAINER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,128}$/;

function makeError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function validateContainerId(id) {
  return CONTAINER_ID_RE.test(id);
}

// GET /api/containers
router.get('/containers', async (req, res, next) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const result = containers.map(c => ({
      id: c.Id,
      name: c.Names[0].replace(/^\//, ''),
      state: c.State,
      status: c.Status
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/containers/:id/start
router.post('/containers/:id/start', async (req, res, next) => {
  try {
    if (!validateContainerId(req.params.id)) {
      return next(makeError('Invalid container ID', 400));
    }
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/containers/:id/stop
router.post('/containers/:id/stop', async (req, res, next) => {
  try {
    if (!validateContainerId(req.params.id)) {
      return next(makeError('Invalid container ID', 400));
    }
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/containers/name/:name
router.get('/containers/name/:name', async (req, res, next) => {
  try {
    const searchName = req.params.name;
    if (!searchName || searchName.length > 128) {
      return next(makeError('Invalid container name', 400));
    }

    const containers = await docker.listContainers({ all: true });
    const container = containers.find(c =>
      c.Names.some(n => n.replace(/^\//, '').includes(searchName))
    );

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    res.json({
      id: container.Id,
      name: container.Names[0].replace(/^\//, ''),
      state: container.State,
      status: container.Status
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/containers/settings
router.get('/containers/settings', async (req, res, next) => {
  try {
    const settings = await dataStore.readJSON('containerSettings.json');
    res.json(settings);
  } catch {
    res.json({});
  }
});

// POST /api/containers/settings/:id  (with optional icon file upload)
router.post(
  '/containers/settings/:id',
  (req, res, next) => {
    upload.single('icon')(req, res, err => {
      if (!err) return next();

      // Multer uses err.code for common cases (e.g., LIMIT_FILE_SIZE).
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
    const containerId = req.params.id;

    if (!validateContainerId(containerId)) {
      // Clean up any uploaded file before rejecting
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
      return next(makeError('Invalid container ID', 400));
    }

    const newName = typeof req.body.name === 'string'
      ? req.body.name.trim().substring(0, 64)
      : '';

    const containers = await docker.listContainers({ all: true });
    const container = containers.find(c => c.Id === containerId);
    if (!container) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
      return next(makeError('Container not found', 404));
    }

    const containerName = container.Names[0].replace(/^\//, '').replace(/[^a-zA-Z0-9]/g, '-');

    let iconPath = null;
    if (req.file) {
      // Post-save magic-byte validation
      const isValidImage = await validateMagicBytes(req.file.path);
      if (!isValidImage) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(makeError('Uploaded file is not a valid image', 400));
      }

      const extension = path.extname(req.file.filename).toLowerCase().replace(/^\./, '') || 'bin';
      const newFilename = `${containerId}-${containerName}.${extension}`;
      const newPath = path.resolve(ASSETS_DIR, newFilename);

      // Path traversal guard
      if (!newPath.startsWith(path.resolve(ASSETS_DIR))) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(makeError('Invalid file path', 400));
      }

      await fs.promises.rename(req.file.path, newPath);
      iconPath = `/assets/${newFilename}`;
    }

    let settings = {};
    try { settings = await dataStore.readJSON('containerSettings.json'); } catch { settings = {}; }

    settings[containerId] = {
      customName: newName,
      iconPath: iconPath || settings[containerId]?.iconPath || null,
      originalName: containerName
    };

    await dataStore.writeJSON('containerSettings.json', settings);
    res.json({ success: true });
  } catch (err) {
    // Clean up any uploaded file on unexpected error
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    next(err);
  }
});

module.exports = router;

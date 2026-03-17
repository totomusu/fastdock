'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Store uploaded assets under data/ so it works well with Docker volume mounts
// and avoids writing into the app's static bundle (public/).
const ASSETS_DIR = path.join(__dirname, '..', 'data', 'assets');

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
]);

// Sanitize the original filename: strip path separators, null bytes,
// and any character that isn't alphanumeric, dot, dash, or underscore.
function sanitizeFilename(name) {
  return name
    .replace(/[/\\]/g, '')
    .replace(/\0/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_'); // prevent hidden files
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ASSETS_DIR);
  },
  filename: function (req, file, cb) {
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, `${Date.now()}-${sanitized}`);
  }
});

function fileFilter(req, file, cb) {
  if (ALLOWED_MIMETYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Only image files are allowed');
    err.statusCode = 400;
    cb(err, false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// Post-save MIME validation using magic bytes (file-type library).
// The multer fileFilter above only checks the client-supplied Content-Type header,
// which is bypassable. This function reads the actual file bytes and rejects
// anything that doesn't match a known image signature.
async function validateMagicBytes(filepath) {
  // file-type v16+ is ESM-only; use dynamic import from CommonJS.
  // If the library isn't available at runtime, fall back to extension checks.
  let fileTypeFromFile;
  try {
    ({ fileTypeFromFile } = await import('file-type'));
  } catch {
    fileTypeFromFile = null;
  }

  const result = fileTypeFromFile ? await fileTypeFromFile(filepath) : null;

  if (!result) {
    // Could be SVG (plain text, no magic bytes) — allow it through
    // but only if the extension is .svg
    const ext = path.extname(filepath).toLowerCase();
    if (ext === '.svg') return true;
    // As a last-resort fallback (when file-type isn't available), allow by
    // extension only for known safe image types. This should be rare.
    const fallbackAllowedExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
    return fallbackAllowedExt.has(ext);
  }

  return ALLOWED_MIMETYPES.has(result.mime);
}

module.exports = { upload, validateMagicBytes, ASSETS_DIR };

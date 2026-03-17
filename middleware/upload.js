'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets');

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
  // file-type v16 ships CommonJS
  const { fileTypeFromFile } = require('file-type');
  const result = await fileTypeFromFile(filepath);

  if (!result) {
    // Could be SVG (plain text, no magic bytes) — allow it through
    // but only if the extension is .svg
    const ext = path.extname(filepath).toLowerCase();
    if (ext === '.svg') return true;
    return false;
  }

  return ALLOWED_MIMETYPES.has(result.mime);
}

module.exports = { upload, validateMagicBytes, ASSETS_DIR };

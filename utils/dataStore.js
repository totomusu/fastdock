'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const DEFAULTS = {
  'containerSettings.json': {},
  'appSettings.json': { servers: [] }
};

// Creates the data/ directory, migrates legacy files from public/ if present,
// and writes safe defaults for any missing files.
async function ensureDataDir() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  for (const filename of Object.keys(DEFAULTS)) {
    const dest = path.join(DATA_DIR, filename);
    const legacy = path.join(__dirname, '..', 'public', filename);

    try {
      await fs.promises.access(dest);
      // File already exists in data/ — nothing to do
    } catch {
      // Not in data/ yet — check legacy location
      try {
        await fs.promises.access(legacy);
        await fs.promises.copyFile(legacy, dest);
        console.log(`[dataStore] Migrated ${filename} from public/ to data/`);
      } catch {
        // Not in either place — write default
        await writeJSON(filename, DEFAULTS[filename]);
        console.log(`[dataStore] Created default ${filename} in data/`);
      }
    }
  }
}

async function readJSON(filename) {
  const filepath = path.join(DATA_DIR, filename);
  const raw = await fs.promises.readFile(filepath, 'utf8');
  return JSON.parse(raw);
}

// Atomic write: write to a temp file then rename, so a crash mid-write
// never leaves a corrupt file behind.
async function writeJSON(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  const tmp = filepath + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.promises.rename(tmp, filepath);
}

module.exports = { ensureDataDir, readJSON, writeJSON, DATA_DIR };

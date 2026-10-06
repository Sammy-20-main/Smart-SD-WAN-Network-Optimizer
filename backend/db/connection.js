import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js';
import { presetTopologies } from '../data/presets.js';
import { createTopology } from './repository.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = process.env.SDWAN_DB || path.join(here, '..', 'data', 'sdwan.db');

/** Opens (and, on first use, creates and seeds) the database. Pass ':memory:' for tests. */
export function openDatabase(file = DEFAULT_DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  seedPresets(db);
  return db;
}

function seedPresets(db) {
  const have = new Set(db.prepare('SELECT slug FROM topologies WHERE is_preset = 1').all().map((r) => r.slug));
  presetTopologies.forEach((p) => {
    if (have.has(p.id)) return;
    createTopology(db, { ...p, slug: p.id, isPreset: true, sourceId: p.defaults.sourceId, destinationId: p.defaults.destinationId, slaLimit: p.defaults.slaLimit });
  });
}

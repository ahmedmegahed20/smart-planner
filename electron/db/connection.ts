import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = process.env.AHMED_KILWA_DATA_DIR || path.join(os.homedir(), '.ahmed-kilwa');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'ahmed-kilwa.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDataDir(): string {
  return process.env.AHMED_KILWA_DATA_DIR || path.join(os.homedir(), '.ahmed-kilwa');
}
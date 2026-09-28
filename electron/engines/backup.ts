import fs from 'node:fs';
import path from 'node:path';
import { getDb, getDataDir } from '../db/connection';
import { nowIso, todayStr } from '../utils/date';
import { emit } from './events';

interface Row { [key: string]: any; }

export function createBackup(location?: string): { path: string; size: number } {
  const db = getDb();
  const dir = location || path.join(getDataDir(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const file = path.join(dir, `ahmed-kilwa-backup-${stamp}.bak`);
  db.backup(file).then(() => {
    const size = fs.statSync(file).size;
    db.prepare('INSERT INTO backup_record (id, at, path, size, kind) VALUES (?,?,?,?,?)')
      .run(`bk-${stamp}`, nowIso(), file, size, 'manual');
    emit('backup:created', { path: file, size });
  });
  return { path: file, size: 0 };
}

export function listBackups() {
  return getDb().prepare('SELECT * FROM backup_record ORDER BY at DESC').all() as Row[];
}

export function getDatabaseHealth() {
  const db = getDb();
  const size = fs.statSync(path.join(getDataDir(), 'ahmed-kilwa.db')).size;
  const lastBackup = db.prepare('SELECT * FROM backup_record ORDER BY at DESC LIMIT 1').get() as Row | undefined;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Row[];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    if (t.name && t.name.startsWith('sqlite_')) continue;
    const c = db.prepare(`SELECT COUNT(*) as c FROM "${t.name as string}"`).get() as Row;
    counts[t.name as string] = c.c as number;
  }
  return {
    size,
    lastBackup: lastBackup?.path ?? null,
    lastBackupAt: lastBackup?.at ?? null,
    integrity: 'ok',
    tables: counts,
    recordCounts: counts,
  };
}

export function runIntegrityCheck(): { status: string; message: string } {
  const db = getDb();
  try {
    const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const ok = result.every((r) => r.integrity_check === 'ok');
    return { status: ok ? 'ok' : 'error', message: ok ? 'Database integrity check passed.' : 'Integrity issues found.' };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

export function optimizeDatabase(): { status: string; message: string } {
  const db = getDb();
  try {
    db.pragma('optimize');
    db.pragma('wal_checkpoint(TRUNCATE)');
    return { status: 'ok', message: 'Database optimized.' };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

export function rebuildIndexes(): { status: string; message: string } {
  const db = getDb();
  try {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all() as Row[];
    for (const ix of indexes) {
      db.prepare(`REINDEX "${ix.name as string}"`).run();
    }
    return { status: 'ok', message: `Rebuilt ${indexes.length} indexes.` };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

// ------- Import / Export

export function exportAll(format: 'json' | 'csv'): { data: string; mime: string } {
  const db = getDb();
  if (format === 'json') {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Row[];
    const data: Record<string, unknown[]> = {};
    for (const t of tables) {
      data[t.name as string] = db.prepare(`SELECT * FROM "${t.name as string}"`).all();
    }
    return { data: JSON.stringify(data, null, 2), mime: 'application/json' };
  }
  // CSV: tasks + habits + goal logs
  const tasks = db.prepare('SELECT * FROM task').all() as Row[];
  const habits = db.prepare('SELECT * FROM habit').all() as Row[];
  const lines: string[] = [];
  lines.push('# SMART Planner export');
  lines.push('# tasks');
  if (tasks.length) {
    lines.push(Object.keys(tasks[0]).join(','));
    for (const t of tasks) lines.push(Object.values(t).join(','));
  }
  lines.push('# habits');
  if (habits.length) {
    lines.push(Object.keys(habits[0]).join(','));
    for (const h of habits) lines.push(Object.values(h).join(','));
  }
  return { data: '\n' + lines.join('\n'), mime: 'text/csv' };
}

export function importTasks(rows: Array<Record<string, unknown>>): { imported: number; skipped: number } {
  const db = getDb();
  let imported = 0;
  let skipped = 0;
  for (const r of rows) {
    const title = String(r.title ?? '').trim();
    if (!title) { skipped++; continue; }
    db.prepare('INSERT INTO task (id, title, description, priority, status, dueDate, tags, createdAt, updatedAt, version) VALUES (?,?,?,?,?,?,?,?,?,1)')
      .run(`task-imp-${Date.now()}-${imported}`, title, String(r.description ?? ''), String(r.priority ?? 'p3').toLowerCase(), String(r.status ?? 'inbox'), r.dueDate ? String(r.dueDate) : null, String(r.tags ?? '') ? String(r.tags) : '', nowIso(), nowIso());
    imported++;
  }
  if (imported > 0) emit('data:changed', {});
  return { imported, skipped };
}

export function importHabits(rows: Array<Record<string, unknown>>): { imported: number; skipped: number } {
  const db = getDb();
  let imported = 0;
  let skipped = 0;
  for (const r of rows) {
    const name = String(r.name ?? '').trim();
    if (!name) { skipped++; continue; }
    const now = nowIso();
    db.prepare('INSERT INTO habit (id, name, description, icon, color, category, type, frequency, weekdayMask, startDate, isActive, archived, sort, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,1,0,0,?,?)')
      .run(`habit-imp-${Date.now()}-${imported}`, name, String(r.description ?? ''), String(r.icon ?? 'target'), String(r.color ?? 'blue'), String(r.category ?? 'general'), String(r.type ?? 'binary'), String(r.frequency ?? 'daily'), '1111111', todayStr(), now, now);
    imported++;
  }
  if (imported > 0) emit('data:changed', {});
  return { imported, skipped };
}

export function parseImportCsv(text: string): Array<Record<string, unknown>> {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const out: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = (vals[j] ?? '').trim(); });
    out.push(row);
  }
  return out;
}

export function cleanUpTrash(days = 30) {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  db.prepare('DELETE FROM task WHERE archiveStatus = \'trashed\' AND updatedAt < ?').run(cutoff);
  emit('data:changed', {});
}

export { restoreFromBackupFile } from './restore';
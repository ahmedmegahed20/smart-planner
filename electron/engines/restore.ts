import fs from 'node:fs';
import path from 'node:path';
import { getDb, getDataDir, closeDb } from '../db/connection';
import { emit } from './events';

export function restoreFromBackupFile(filePath: string): { ok: boolean; message: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, message: 'Backup file does not exist.' };
    }
    closeDb();
    const current = path.join(getDataDir(), 'ahmed-kilwa.db');
    const pre = path.join(getDataDir(), 'ahmed-kilwa.pre-restore.db');
    if (fs.existsSync(pre)) fs.unlinkSync(pre);
    fs.copyFileSync(current, pre);
    fs.copyFileSync(filePath, current);
    getDb();
    emit('data:changed', {});
    return { ok: true, message: 'Restore completed. Application data reloaded.' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
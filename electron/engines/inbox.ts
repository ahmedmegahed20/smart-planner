import { getDb } from '../db/connection';
import { uid, nowIso, todayStr } from '../utils/date';
import { createTask } from './tasks';
import { createHabit } from './habits';
import { createGoal } from './goals';
import { createNote } from './life';
import { emit } from './events';

interface Row { [key: string]: any; }

export function openInbox(id: string): any {
  const db = getDb();
  const item = db.prepare('SELECT * FROM inbox_item WHERE id = ?').get(id) as Row | undefined;
  if (!item) return { ok: false, message: 'Inbox item not found' };

  const kind = item.kind as string;
  const content = item.content as string;
  let result: any = {};

  switch (kind) {
    case 'task':
      result = { ok: true, task: createTask({ title: content }) };
      break;
    case 'habit':
      result = { ok: true, habit: createHabit({ name: content }) };
      break;
    case 'goal':
      result = { ok: true, goal: createGoal({ name: content }) };
      break;
    case 'note':
      result = { ok: true, note: createNote({ title: content }) };
      break;
    case 'idea':
    case 'thought':
    case 'link':
    case 'reminder':
    default:
      result = createTask({ title: content });
      break;
  }
  db.prepare('UPDATE inbox_item SET archived = 1 WHERE id = ?').run(id);
  emit('data:changed', {});
  return { ok: true, ...result };
}

export function addInboxFromClipboard(content: string): any {
  const db = getDb();
  const id = uid('inbox');
  db.prepare('INSERT INTO inbox_item (id, content, kind, metadata, archived, createdAt) VALUES (?,?,?,?,0,?)')
    .run(id, content, 'thought', '', nowIso());
  emit('data:changed', {});
  return { ok: true, id };
}

export function getInboxCount(): number {
  return (getDb().prepare('SELECT COUNT(*) as c FROM inbox_item WHERE archived = 0').get() as Row).c as number;
}
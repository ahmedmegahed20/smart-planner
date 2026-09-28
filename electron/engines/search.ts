import { getDb } from '../db/connection';
import { listTasks } from './tasks';
import { listHabits } from './habits';
import { listGoals } from './goals';
import { listProjects } from './goals';
import { listNotes, listJournalEntries } from './life';
import { listRoutines } from './routines';
import { listAchievements } from './achievements';
import { listClasses } from './university';

interface Row { [key: string]: any; }

export interface SearchResult {
  type: 'task' | 'habit' | 'goal' | 'project' | 'note' | 'journal' | 'routine' | 'achievement' | 'class' | 'event';
  id: string;
  title: string;
  subtitle: string;
  score: number;
}

function scoreText(text: string, q: string): number {
  const t = text.toLowerCase();
  const query = q.toLowerCase();
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  if (t.includes(query)) return 60;
  const words = query.split(' ');
  let hits = 0;
  for (const w of words) {
    if (t.includes(w)) hits++;
  }
  return words.length ? (hits / words.length) * 50 : 0;
}

export function searchAll(query: string, limit = 50): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const results: SearchResult[] = [];
  const db = getDb();

  for (const t of listTasks()) {
    const s = Math.max(scoreText(t.title, q), scoreText(t.description, q));
    if (s > 30) {
      results.push({ type: 'task', id: t.id, title: t.title, subtitle: t.status, score: s });
    }
  }
  for (const h of listHabits()) {
    const s = Math.max(scoreText(h.name, q), scoreText(h.category, q));
    if (s > 30) results.push({ type: 'habit', id: h.id, title: h.name, subtitle: h.category, score: s });
  }
  for (const g of listGoals()) {
    const s = Math.max(scoreText(g.name, q), scoreText(g.description, q));
    if (s > 30) results.push({ type: 'goal', id: g.id, title: g.name, subtitle: g.status, score: s });
  }
  for (const p of listProjects()) {
    const s = Math.max(scoreText(p.name, q), scoreText(p.description, q));
    if (s > 30) results.push({ type: 'project', id: p.id, title: p.name, subtitle: 'project', score: s });
  }
  for (const n of listNotes()) {
    const s = Math.max(scoreText(n.title as string, q), scoreText(n.content as string, q));
    if (s > 30) results.push({ type: 'note', id: n.id as string, title: n.title as string, subtitle: 'note', score: s });
  }
  for (const j of listJournalEntries()) {
    const s = Math.max(scoreText(j.title as string, q), scoreText(j.content as string, q));
    if (s > 30) results.push({ type: 'journal', id: j.id as string, title: j.title as string, subtitle: j.date as string, score: s });
  }
  for (const r of listRoutines()) {
    const s = scoreText(r.name, q);
    if (s > 30) results.push({ type: 'routine', id: r.id, title: r.name, subtitle: 'routine', score: s });
  }
  for (const a of listAchievements()) {
    const s = scoreText(a.title, q);
    if (s > 30) results.push({ type: 'achievement', id: a.id, title: a.title, subtitle: a.category, score: s });
  }
  for (const c of listClasses()) {
    const s = Math.max(scoreText(c.title, q), scoreText(c.course, q));
    if (s > 30) results.push({ type: 'class', id: c.id as string, title: c.title || c.course, subtitle: c.instructor || 'class', score: s });
  }
  const evRows = db.prepare('SELECT * FROM calendar_event').all() as Row[];
  for (const e of evRows) {
    const s = scoreText(e.title as string, q);
    if (s > 30) results.push({ type: 'event', id: e.id as string, title: e.title as string, subtitle: (e.date as string) ?? 'event', score: s });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getDashboardQuery(): Record<string, unknown> {
  const db = getDb();
  const stats = db.prepare('SELECT * FROM user_stats WHERE id = ?').get('stats-1') as Row | undefined;
  return {
    stats,
  };
}
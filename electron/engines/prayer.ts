import { getDb } from '../db/connection';
import { uid, nowIso, todayStr, toBindable } from '../utils/date';
import { emit } from './events';

interface Row {
  [key: string]: any;
}

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYER_ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const METHODS: Record<number, { fajr: number; isha: number; maghribMinutes?: number }> = {
  0: { fajr: 19.5, isha: 17.5 },
  1: { fajr: 15, isha: 15 },
  2: { fajr: 15, isha: 15 },
  3: { fajr: 18, isha: 17 },
  4: { fajr: 19.5, isha: 17 },
  5: { fajr: 19.5, isha: 17.5 },
  9: { fajr: 19.5, isha: 17.5, maghribMinutes: 90 },
  10: { fajr: 15, isha: 15 },
  11: { fajr: 18, isha: 18 },
  12: { fajr: 22, isha: 22 },
  16: { fajr: 18, isha: 18 },
  17: { fajr: 19, isha: 18 },
  18: { fajr: 20, isha: 18 },
};

function methodFor(id: number) {
  return METHODS[id] ?? METHODS[4];
}

function sin(d: number) { return Math.sin(d * RAD); }
function cos(d: number) { return Math.cos(d * RAD); }
function tan(d: number) { return Math.tan(d * RAD); }
function asin(d: number) { return Math.asin(d) * DEG; }
function acos(d: number) { return Math.acos(d) * DEG; }
function fix(a: number, b: number) { return ((a % b) + b) % b; }

function sunDeclAndEq(jd: number): { decl: number; equation: number } {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = q + 1.915 * sin(g) + 0.02 * sin(2 * g);
  const e = 23.439 - 0.00000036 * D;
  const RA = fix(Math.atan2(cos(e) * sin(L), cos(L)) * DEG, 360);
  const decl = asin(sin(e) * sin(L));
  const equation = (q / 15) - (RA / 15);
  return { decl, equation };
}

function prayerTimesForDate(date: string, lat: number, lng: number, tzOffsetHours: number, methodId: number, madhab: number, adjustmentMinutes: number, observedDst: number): Record<PrayerName | 'sunrise' | 'sunset', string> {
  const [Y, M, D] = date.split('-').map(Number);
  const jd = Date.UTC(Y, M - 1, D) / 86400000 + 2440587.5;
  const { equation } = sunDeclAndEq(jd);
  const solarNoon = 12 - (lng / 15) - equation; // solar noon in UTC hours

  const { decl } = sunDeclAndEq(jd + 0.5);
  const cosDecl = cos(decl);
  const cosLat = cos(lat);

  function hourAngle(angle: number): number | null {
    const cosH = (sin(angle) - sin(lat) * sin(decl)) / (cosLat * cosDecl);
    if (cosH > 1 || cosH < -1) return null;
    return acos(cosH);
  }

  function toMinutes(fractionalFraction: number | null): string {
    if (fractionalFraction == null) return '--:--';
    const local = fractionalFraction + tzOffsetHours + adjustmentMinutes / 60;
    const h = Math.floor(((local % 24) + 24) % 24);
    const m = Math.floor(((((local + 24) % 24) - h + 24) % 24 || 0) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const method = methodFor(methodId);

  // Times are computed in "fractional hours since UTC midnight of the local date".
  // Start from solar noon expressed in UTC.
  const sunriseHA = hourAngle(0.833);
  const asrFactor = madhab === 1 ? 2 : 1;
  const asrHA = hourAngle(Math.atan(1 / (asrFactor + tan(Math.abs(lat - decl)))) * DEG);

  // fajr: sun below horizon by fajr angle
  const fajrHA = hourAngle(-method.fajr);
  const ishaHA = method.isha > 0 && method.isha < 30 ? hourAngle(-method.isha) : null;

  // Compute absolute time (UTC hours) for each event
  const noonUTC = 12 - (lng / 15) - equation;
  const fajrUTC = fajrHA != null ? noonUTC - fajrHA / 15 : null;
  const sunriseUTC = sunriseHA != null ? noonUTC - sunriseHA / 15 : null;
  const dhuhrUTC = noonUTC;
  const asrUTC = asrHA != null ? noonUTC + asrHA / 15 : null;
  let maghribUTC = null;
  if (method.maghribMinutes != null) {
    maghribUTC = (sunriseUTC != null ? sunriseUTC : noonUTC) + method.maghribMinutes / 60;
  } else {
    const mHA = hourAngle(0.833);
    maghribUTC = mHA != null ? noonUTC + mHA / 15 : null;
  }
  let ishaUTC = null;
  if (method.isha >= 30) {
    ishaUTC = (maghribUTC != null ? maghribUTC : noonUTC) + method.isha / 60;
  } else {
    ishaUTC = ishaHA != null ? noonUTC + ishaHA / 15 : null;
  }
  const sunsetHA = hourAngle(0.833);
  const sunsetUTC = sunsetHA != null ? noonUTC + sunsetHA / 15 : maghribUTC;

  return {
    fajr: toMinutes(fajrUTC),
    dhuhr: toMinutes(dhuhrUTC + 4 / 60),
    asr: toMinutes(asrUTC),
    maghrib: toMinutes(maghribUTC),
    isha: toMinutes(ishaUTC),
    sunrise: toMinutes(sunriseUTC),
    sunset: toMinutes(sunsetUTC),
  };
}

export function sunTimesForDate(date?: string): { sunrise: string; sunset: string } | null {
  const d = date ?? todayStr();
  const db = getDb();
  try {
    const cached = db.prepare('SELECT data FROM prayer_times_cache WHERE date = ?').get(d) as Row | undefined;
    if (cached) {
      const parsed = JSON.parse(cached.data as string);
      const sunrise = (parsed.sunrise ?? parsed.prayers?.sunrise ?? null) as string | null;
      const sunset = (parsed.sunset ?? parsed.prayers?.sunset ?? null) as string | null;
      if (sunrise && sunset) return { sunrise, sunset };
    }
  } catch { /* fall through to recompute */ }
  const s = getPrayerSettings();
  try {
    const c = prayerTimesForDate(d, s.latitude, s.longitude, timezoneOffsetHours(), s.method, s.madhab, s.adjustment, 0);
    if (c.sunrise && c.sunset) return { sunrise: c.sunrise, sunset: c.sunset };
  } catch { /* no-op */ }
  return null;
}

interface PrayerSettingsRow {
  country: string;
  city: string;
  method: number;
  madhab: number;
  adjustment: number;
  enabled: number;
  trackingEnabled: number;
  gamificationEnabled: number;
  remindBefore: number;
  latitude: number;
  longitude: number;
  timezone: string;
  lastFetchedAt: string | null;
}

export function getPrayerSettings(): PrayerSettingsRow {
  const db = getDb();
  const r = db.prepare('SELECT * FROM prayer_settings WHERE id = ?').get('prayer-settings-1') as Row | undefined;
  return {
    country: r?.country ?? 'SA',
    city: r?.city ?? 'Mecca',
    method: Number(r?.method ?? 4),
    madhab: Number(r?.madhab ?? 0),
    adjustment: Number(r?.adjustment ?? 0),
    enabled: Number(r?.enabled ?? 1),
    trackingEnabled: Number(r?.trackingEnabled ?? 1),
    gamificationEnabled: Number(r?.gamificationEnabled ?? 0),
    remindBefore: Number(r?.remindBefore ?? 15),
    latitude: Number(r?.latitude ?? 21.4225),
    longitude: Number(r?.longitude ?? 39.8262),
    timezone: r?.timezone ?? 'Asia/Riyadh',
    lastFetchedAt: r?.lastFetchedAt ?? null,
  };
}

export function savePrayerSettings(patch: Row) {
  const s = getPrayerSettings();
  const db = getDb();
  const merged = { ...s, ...patch };
  db.prepare(`UPDATE prayer_settings SET country=?, city=?, method=?, madhab=?, adjustment=?, enabled=?, trackingEnabled=?, gamificationEnabled=?, remindBefore=?, latitude=?, longitude=?, timezone=?, updatedAt=? WHERE id='prayer-settings-1'`)
    .run(
      merged.country, merged.city, Number(merged.method), Number(merged.madhab), Number(merged.adjustment),
      Number(merged.enabled), Number(merged.trackingEnabled), Number(merged.gamificationEnabled),
      Number(merged.remindBefore), Number(merged.latitude), Number(merged.longitude), merged.timezone, nowIso()
    );
  emit('data:changed', {});
  return getPrayerSettings();
}

function timezoneOffsetHours(): number {
  // Default to settings timezone; approximate by UTC offset of the current date.
  const n = new Date();
  const asUTC = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  const local = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return (asUTC - local.getTime()) / 3.6e6;
}

export function dailyTimes(date?: string): { date: string; times: Record<PrayerName, string>; settings: PrayerSettingsRow } {
  const d = date ?? todayStr();
  const db = getDb();
  const s = getPrayerSettings();
  const cached = db.prepare('SELECT * FROM prayer_times_cache WHERE date = ?').get(d) as Row | undefined;
  if (cached) {
    const parsed = JSON.parse(cached.data as string);
    const times = (parsed.prayers ?? parsed) as Record<PrayerName, string>;
    return { date: d, times, settings: s };
  }
  const computed = prayerTimesForDate(d, s.latitude, s.longitude, timezoneOffsetHours(), s.method, s.madhab, s.adjustment, 0);
  const times: Record<PrayerName, string> = { fajr: computed.fajr, dhuhr: computed.dhuhr, asr: computed.asr, maghrib: computed.maghrib, isha: computed.isha };
  db.prepare('INSERT OR REPLACE INTO prayer_times_cache (id, date, data) VALUES (?,?,?)')
    .run(`pc-${d}`, d, JSON.stringify({ prayers: times, sunrise: computed.sunrise, sunset: computed.sunset }));
  return { date: d, times, settings: s };
}

export function timesForWeek(): { date: string; times: Record<PrayerName, string> }[] {
  const out: any[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date();
    dt.setDate(dt.getDate() + i);
    const iso = dt.toISOString().slice(0, 10);
    out.push({ date: iso, times: dailyTimes(iso).times });
  }
  return out;
}

export function nextPrayer(now?: Date): { name: PrayerName; time: string; inSeconds: number; times: Record<PrayerName, string> } | null {
  const n = now ?? new Date();
  const iso = n.toISOString().slice(0, 10);
  const { times } = dailyTimes(iso);
  const curSeconds = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
  for (const p of PRAYER_ORDER) {
    const [hh, mm] = String(times[p]).split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) continue;
    const sec = hh * 3600 + mm * 60;
    if (sec > curSeconds) {
      return { name: p, time: times[p], inSeconds: sec - curSeconds, times };
    }
  }
  // all passed today -> next is tomorrow's fajr
  const tomorrow = new Date(n);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const t = dailyTimes(tomorrow.toISOString().slice(0, 10)).times;
  const [hh, mm] = String(t.fajr).split(':').map(Number);
  const sec = hh * 3600 + mm * 60;
  return { name: 'fajr', time: t.fajr, inSeconds: (24 * 3600 - curSeconds) + sec, times };
}

export function todayLog(): Record<PrayerName, boolean> {
  const db = getDb();
  const rows = db.prepare('SELECT prayer, completed FROM prayer_log WHERE date = ?').all(todayStr()) as Row[];
  const m: Record<PrayerName, boolean> = { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false };
  for (const r of rows) {
    (m as any)[r.prayer] = Number(r.completed) === 1;
  }
  return m;
}

export function togglePrayer(prayer: PrayerName, date?: string): Record<PrayerName, boolean> {
  const dt = date ?? todayStr();
  const db = getDb();
  const existing = db.prepare('SELECT * FROM prayer_log WHERE prayer = ? AND date = ?').get(prayer, dt) as Row | undefined;
  if (existing) {
    const next = Number(existing.completed) === 1 ? 0 : 1;
    db.prepare('UPDATE prayer_log SET completed = ?, updatedAt = ? WHERE id = ?').run(next, nowIso(), existing.id);
  } else {
    db.prepare('INSERT INTO prayer_log (id, prayer, date, completed, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
      .run(uid('pray'), prayer, dt, 1, nowIso(), nowIso());
  }
  emit('data:changed', {});
  return todayLog();
}

export function prayerStats(days = 30) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM prayer_log WHERE date >= ? ORDER BY date').all(todayStr()) as Row[];
  const counts: Record<string, { completed: number; total: number }> = {};
  for (const p of PRAYER_ORDER) counts[p] = { completed: 0, total: 0 };
  for (const r of rows) {
    const c = counts[r.prayer] ?? (counts[r.prayer] = { completed: 0, total: 0 });
    c.total++;
    if (Number(r.completed) === 1) c.completed++;
  }
  const completed = rows.filter((r) => Number(r.completed) === 1).length;
  const total = rows.length;
  return { counts, completed, total, rate: total ? Math.round((completed / total) * 100) : 0 };
}

export function formatRemaining(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
// Unit registry + conversion for Value-Based Smart Goals.
//
// Every unit normalizes to {canonical, category, factor} where `factor` is the
// multiplier that converts a value into the category's base unit. Conversion is
// only allowed:
//   - when both units normalize to the same canonical unit, or
//   - when both share a category with a real conversion factor (time / length /
//     volume / mass).
// Anything else (e.g. kilometers -> hours, pages -> liters) is INCOMPATIBLE and
// returns null instead of silently computing a wrong number — the UI shows a
// warning so the user sets an explicit contribution.
//
// The Android shim (mobile/shim.js) mirrors these tables/functions exactly.

export interface UnitDef {
  canonical: string;
  category: 'time' | 'length' | 'volume' | 'mass' | 'count' | 'custom';
  factor: number;
}

const ALIASES: Record<string, UnitDef> = {};

function def(canonical: string, category: UnitDef['category'], factor: number, aliases: string[]) {
  const d: UnitDef = { canonical, category, factor };
  for (const a of aliases) ALIASES[a] = d;
}

// time (base = minutes)
def('minutes', 'time', 1, ['min', 'mins', 'minute', 'minutes', 'min(s)', 'د', 'دقيقة', 'دقائق']);
def('hours', 'time', 60, ['hr', 'hrs', 'hour', 'hours', 'hour(s)', 'h', 'س', 'سا', 'ساعة', 'ساعات']);
def('days', 'time', 1440, ['day', 'days', 'د', 'يوم', 'أيام', 'dy']);
def('seconds', 'time', 1 / 60, ['sec', 'secs', 'second', 'seconds', 'ث', 'ثانية', 'ثواني']);
// length (base = meters)
def('meters', 'length', 1, ['meter', 'meters', 'metre', 'metres', 'متر', 'أمتار', 'm']);
def('kilometers', 'length', 1000, ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'كيلومتر']);
def('centimeters', 'length', 0.01, ['cm', 'centimeter', 'centimeters', 'سنتيمتر']);
def('millimeters', 'length', 0.001, ['mm', 'millimeter', 'millimeters', 'ملليمتر']);
def('miles', 'length', 1609.344, ['mi', 'mile', 'miles', 'ميل']);
def('feet', 'length', 0.3048, ['ft', 'foot', 'feet', 'قدم']);
def('inches', 'length', 0.0254, ['in', 'inch', 'inches', 'بوصة']);
// volume (base = liters)
def('liters', 'volume', 1, ['l', 'litre', 'liter', 'litres', 'liters', 'لتر', 'لترات']);
def('milliliters', 'volume', 0.001, ['ml', 'milliliter', 'milliliters', 'مل']);
def('gallons', 'volume', 3.78541178, ['gal', 'gallon', 'gallons', 'غالون']);
// mass (base = grams)
def('grams', 'mass', 1, ['g', 'gram', 'grams', 'غرام', 'جرام']);
def('kilograms', 'mass', 1000, ['kg', 'kilo', 'kilogram', 'kilograms', 'كيلوغرام', 'كجم']);
def('pounds', 'mass', 453.59237, ['lb', 'lbs', 'pound', 'pounds', 'باوند']);
def('ounces', 'mass', 28.349523, ['oz', 'ounce', 'ounces', 'أونصة']);

// Units that scale 1:1 (one completed item = 1 unit) — the only ones allowed to
// fall back to +1 when no explicit or auto-detectable value exists.
export const COUNT_UNITS = new Set([
  'count', 'counts', 'task', 'tasks', 'item', 'items', 'page', 'pages', 'book', 'books',
  'topic', 'topics', 'word', 'words', 'step', 'steps', 'session', 'sessions', 'chapter',
  'chapters', 'topic', 'money', 'percentage', 'percent', '%',
]);

export function normalizeUnit(raw: string | null | undefined): UnitDef | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (ALIASES[s]) return ALIASES[s];
  if (COUNT_UNITS.has(s)) return { canonical: s, category: 'count', factor: 1 };
  return { canonical: s, category: 'custom', factor: 1 };
}

export function unitCategory(raw: string | null | undefined): UnitDef['category'] | null {
  const u = normalizeUnit(raw);
  return u ? u.category : null;
}

// Returns the converted value, or null when the pair is incompatible.
export function convertValue(value: number, fromRaw: string | null | undefined, toRaw: string | null | undefined): number | null {
  const f = normalizeUnit(fromRaw);
  const t = normalizeUnit(toRaw);
  if (!f || !t) return null;
  if (f.canonical === t.canonical) return value;
  if (f.category !== t.category) return null;
  if (f.category === 'count' || f.category === 'custom') return null;
  return (value * f.factor) / t.factor;
}

export function unitsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  return convertValue(1, a, b) !== null;
}
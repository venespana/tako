// domain/schedule.ts — pure-TS 5-field cron matcher (task 3.3, decision D6)
//
// Supported syntax per field: `*`, lists (`a,b,c`), ranges (`a-b`), steps
// (`*/n`, `a-b/n`). Five fields: minute hour day-of-month month day-of-week;
// day-of-week accepts 0-7 with both 0 and 7 meaning Sunday.
//
// Time semantics (D6): schedules are interpreted in the SERVER'S LOCAL TIME —
// every field is matched against the local wall-clock components of the Date.
// Wall times skipped by a DST transition never fire; ambiguous wall times fire
// once (the first instant). No external dependency: Node-20-safe by design.

/** Thrown when a cron expression cannot be parsed or is out of range. */
export class InvalidCronError extends Error {
  constructor(reason: string) {
    super(`invalid cron expression: ${reason}`);
    this.name = 'InvalidCronError';
  }
}

interface CronField {
  readonly values: ReadonlySet<number>;
  /** True when the field was written as `*` (matters for the dom/dow OR rule). */
  readonly starred: boolean;
}

interface ParsedCron {
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dom: CronField;
  readonly month: CronField;
  readonly dow: CronField;
}

const MAX_SCAN_DAYS = 366 * 5 + 31; // search cap: ~5 years, then the fire is unrepresentable
const MAX_ITERATIONS = 1_000_000; // hard belt against any arithmetic pathology

function parseFieldComponent(raw: string, componentName: string, min: number, max: number): number {
  if (!/^\d+$/.test(raw)) {
    throw new InvalidCronError(`${componentName} "${raw}" is not a number`);
  }

  const value = Number.parseInt(raw, 10);

  if (value < min || value > max) {
    throw new InvalidCronError(`${componentName} ${value} out of range ${min}-${max}`);
  }

  return value;
}

function parseField(raw: string, min: number, max: number, componentName: string): CronField {
  const values = new Set<number>();
  let starred = false;

  raw.split(',').forEach(atom => {
    const parts = atom.split('/');

    if (parts.length > 2) {
      throw new InvalidCronError(`field "${raw}" has more than one step separator`);
    }

    const rangePart = parts[0] ?? '';
    const stepPart = parts[1];

    let lo: number;
    let hi: number;

    if (rangePart === '*') {
      starred = true;
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [loRaw = '', hiRaw = ''] = rangePart.split('-');
      lo = parseFieldComponent(loRaw, componentName, min, max);
      hi = parseFieldComponent(hiRaw, componentName, min, max);

      if (lo > hi) {
        throw new InvalidCronError(`inverted range "${rangePart}" in ${componentName}`);
      }
    } else {
      lo = parseFieldComponent(rangePart, componentName, min, max);
      hi = lo;
    }

    let step = 1;

    if (stepPart !== undefined) {
      step = parseFieldComponent(stepPart, 'step', 1, max);
    }

    Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, index) => lo + index * step).forEach(v =>
      values.add(v)
    );
  });

  if (values.size === 0) {
    throw new InvalidCronError(`field "${raw}" selects no values`);
  }

  return { values, starred };
}

function parseDowField(raw: string): CronField {
  const field = parseField(raw, 0, 7, 'day-of-week');
  // Normalize 7 (Sunday) onto 0 so matching only needs getDay().
  const values = new Set<number>();

  [...field.values].forEach(v => values.add(v === 7 ? 0 : v));

  return { values, starred: field.starred };
}

/** Parse a 5-field cron expression; throws {@link InvalidCronError} on any violation. */
export function parseCronExpr(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new InvalidCronError(`expected 5 fields, got ${fields.length}`);
  }

  const [minuteRaw = '', hourRaw = '', domRaw = '', monthRaw = '', dowRaw = ''] = fields;
  const minute = parseField(minuteRaw, 0, 59, 'minute');
  const hour = parseField(hourRaw, 0, 23, 'hour');
  const dom = parseField(domRaw, 1, 31, 'day-of-month');
  const month = parseField(monthRaw, 1, 12, 'month');
  const dow = parseDowField(dowRaw);
  return { minute, hour, dom, month, dow };
}

/** True when `expr` is a syntactically valid 5-field cron expression. */
export function isValidCronExpr(expr: string): boolean {
  try {
    parseCronExpr(expr);
    return true;
  } catch {
    return false;
  }
}

/** Vixie-cron dom/dow rule: both restricted → EITHER may match; one restricted → it must. */
function dayMatches(cron: ParsedCron, date: Date): boolean {
  const domOk = cron.dom.starred || cron.dom.values.has(date.getDate());
  const dowOk = cron.dow.starred || cron.dow.values.has(date.getDay());

  if (cron.dom.starred && cron.dow.starred) return true;

  if (cron.dom.starred) return dowOk;

  if (cron.dow.starred) return domOk;

  return domOk || dowOk;
}

/** True when `date` (local wall-clock) fires for the 5-field cron `expr`. */
export function matches(expr: string, date: Date): boolean {
  const cron = parseCronExpr(expr);
  return (
    cron.minute.values.has(date.getMinutes()) &&
    cron.hour.values.has(date.getHours()) &&
    cron.month.values.has(date.getMonth() + 1) &&
    dayMatches(cron, date)
  );
}

/**
 * Next fire STRICTLY AFTER `after` (minute resolution, local time), or null
 * when no occurrence exists within the ~5-year scan horizon (e.g. `0 0 31 2 *`).
 */
export function nextAfter(expr: string, after: Date): Date | null {
  const cron = parseCronExpr(expr);
  const t = new Date(after.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);

  let daysScanned = 0;
  let iterations = 0;

  while (true) {
    if (iterations++ > MAX_ITERATIONS || daysScanned > MAX_SCAN_DAYS) return null;

    if (!cron.month.values.has(t.getMonth() + 1)) {
      daysScanned += 31;
      t.setMonth(t.getMonth() + 1, 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }

    if (!dayMatches(cron, t)) {
      daysScanned += 1;
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }

    if (!cron.hour.values.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0, 0, 0);
      continue;
    }

    if (!cron.minute.values.has(t.getMinutes())) {
      t.setMinutes(t.getMinutes() + 1, 0, 0);
      continue;
    }

    return t;
  }
}

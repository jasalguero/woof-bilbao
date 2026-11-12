// Pure date helpers. Dates are ISO strings (YYYY-MM-DD) and all arithmetic is
// done in UTC so time zones and daylight saving never shift a day.

export type IsoDate = string;

/** ISO weekdays the daycare is open: 1 = Monday ... 5 = Friday. */
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;

const DAY_MS = 86_400_000;

export function parseIso(d: IsoDate): number {
  return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
}

export function toIso(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return toIso(parseIso(d) + n * DAY_MS);
}

/** ISO weekday, 1 = Monday ... 7 = Sunday. */
export function isoWeekday(d: IsoDate): number {
  const js = new Date(parseIso(d)).getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

/** Today's date on this computer, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidIso(d: unknown): d is IsoDate {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && toIso(parseIso(d)) === d;
}

/** Keeps Monday-Friday only, sorted and without duplicates. */
export function normaliseWeekdays(days: readonly unknown[]): number[] {
  return [...new Set(days.map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 5)
    .sort((a, b) => a - b);
}

/**
 * The days a booking covers, by the same rules as the `booking_days` view:
 * every date from start to end (inclusive) whose ISO weekday is in
 * `weekdays`, skipping closed days.
 */
export function expandBookingDays(
  start: IsoDate,
  end: IsoDate,
  weekdays: readonly number[],
  closedDays: ReadonlySet<IsoDate> = new Set()
): IsoDate[] {
  if (!isValidIso(start) || !isValidIso(end) || end < start) return [];
  const wanted = new Set(weekdays);
  const days: IsoDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (wanted.has(isoWeekday(d)) && !closedDays.has(d)) days.push(d);
  }
  return days;
}

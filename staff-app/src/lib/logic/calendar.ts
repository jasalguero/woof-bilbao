// Month grid and capacity maths for the calendar screen. Pure functions.
import { addDays, isoWeekday, toIso, type IsoDate } from './dates';

export interface GridDay {
  date: IsoDate;
  /** False for the leading/trailing days that belong to the next/previous month. */
  inMonth: boolean;
}

/** One row per week, Monday to Friday only. */
export type MonthGrid = GridDay[][];

/**
 * The weeks of a month as Monday-Friday rows. `month` is 1-12. A week is
 * included when at least one of its weekdays falls in the month, so a month
 * that starts on a Saturday doesn't get an empty first row.
 */
export function monthGrid(year: number, month: number): MonthGrid {
  const first = toIso(Date.UTC(year, month - 1, 1));
  const last = toIso(Date.UTC(year, month, 0));
  let monday = addDays(first, 1 - isoWeekday(first));
  const weeks: MonthGrid = [];
  while (monday <= last) {
    const week: GridDay[] = [];
    for (let i = 0; i < 5; i++) {
      const date = addDays(monday, i);
      week.push({ date, inMonth: date >= first && date <= last });
    }
    if (week.some((d) => d.inMonth)) weeks.push(week);
    monday = addDays(monday, 7);
  }
  return weeks;
}

/** First and last date shown in a grid (for loading data). */
export function gridRange(grid: MonthGrid): { from: IsoDate; to: IsoDate } {
  return { from: grid[0][0].date, to: grid[grid.length - 1][4].date };
}

export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export interface CapacityRow {
  day: IsoDate | null;
  max_dogs: number;
  closed: boolean;
}

/** Same rule as the SQL function `max_dogs_on`: a dated row wins (0 if closed), else the default row. */
export function maxDogsOn(day: IsoDate, rows: readonly CapacityRow[]): number {
  const own = rows.find((r) => r.day === day);
  if (own) return own.closed ? 0 : own.max_dogs;
  return rows.find((r) => r.day === null)?.max_dogs ?? 0;
}

export type DayLoad = 'closed' | 'free' | 'near' | 'full';

/** "near" from 80 % of the maximum (rounded up), "full" at or over it. */
export function dayLoad(confirmed: number, max: number, closed: boolean): DayLoad {
  if (closed) return 'closed';
  if (confirmed >= max) return 'full';
  if (confirmed > 0 && confirmed >= Math.ceil(max * 0.8)) return 'near';
  return 'free';
}

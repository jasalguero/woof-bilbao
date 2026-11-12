import { describe, expect, it } from 'vitest';
import { dayLoad, gridRange, maxDogsOn, monthGrid, shiftMonth } from './calendar';
import { isoWeekday } from './dates';

describe('monthGrid', () => {
  it('lays December 2026 out as Monday-Friday weeks', () => {
    // 1 Dec 2026 is a Tuesday; 31 Dec is a Thursday.
    const g = monthGrid(2026, 12);
    expect(g).toHaveLength(5);
    expect(g[0].map((d) => d.date)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04']);
    expect(g[0][0].inMonth).toBe(false);
    expect(g[0][1].inMonth).toBe(true);
    expect(g[4].map((d) => d.date)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01']);
    expect(g[4][4].inMonth).toBe(false);
  });

  it('only has weekdays, every row starting on Monday', () => {
    for (let m = 1; m <= 12; m++) {
      for (const week of monthGrid(2027, m)) {
        expect(week.map((d) => isoWeekday(d.date))).toEqual([1, 2, 3, 4, 5]);
      }
    }
  });

  it('skips a first week whose weekdays all belong to the previous month', () => {
    // 1 Aug 2026 is a Saturday: the first row is Mon 3 Aug.
    const g = monthGrid(2026, 8);
    expect(g[0][0].date).toBe('2026-08-03');
    expect(g[0].every((d) => d.inMonth)).toBe(true);
  });

  it('skips a last week that only has weekend days in the month', () => {
    // 31 May 2026 is a Sunday: the last row is the week of 25 May.
    const g = monthGrid(2026, 5);
    expect(g[g.length - 1][0].date).toBe('2026-05-25');
  });

  it('includes every weekday of the month exactly once', () => {
    const days = monthGrid(2028, 2).flat().filter((d) => d.inMonth).map((d) => d.date);
    expect(days).toHaveLength(21); // February 2028 (leap year) has 21 weekdays
    expect(new Set(days).size).toBe(days.length);
    expect(days).toContain('2028-02-29');
  });

  it('gives the loading range', () => {
    expect(gridRange(monthGrid(2026, 12))).toEqual({ from: '2026-11-30', to: '2027-01-01' });
  });
});

describe('shiftMonth', () => {
  it('wraps years', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe('maxDogsOn', () => {
  const rows = [
    { day: null, max_dogs: 12, closed: false },
    { day: '2026-12-08', max_dogs: 12, closed: true },
    { day: '2026-12-09', max_dogs: 6, closed: false }
  ];
  it('uses the default row for ordinary days', () => expect(maxDogsOn('2026-12-01', rows)).toBe(12));
  it('is 0 on closed days', () => expect(maxDogsOn('2026-12-08', rows)).toBe(0));
  it('uses a dated override', () => expect(maxDogsOn('2026-12-09', rows)).toBe(6));
  it('is 0 without any capacity row', () => expect(maxDogsOn('2026-12-01', [])).toBe(0));
});

describe('dayLoad', () => {
  it('classifies days', () => {
    expect(dayLoad(0, 12, true)).toBe('closed');
    expect(dayLoad(3, 12, false)).toBe('free');
    expect(dayLoad(9, 12, false)).toBe('free');
    expect(dayLoad(0, 1, false)).toBe('free');
    expect(dayLoad(1, 2, false)).toBe('free');
    expect(dayLoad(4, 5, false)).toBe('near');
    expect(dayLoad(0, 0, false)).toBe('full');
    expect(dayLoad(10, 12, false)).toBe('near');
    expect(dayLoad(11, 12, false)).toBe('near');
    expect(dayLoad(12, 12, false)).toBe('full');
    expect(dayLoad(13, 12, false)).toBe('full');
  });
});

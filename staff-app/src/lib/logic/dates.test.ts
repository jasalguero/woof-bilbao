import { describe, expect, it } from 'vitest';
import { addDays, expandBookingDays, isoWeekday, isValidIso, normaliseWeekdays, todayIso } from './dates';

describe('date helpers', () => {
  it('knows ISO weekdays', () => {
    expect(isoWeekday('2026-11-30')).toBe(1); // Monday
    expect(isoWeekday('2026-12-06')).toBe(7); // Sunday
  });
  it('adds days across months and DST changes', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('validates ISO dates', () => {
    expect(isValidIso('2026-02-29')).toBe(false);
    expect(isValidIso('2028-02-29')).toBe(true);
    expect(isValidIso('2026-1-1')).toBe(false);
    expect(isValidIso(null)).toBe(false);
  });
  it('formats the local date', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('normalises weekdays', () => {
    expect(normaliseWeekdays([5, '2', 2, 6, 0, 1.5, 'x'])).toEqual([2, 5]);
  });
});

describe('expandBookingDays', () => {
  it('expands the seeded request (Tue/Thu, 1-19 Dec 2026)', () => {
    expect(expandBookingDays('2026-12-01', '2026-12-19', [2, 4])).toEqual([
      '2026-12-01', '2026-12-03', '2026-12-08', '2026-12-10', '2026-12-15', '2026-12-17'
    ]);
  });
  it('skips closed days', () => {
    const closed = new Set(['2026-12-08']);
    expect(expandBookingDays('2026-12-07', '2026-12-11', [1, 2, 3, 4, 5], closed)).toEqual([
      '2026-12-07', '2026-12-09', '2026-12-10', '2026-12-11'
    ]);
  });
  it('includes both ends', () => {
    expect(expandBookingDays('2026-12-07', '2026-12-07', [1])).toEqual(['2026-12-07']);
  });
  it('is empty for weekends only, reversed or invalid ranges', () => {
    expect(expandBookingDays('2026-12-05', '2026-12-06', [1, 2, 3, 4, 5])).toEqual([]);
    expect(expandBookingDays('2026-12-10', '2026-12-01', [1])).toEqual([]);
    expect(expandBookingDays('', '2026-12-01', [1])).toEqual([]);
  });
});

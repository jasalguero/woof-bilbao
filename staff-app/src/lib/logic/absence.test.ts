import { describe, expect, it } from 'vitest';
import { madridWallClock, notifiedInTime } from './absence';

describe('absence notice (24 h before 08:00)', () => {
  it('reads timestamps on Bilbao time', () => {
    expect(madridWallClock('2030-01-07T23:30:00Z')).toBe('2030-01-08 00:30:00');
    expect(madridWallClock('2030-07-01T06:00:00Z')).toBe('2030-07-01 08:00:00');
  });
  it('is in time up to 08:00 the day before, like notice_cutoff()', () => {
    expect(notifiedInTime('2030-01-09', '2030-01-07T10:00:00+01:00')).toBe(true);
    expect(notifiedInTime('2030-01-09', '2030-01-08T08:00:00+01:00')).toBe(true);
    expect(notifiedInTime('2030-01-09', '2030-01-08T08:00:01+01:00')).toBe(false);
    expect(notifiedInTime('2030-07-02', '2030-07-01T06:00:00Z')).toBe(true); // 08:00 summer time
    expect(notifiedInTime('2030-07-02', '2030-07-01T06:30:00Z')).toBe(false);
  });
});

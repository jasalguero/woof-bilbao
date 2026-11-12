import { describe, expect, it } from 'vitest';
import { classifyError } from './errors';
import { needsVaccineCheck } from './vaccines';

describe('classifyError', () => {
  it('reads the capacity trigger error', () => {
    expect(classifyError({ code: 'P0001', hint: 'full_days', message: 'no room on: 2026-12-01, 2026-12-03' })).toEqual({
      kind: 'full_days',
      days: ['2026-12-01', '2026-12-03']
    });
  });
  it('recognises other database errors', () => {
    expect(classifyError({ hint: 'no_days', message: 'booking x has no bookable days' }).kind).toBe('no_days');
    expect(classifyError({ hint: 'already_handled', code: '22023' }).kind).toBe('already_handled');
    expect(classifyError({ code: '23505', message: 'duplicate key' }).kind).toBe('duplicate');
    expect(classifyError({ code: '42501', message: 'denied' }).kind).toBe('forbidden');
    expect(classifyError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(classifyError('boom')).toEqual({ kind: 'other', message: 'boom' });
  });
  it('recognises the attendance errors', () => {
    expect(classifyError({ code: '22023', hint: 'not_booked', message: 'dog x has no confirmed booking today' })).toEqual({
      kind: 'attendance',
      reason: 'not_booked'
    });
    for (const hint of ['closed_day', 'inactive_dog', 'not_checked_in', 'already_checked_out']) {
      expect(classifyError({ code: '22023', hint })).toEqual({ kind: 'attendance', reason: hint });
    }
    expect(classifyError({ code: '22023', hint: 'bad_input', message: 'note is too long' }).kind).toBe('other');
  });
});

describe('needsVaccineCheck', () => {
  const today = '2026-11-12';
  it('flags dogs whose owner did not confirm vaccines', () =>
    expect(needsVaccineCheck({ vaccines_up_to_date: false, vaccines_checked_until: '2027-01-01' }, today)).toBe(true));
  it('flags a checked-until date in the past', () =>
    expect(needsVaccineCheck({ vaccines_up_to_date: true, vaccines_checked_until: '2026-11-11' }, today)).toBe(true));
  it('is quiet otherwise', () => {
    expect(needsVaccineCheck({ vaccines_up_to_date: true, vaccines_checked_until: null }, today)).toBe(false);
    expect(needsVaccineCheck({ vaccines_up_to_date: true, vaccines_checked_until: today }, today)).toBe(false);
  });
});

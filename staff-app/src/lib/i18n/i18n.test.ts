import { describe, expect, it } from 'vitest';
import { dictionaries, en, es } from './dict';
import { formatDate, interpolate, placeholders, translate } from './format';
import { ATTENDANCE_HINTS } from '../logic/errors';

describe('i18n dictionaries', () => {
  const keys = (o: object) => Object.keys(o).sort();

  it('has every key in both languages', () => {
    expect(keys(en)).toEqual(keys(es));
  });

  it('has no empty strings', () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), `${lang}:${k}`).not.toBe('');
    }
  });

  it('uses the same placeholders in both languages', () => {
    for (const k of Object.keys(es) as (keyof typeof es)[]) {
      expect(placeholders(en[k]), k).toEqual(placeholders(es[k]));
    }
  });

  it('has labels for every enum value the UI shows', () => {
    const needed = [
      ...['new', 'accepted', 'declined', 'spam', 'pending', 'confirmed', 'cancelled', 'queued', 'sending', 'sent', 'failed'].map((s) => `status.${s}`),
      ...['s', 'm', 'l'].map((s) => `size.${s}`),
      ...['m', 'f'].map((s) => `sex.${s}`),
      ...[1, 2, 3, 4, 5].map((d) => `wd.${d}`),
      ...ATTENDANCE_HINTS.map((h) => `error.attendance.${h}`),
      'lang.es', 'lang.en'
    ];
    for (const k of needed) expect(es, k).toHaveProperty([k]);
  });
});

describe('interpolate', () => {
  it('fills placeholders', () => {
    expect(interpolate('{n} días', { n: 3 })).toBe('3 días');
    expect(translate('en', 'requests.bookableDays', { n: 6 })).toBe('Bookable days: 6');
    expect(translate('es', 'requests.bookableDays', { n: 6 })).toBe('Días reservables: 6');
  });
  it('leaves unknown placeholders alone', () => {
    expect(interpolate('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
});

describe('formatDate', () => {
  const dt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
  it('shows timestamps in Bilbao time', () => {
    // 23:30 UTC on 5 Jan is 00:30 on 6 Jan in Madrid.
    expect(formatDate('en', '2026-01-05T23:30:00Z', dt)).toBe('6 Jan, 00:30');
    // Summer time: UTC+2.
    expect(formatDate('en', '2026-07-01T08:15:00+00:00', dt)).toBe('1 Jul, 10:15');
  });
  it('shows plain dates as that calendar day', () => {
    expect(formatDate('en', '2026-12-01')).toBe('1 Dec 2026');
    expect(formatDate('es', '2026-12-01', { day: 'numeric', month: 'long' })).toBe('1 de diciembre');
  });
  it('handles empty and invalid values', () => {
    expect(formatDate('es', null)).toBe('–');
    expect(formatDate('es', 'nonsense!')).toBe('nonsense!');
  });
});

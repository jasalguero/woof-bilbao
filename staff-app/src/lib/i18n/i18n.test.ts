import { describe, expect, it } from 'vitest';
import { dictionaries, en, es } from './dict';
import { interpolate, placeholders, translate } from './format';

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
      ...['new', 'accepted', 'declined', 'spam', 'pending', 'confirmed', 'cancelled', 'queued', 'sent', 'failed'].map((s) => `status.${s}`),
      ...['s', 'm', 'l'].map((s) => `size.${s}`),
      ...['m', 'f'].map((s) => `sex.${s}`),
      ...[1, 2, 3, 4, 5].map((d) => `wd.${d}`),
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

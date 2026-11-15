import { describe, expect, it } from 'vitest';
import {
  centsToInput, formatMoney, formatPct, lineTotals, monthRange, packExpiry, parseEuros, parsePct, roundHalfAway
} from './money';

describe('lineTotals (mirrors the charges columns)', () => {
  it('adds VAT to the day price', () => {
    expect(lineTotals(3000, 0, 21)).toEqual({ net: 3000, vat: 630, total: 3630 });
    expect(lineTotals(27000, 0, 21)).toEqual({ net: 27000, vat: 5670, total: 32670 });
  });
  it('applies a discount before VAT and rounds like Postgres', () => {
    expect(lineTotals(3500, 50, 21)).toEqual({ net: 1750, vat: 368, total: 2118 });
    expect(lineTotals(2500, 0, 21)).toEqual({ net: 2500, vat: 525, total: 3025 });
  });
  it('handles credits and zero', () => {
    expect(lineTotals(-613, 0, 0)).toEqual({ net: -613, vat: 0, total: -613 });
    expect(lineTotals(0, 0, 21)).toEqual({ net: 0, vat: 0, total: 0 });
  });
  it('matches the database on half cents (payments_test.sql)', () => {
    expect(lineTotals(50, 0, 21)).toEqual({ net: 50, vat: 11, total: 61 });
    expect(lineTotals(1001, 50, 10)).toEqual({ net: 501, vat: 50, total: 551 });
    expect(lineTotals(1000, 12.35, 21)).toEqual({ net: 877, vat: 184, total: 1061 });
    expect(lineTotals(-50, 0, 21)).toEqual({ net: -50, vat: -11, total: -61 });
  });
  it('rounds halves away from zero', () => {
    expect(roundHalfAway(2.5)).toBe(3);
    expect(roundHalfAway(-2.5)).toBe(-3);
  });
});

describe('formatting', () => {
  it('formats euros per language', () => {
    expect(formatMoney('es', 3630).replace(/\s/g, ' ')).toBe('36,30 €');
    expect(formatMoney('en', 3630)).toBe('€36.30');
    expect(formatMoney('en', -100)).toBe('-€1.00');
    expect(formatMoney('es', null)).toBe('–');
  });
  it('formats percentages', () => {
    expect(formatPct('es', 12.5)).toBe('12,5 %');
    expect(formatPct('en', '21.00')).toBe('21 %');
  });
});

describe('parseEuros', () => {
  it('reads what staff type', () => {
    expect(parseEuros('30')).toBe(3000);
    expect(parseEuros('30,5')).toBe(3050);
    expect(parseEuros(' 36.30 € ')).toBe(3630);
    expect(parseEuros('0')).toBe(0);
  });
  it('refuses nonsense and, unless allowed, negatives', () => {
    expect(parseEuros('')).toBeNull();
    expect(parseEuros('abc')).toBeNull();
    expect(parseEuros('1.234,56')).toBeNull();
    expect(parseEuros('3,456')).toBeNull();
    expect(parseEuros('-5')).toBeNull();
    expect(parseEuros('-5', true)).toBe(-500);
  });
  it('round-trips with centsToInput', () => {
    expect(centsToInput('es', 3630)).toBe('36,30');
    expect(centsToInput('en', -500)).toBe('-5.00');
    expect(parseEuros(centsToInput('es', 27000))).toBe(27000);
  });
});

describe('parsePct', () => {
  it('reads percentages from 0 to 100', () => {
    expect(parsePct('21')).toBe(21);
    expect(parsePct('12,5 %')).toBe(12.5);
    expect(parsePct('101')).toBeNull();
    expect(parsePct('x')).toBeNull();
  });
});

describe('dates', () => {
  it('a pack lasts N months, like sell_pack', () => {
    expect(packExpiry('2030-01-11', 6)).toBe('2030-07-10');
    expect(packExpiry('2026-12-01', 1)).toBe('2026-12-31');
  });
  it('packExpiry at the end of a month (same cases as the database tests)', () => {
    expect(packExpiry('2030-08-31', 6)).toBe('2031-02-28');
    expect(packExpiry('2030-01-31', 1)).toBe('2030-02-28');
    expect(packExpiry('2030-03-01', 1)).toBe('2030-03-31');
    expect(packExpiry('2031-08-31', 6)).toBe('2032-02-29');
    expect(packExpiry('2030-01-30', 1)).toBe('2030-02-28');
    expect(packExpiry('2030-12-31', 2)).toBe('2031-02-28');
  });
  it('monthRange', () => {
    expect(monthRange('2026-02-14')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02-03')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

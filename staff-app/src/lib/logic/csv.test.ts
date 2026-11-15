import { describe, expect, it } from 'vitest';
import { csvAmount, csvCell, toCsv } from './csv';

describe('CSV', () => {
  it('uses the spreadsheet conventions of each language', () => {
    expect(toCsv('es', [['Método', 'Importe'], ['Efectivo', csvAmount('es', 3630)]])).toBe('﻿Método;Importe\r\nEfectivo;36,30\r\n');
    expect(toCsv('en', [['Method', 'Amount'], ['Cash', csvAmount('en', 3630)]])).toBe('﻿Method,Amount\r\nCash,36.30\r\n');
  });
  it('quotes separators, quotes and new lines', () => {
    expect(csvCell('Etxeberria; Ane', ';')).toBe('"Etxeberria; Ane"');
    expect(csvCell('say "hi"', ',')).toBe('"say ""hi"""');
    expect(csvCell('a\nb', ',')).toBe('"a\nb"');
    expect(csvCell(null, ',')).toBe('');
  });
  it('defuses formulas but keeps negative numbers', () => {
    expect(csvCell('=HYPERLINK("x")', ',')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('-6,13', ';')).toBe('-6,13');
    expect(csvCell('@me', ',')).toBe("'@me");
  });
  it('formats amounts', () => {
    expect(csvAmount('es', -613)).toBe('-6,13');
    expect(csvAmount('en', 0)).toBe('0.00');
    expect(csvAmount('en', null)).toBe('');
  });
});

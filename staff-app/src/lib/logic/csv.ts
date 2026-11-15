// CSV export for the monthly report. Spreadsheet-friendly in each language:
// Spanish Excel expects ';' between fields and a decimal comma; English uses
// ',' and a decimal point. A UTF-8 BOM makes Excel read accents correctly.
import type { Lang } from './money';

export type Cell = string | number | null | undefined;

export function separator(lang: Lang): string {
  return lang === 'es' ? ';' : ',';
}

/** Euro cents as a plain number for a spreadsheet: 3630 -> "36,30" / "36.30". */
export function csvAmount(lang: Lang, cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const s = (cents / 100).toFixed(2);
  return lang === 'es' ? s.replace('.', ',') : s;
}

export function csvCell(value: Cell, sep: string): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Cells starting with these could run as formulas when opened in Excel.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(lang: Lang, rows: readonly (readonly Cell[])[]): string {
  const sep = separator(lang);
  return '﻿' + rows.map((r) => r.map((c) => csvCell(c, sep)).join(sep)).join('\r\n') + '\r\n';
}

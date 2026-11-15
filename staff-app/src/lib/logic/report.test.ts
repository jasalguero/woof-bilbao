import { describe, expect, it } from 'vitest';
import { incomeCsv, incomeTotals, owingCsv } from './report';

const income = [
  { method: 'cash', payments: 1, received_cents: 6655, refunds: 1, refunded_cents: 1000, net_cents: 5655 },
  { method: 'bizum', payments: 2, received_cents: 5100, refunds: 0, refunded_cents: 0, net_cents: 5100 }
];
const labels = { month: 'Mes', method: 'Método', payments: 'Pagos', received: 'Cobrado', refunds: 'Devoluciones', refunded: 'Devuelto', net: 'Neto', total: 'Total' };

describe('monthly report', () => {
  it('adds up the income', () => {
    expect(incomeTotals(income)).toEqual({ method: 'total', payments: 3, received_cents: 11755, refunds: 1, refunded_cents: 1000, net_cents: 10755 });
    expect(incomeTotals([]).net_cents).toBe(0);
  });
  it('exports income by method with a total line', () => {
    const csv = incomeCsv('es', '2030-01', income, labels, (m) => (m === 'cash' ? 'Efectivo' : 'Bizum'));
    expect(csv.split('\r\n')).toEqual([
      '﻿Mes;Método;Pagos;Cobrado;Devoluciones;Devuelto;Neto',
      '2030-01;Efectivo;1;66,55;1;10,00;56,55',
      '2030-01;Bizum;2;51,00;0;0,00;51,00',
      '2030-01;Total;3;117,55;1;10,00;107,55',
      ''
    ]);
  });
  it('exports who owes what', () => {
    const csv = owingCsv('en', '2030-01', [
      { full_name: 'Davies, Mark', email: 'mark@example.com', phone: null, balance_cents: 7547, unpaid_days: 1, oldest_unpaid_day: '2030-01-08' }
    ], { month: 'Month', owner: 'Owner', email: 'Email', phone: 'Phone', balance: 'Balance', unpaidDays: 'Unpaid days', since: 'Since' });
    expect(csv).toBe('﻿Month,Owner,Email,Phone,Balance,Unpaid days,Since\r\n2030-01,"Davies, Mark",mark@example.com,,75.47,1,2030-01-08\r\n');
  });
});

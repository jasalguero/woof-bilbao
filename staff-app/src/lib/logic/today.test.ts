import { describe, expect, it } from 'vitest';
import { buildToday, countToday, dayKind, presenceOf, walkInCandidates, type AttendanceRow, type TodayDog } from './today';

function dog(id: string, name: string, extra: Partial<TodayDog> = {}): TodayDog {
  return {
    id, name, size: 'm', photo_path: null, medical_notes: null, vaccines_up_to_date: true,
    vaccines_checked_until: null, active: true, owner: { full_name: 'Ane', phone: null }, ...extra
  };
}
function att(d: TodayDog, inAt: string | null, outAt: string | null = null): AttendanceRow & { dog: TodayDog } {
  return { id: `a-${d.id}`, dog_id: d.id, booking_id: null, checked_in_at: inAt, checked_out_at: outAt, note: null, dog: d };
}

const txuri = dog('1', 'Txuri');
const beltza = dog('2', 'Beltza');
const pepper = dog('3', 'Pepper');
const rocky = dog('4', 'Rocky');
const ana = dog('5', 'Ánade');

describe('dayKind', () => {
  it('knows weekends and closed days', () => {
    expect(dayKind('2026-11-12', [])).toEqual({ kind: 'open', reason: null }); // Thursday
    expect(dayKind('2026-11-14', [])).toEqual({ kind: 'weekend', reason: null }); // Saturday
    expect(dayKind('2026-11-15', [])).toEqual({ kind: 'weekend', reason: null });
    expect(dayKind('2026-12-08', [{ day: '2026-12-08', closed: true, reason: 'Inmaculada' }])).toEqual({
      kind: 'closed', reason: 'Inmaculada'
    });
    // A capacity override that is not a closure keeps the day open.
    expect(dayKind('2026-12-09', [{ day: '2026-12-09', closed: false, reason: null }]).kind).toBe('open');
    expect(dayKind('2026-12-09', [{ day: null, closed: false, reason: null }]).kind).toBe('open');
  });
});

describe('presenceOf', () => {
  it('reads the attendance row', () => {
    expect(presenceOf(null)).toBe('expected');
    expect(presenceOf({ checked_in_at: null, checked_out_at: null })).toBe('expected');
    expect(presenceOf({ checked_in_at: '2026-11-12T08:00:00Z', checked_out_at: null })).toBe('here');
    expect(presenceOf({ checked_in_at: '2026-11-12T08:00:00Z', checked_out_at: '2026-11-12T17:00:00Z' })).toBe('gone');
  });
});

describe('buildToday', () => {
  const entries = buildToday(
    [{ dog: txuri }, { dog: beltza }, { dog: pepper }, { dog: txuri }],
    [att(beltza, '2026-11-12T08:00:00Z'), att(pepper, '2026-11-12T08:00:00Z', '2026-11-12T13:00:00Z'), att(rocky, '2026-11-12T09:00:00Z')]
  );

  it('lists each dog once, booked ones plus walk-ins, sorted by name', () => {
    expect(entries.map((e) => [e.dog.name, e.booked, e.presence])).toEqual([
      ['Beltza', true, 'here'],
      ['Pepper', true, 'gone'],
      ['Rocky', false, 'here'],
      ['Txuri', true, 'expected']
    ]);
  });

  it('keeps the attendance row without the embedded dog', () => {
    const b = entries.find((e) => e.dog.id === '2')!;
    expect(b.attendance).toEqual({ id: 'a-2', dog_id: '2', booking_id: null, checked_in_at: '2026-11-12T08:00:00Z', checked_out_at: null, note: null });
    expect(entries.find((e) => e.dog.id === '1')!.attendance).toBeNull();
  });

  it('counts expected, still to come, here, gone and walk-ins', () => {
    expect(countToday(entries)).toEqual({ expected: 3, toCome: 1, here: 2, gone: 1, walkIns: 1 });
    expect(countToday([])).toEqual({ expected: 0, toCome: 0, here: 0, gone: 0, walkIns: 0 });
  });

  it('does not move a dog when it checks in (stable order)', () => {
    const before = buildToday([{ dog: txuri }, { dog: beltza }], []).map((e) => e.dog.name);
    const after = buildToday([{ dog: txuri }, { dog: beltza }], [att(txuri, '2026-11-12T08:00:00Z')]).map((e) => e.dog.name);
    expect(after).toEqual(before);
  });
});

describe('walkInCandidates', () => {
  const entries = buildToday([{ dog: txuri }], []);
  it('offers active dogs not already on the list, accent-insensitive search', () => {
    const dogs = [txuri, beltza, { ...rocky, active: false }, ana];
    expect(walkInCandidates(dogs, entries).map((d) => d.name)).toEqual(['Ánade', 'Beltza']);
    expect(walkInCandidates(dogs, entries, 'ana').map((d) => d.name)).toEqual(['Ánade']);
    expect(walkInCandidates(dogs, entries, 'zzz')).toEqual([]);
  });
});

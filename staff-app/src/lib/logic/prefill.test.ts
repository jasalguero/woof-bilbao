import { describe, expect, it } from 'vitest';
import { bookingFromPayload, dogFromPayload, matchDogByName, ownerFromPayload, parsePayload } from './prefill';

// Same shape as the seeded request and submit-booking's output.
const seeded = {
  lang: 'es',
  owner: { name: 'Leire Gómez', email: 'Leire@Example.com', phone: '+34 600 555 666' },
  dog: {
    name: 'Kuki', breed: null, age: '2 años', size: 's', sex: 'm', neutered: false, vaccinated: true,
    medical: null, preferences: 'Un poco tímido al principio'
  },
  dates: { from: '2026-12-01', to: '2026-12-19', weekdays: [2, 4] },
  notes: null,
  consent: true,
  submitted_at: '2026-11-10T09:00:00.000Z'
};

describe('request prefill', () => {
  const p = parsePayload(seeded);

  it('maps the owner', () => {
    expect(ownerFromPayload(p, '2026-11-11T00:00:00Z')).toEqual({
      full_name: 'Leire Gómez',
      email: 'leire@example.com',
      phone: '+34 600 555 666',
      language: 'es',
      consent_at: '2026-11-10T09:00:00.000Z',
      notes: null
    });
  });

  it('maps the dog: vaccines from "vaccinated", behaviour notes from preferences', () => {
    expect(dogFromPayload(p)).toEqual({
      name: 'Kuki',
      breed: null,
      age_text: '2 años',
      size: 's',
      sex: 'm',
      neutered: false,
      vaccines_up_to_date: true,
      medical_notes: null,
      behaviour_notes: 'Un poco tímido al principio'
    });
  });

  it('maps the dates', () => {
    expect(bookingFromPayload(p)).toEqual({ start_date: '2026-12-01', end_date: '2026-12-19', weekdays: [2, 4] });
  });

  it('uses the request time for consent when the payload has none, and no consent without the box', () => {
    const noTime = parsePayload({ ...seeded, submitted_at: undefined });
    expect(ownerFromPayload(noTime, '2026-11-11T00:00:00Z').consent_at).toBe('2026-11-11T00:00:00Z');
    const noConsent = parsePayload({ ...seeded, consent: false });
    expect(ownerFromPayload(noConsent).consent_at).toBeNull();
  });

  it('survives junk and missing fields', () => {
    const j = parsePayload({ lang: 'fr', dog: { size: 'xl', sex: 'x', vaccinated: 'yes', medical: '  ' }, dates: { from: 'soon', weekdays: [6, 3, 3] } });
    expect(j.lang).toBe('es');
    expect(dogFromPayload(j)).toMatchObject({ size: null, sex: null, vaccines_up_to_date: false, medical_notes: null });
    expect(bookingFromPayload(j)).toEqual({ start_date: '', end_date: '', weekdays: [3] });
    expect(parsePayload(null).owner).toEqual({ name: '', email: '', phone: '' });
    expect(bookingFromPayload(parsePayload({})).weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps English as the owner language', () => {
    expect(ownerFromPayload(parsePayload({ ...seeded, lang: 'en' })).language).toBe('en');
  });
});

describe('matchDogByName', () => {
  const dogs = [{ id: '1', name: 'Txuri' }, { id: '2', name: 'Kuki ' }];
  it('matches case-insensitively and ignoring spaces', () => expect(matchDogByName(dogs, 'kuki')?.id).toBe('2'));
  it('returns null without a match', () => {
    expect(matchDogByName(dogs, 'Beltza')).toBeNull();
    expect(matchDogByName(dogs, ' ')).toBeNull();
  });
});

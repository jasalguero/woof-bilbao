// Turns a booking request's form payload (see supabase/functions/submit-booking)
// into prefilled owner, dog and booking fields. Pure and defensive: payloads
// are stored JSON and old rows may lack fields.
import { isValidIso, normaliseWeekdays, type IsoDate } from './dates';

export type Lang = 'es' | 'en';
export type DogSize = 's' | 'm' | 'l';
export type DogSex = 'm' | 'f';

export interface RequestPayload {
  lang: Lang;
  owner: { name: string; email: string; phone: string };
  dog: {
    name: string;
    breed: string | null;
    age: string | null;
    size: DogSize | null;
    sex: DogSex | null;
    neutered: boolean;
    vaccinated: boolean;
    medical: string | null;
    preferences: string | null;
  };
  dates: { from: IsoDate | null; to: IsoDate | null; weekdays: number[] };
  notes: string | null;
  consent: boolean;
  submittedAt: string | null;
}

export interface OwnerDraft {
  full_name: string;
  email: string;
  phone: string | null;
  language: Lang;
  consent_at: string | null;
  notes: string | null;
}

export interface DogDraft {
  name: string;
  breed: string | null;
  age_text: string | null;
  size: DogSize | null;
  sex: DogSex | null;
  neutered: boolean;
  vaccines_up_to_date: boolean;
  medical_notes: string | null;
  behaviour_notes: string | null;
}

export interface BookingDraft {
  start_date: IsoDate;
  end_date: IsoDate;
  weekdays: number[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
};
const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | null =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : null;

export function parsePayload(raw: unknown): RequestPayload {
  const p = obj(raw);
  const owner = obj(p.owner);
  const dog = obj(p.dog);
  const dates = obj(p.dates);
  return {
    lang: p.lang === 'en' ? 'en' : 'es',
    owner: {
      name: text(owner.name) ?? '',
      email: (text(owner.email) ?? '').toLowerCase(),
      phone: text(owner.phone) ?? ''
    },
    dog: {
      name: text(dog.name) ?? '',
      breed: text(dog.breed),
      age: text(dog.age),
      size: oneOf(dog.size, ['s', 'm', 'l'] as const),
      sex: oneOf(dog.sex, ['m', 'f'] as const),
      neutered: dog.neutered === true,
      vaccinated: dog.vaccinated === true,
      medical: text(dog.medical),
      preferences: text(dog.preferences)
    },
    dates: {
      from: isValidIso(dates.from) ? dates.from : null,
      to: isValidIso(dates.to) ? dates.to : null,
      weekdays: Array.isArray(dates.weekdays) ? normaliseWeekdays(dates.weekdays) : []
    },
    notes: text(p.notes),
    consent: p.consent === true,
    submittedAt: text(p.submitted_at)
  };
}

/** `requestCreatedAt` is used as the consent time when the form had consent ticked. */
export function ownerFromPayload(p: RequestPayload, requestCreatedAt: string | null = null): OwnerDraft {
  return {
    full_name: p.owner.name,
    email: p.owner.email,
    phone: p.owner.phone || null,
    language: p.lang,
    consent_at: p.consent ? (p.submittedAt ?? requestCreatedAt) : null,
    notes: null
  };
}

export function dogFromPayload(p: RequestPayload): DogDraft {
  return {
    name: p.dog.name,
    breed: p.dog.breed,
    age_text: p.dog.age,
    size: p.dog.size,
    sex: p.dog.sex,
    neutered: p.dog.neutered,
    vaccines_up_to_date: p.dog.vaccinated,
    medical_notes: p.dog.medical,
    behaviour_notes: p.dog.preferences
  };
}

export function bookingFromPayload(p: RequestPayload): BookingDraft {
  return {
    start_date: p.dates.from ?? '',
    end_date: p.dates.to ?? p.dates.from ?? '',
    weekdays: p.dates.weekdays.length ? p.dates.weekdays : [1, 2, 3, 4, 5]
  };
}

/** Picks the owner's dog that matches the requested name, if any. */
export function matchDogByName<T extends { name: string }>(dogs: readonly T[], name: string): T | null {
  const want = name.trim().toLocaleLowerCase();
  if (!want) return null;
  return dogs.find((d) => d.name.trim().toLocaleLowerCase() === want) ?? null;
}

export interface AcceptTarget {
  /** An existing dog, or null when a new dog is created. */
  dogId: string | null;
  /** The existing owner of a new dog, or null when a new owner is created too. */
  ownerId: string | null;
  newOwner: OwnerDraft | null;
  newDog: DogDraft | null;
}

const clean = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

/**
 * What accept_booking_request should book: an existing dog, or a new dog for
 * an existing or new owner (created in the same transaction). Returns null
 * when the choice is incomplete.
 */
export function acceptTarget(choice: {
  ownerId: string | null;
  newOwner: OwnerDraft | null;
  dogId: string | null;
  newDog: DogDraft | null;
}): AcceptTarget | null {
  if (choice.dogId) {
    return { dogId: choice.dogId, ownerId: null, newOwner: null, newDog: null };
  }
  if (!choice.newDog || !clean(choice.newDog.name)) return null;
  const newDog: DogDraft = {
    ...choice.newDog,
    name: clean(choice.newDog.name)!,
    breed: clean(choice.newDog.breed),
    age_text: clean(choice.newDog.age_text),
    medical_notes: clean(choice.newDog.medical_notes),
    behaviour_notes: clean(choice.newDog.behaviour_notes)
  };
  if (choice.ownerId) return { dogId: null, ownerId: choice.ownerId, newOwner: null, newDog };
  const o = choice.newOwner;
  if (!o || !clean(o.full_name) || !clean(o.email)) return null;
  return {
    dogId: null,
    ownerId: null,
    newOwner: {
      ...o,
      full_name: clean(o.full_name)!,
      email: clean(o.email)!.toLowerCase(),
      phone: clean(o.phone),
      notes: clean(o.notes)
    },
    newDog
  };
}

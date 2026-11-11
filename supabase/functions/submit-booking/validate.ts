// Validation for the public booking form. Pure functions, no I/O, so they can
// be unit tested with `deno test`.

export type Lang = "es" | "en";

export interface BookingRequest {
  lang: Lang;
  owner: { name: string; email: string; phone: string };
  dog: {
    name: string;
    breed: string | null;
    age: string;
    size: "s" | "m" | "l";
    sex: "m" | "f" | null;
    neutered: boolean;
    vaccinated: boolean;
    medical: string | null;
    preferences: string | null;
  };
  dates: { from: string; to: string; weekdays: number[] };
  notes: string | null;
  consent: true;
}

export type ValidationResult =
  | { ok: true; value: BookingRequest }
  | { ok: false; errors: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS_AHEAD = 366;
const MAX_RANGE_DAYS = 366;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function bool(v: unknown): boolean {
  return v === true || v === "on" || v === "true";
}

function toDay(s: string): number | null {
  if (!DATE.test(s)) return null;
  const t = Date.parse(s + "T00:00:00Z");
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return null;
  return t / 864e5;
}

/** `today` is an ISO date (YYYY-MM-DD), passed in so tests are deterministic. */
export function validate(input: unknown, today: string): ValidationResult {
  const errors: string[] = [];
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const name = str(b.name, 120);
  const email = str(b.email, 200);
  const phone = str(b.phone, 40);
  const dogname = str(b.dogname, 80);
  const age = str(b.age, 40);
  const size = str(b.size, 1);
  const sex = str(b.sex, 1);
  const from = str(b.from, 10);
  const to = str(b.to, 10);

  if (!name) errors.push("name");
  if (!email || !EMAIL.test(email)) errors.push("email");
  if (!phone || phone.replace(/\D/g, "").length < 6) errors.push("phone");
  if (!dogname) errors.push("dogname");
  if (!age) errors.push("age");
  if (size !== "s" && size !== "m" && size !== "l") errors.push("size");
  if (sex !== null && sex !== "m" && sex !== "f") errors.push("sex");
  if (!bool(b.vacc)) errors.push("vacc");
  if (!bool(b.consent)) errors.push("consent");

  const weekdays = Array.isArray(b.weekdays)
    ? [...new Set(b.weekdays.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 5).sort((x, y) => x - y)
    : [];
  if (weekdays.length === 0) errors.push("weekdays");

  const t0 = toDay(today);
  const f = from ? toDay(from) : null;
  const t = to ? toDay(to) : null;
  if (f === null || t0 === null || f < t0 || f > t0 + MAX_DAYS_AHEAD) errors.push("from");
  if (t === null || (f !== null && (t < f || t - f > MAX_RANGE_DAYS))) errors.push("to");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      lang: b.lang === "en" ? "en" : "es",
      owner: { name: name!, email: email!.toLowerCase(), phone: phone! },
      dog: {
        name: dogname!,
        breed: str(b.breed, 80),
        age: age!,
        size: size as "s" | "m" | "l",
        sex: sex as "m" | "f" | null,
        neutered: bool(b.neutered),
        vaccinated: true,
        medical: str(b.med, 2000),
        preferences: str(b.pref, 2000),
      },
      dates: { from: from!, to: to!, weekdays },
      notes: str(b.notes, 2000),
      consent: true,
    },
  };
}

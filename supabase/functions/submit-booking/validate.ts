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
const MAX_EMAIL = 200;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

// Exact match on the raw value: no trimming, no truncation.
function oneOf<T extends string>(v: unknown, options: readonly T[]): T | null {
  return typeof v === "string" && (options as readonly string[]).includes(v) ? v as T : null;
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

/** ISO weekday (1 = Monday ... 7 = Sunday) of a day number from toDay(). */
function isoDow(day: number): number {
  return ((day + 3) % 7 + 7) % 7 + 1; // 1970-01-01 (day 0) was a Thursday
}

/** True if the inclusive day range [from, to] contains one of the weekdays. */
function rangeHasWeekday(from: number, to: number, weekdays: number[]): boolean {
  for (let d = from; d <= to && d < from + 7; d++) {
    if (weekdays.includes(isoDow(d))) return true;
  }
  return false;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Returns the address if it is a well-formed IPv4 or IPv6 address, else null. */
export function cleanIp(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s || s.length > 45) return null;
  if (IPV4.test(s)) return s;
  if (!s.includes(":") || !/^[0-9a-fA-F:.]+$/.test(s)) return null;
  try {
    new URL(`http://[${s}]/`); // throws on malformed IPv6
    return s;
  } catch {
    return null;
  }
}

/** `today` is an ISO date (YYYY-MM-DD), passed in so tests are deterministic. */
export function validate(input: unknown, today: string): ValidationResult {
  const errors: string[] = [];
  const b = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;

  const name = str(b.name, 120);
  const rawEmail = typeof b.email === "string" ? b.email.trim() : "";
  const email = rawEmail && rawEmail.length <= MAX_EMAIL ? rawEmail : null;
  const phone = str(b.phone, 40);
  const dogname = str(b.dogname, 80);
  const age = str(b.age, 40);
  const size = oneOf(b.size, ["s", "m", "l"] as const);
  const sexOk = b.sex === undefined || b.sex === null || b.sex === "" || oneOf(b.sex, ["m", "f"] as const) !== null;
  const sex = oneOf(b.sex, ["m", "f"] as const);
  // Dates must already be YYYY-MM-DD: no trimming or cutting to length first.
  const from = typeof b.from === "string" && DATE.test(b.from) ? b.from : null;
  const to = typeof b.to === "string" && DATE.test(b.to) ? b.to : null;

  if (!name) errors.push("name");
  if (!email || !EMAIL.test(email)) errors.push("email");
  if (!phone || phone.replace(/\D/g, "").length < 6) errors.push("phone");
  if (!dogname) errors.push("dogname");
  if (!age) errors.push("age");
  if (!size) errors.push("size");
  if (!sexOk) errors.push("sex");
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
  if (
    weekdays.length > 0 && !errors.includes("from") && !errors.includes("to") &&
    !rangeHasWeekday(f!, t!, weekdays)
  ) errors.push("weekdays");

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
        size: size!,
        sex,
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

// Whether an absence was notified in time, by the database's rule
// (notice_cutoff): before 08:00 Bilbao time on the day before.
import { addDays, TIME_ZONE, type IsoDate } from './dates';

const madridClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

/** A timestamp as "YYYY-MM-DD HH:MM:SS" on Bilbao's wall clock. */
export function madridWallClock(iso: string): string {
  const parts = Object.fromEntries(madridClock.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function notifiedInTime(day: IsoDate, notifiedAt: string): boolean {
  return madridWallClock(notifiedAt) <= `${addDays(day, -1)} 08:00:00`;
}

/** The value for a datetime-local input showing now on this computer. */
export function localNowInput(now: Date = new Date()): string {
  const off = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - off).toISOString().slice(0, 16);
}

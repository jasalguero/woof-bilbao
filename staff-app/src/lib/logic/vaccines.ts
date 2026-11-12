import type { IsoDate } from './dates';

/**
 * Soft reminder only (vaccines never block a booking): true when the owner
 * didn't confirm vaccines, or the date staff noted has passed.
 */
export function needsVaccineCheck(
  dog: { vaccines_up_to_date: boolean; vaccines_checked_until: IsoDate | null },
  today: IsoDate
): boolean {
  if (!dog.vaccines_up_to_date) return true;
  return dog.vaccines_checked_until !== null && dog.vaccines_checked_until < today;
}

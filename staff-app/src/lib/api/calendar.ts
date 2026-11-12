import { supabase } from '../supabase';
import type { BookingStatus, Capacity, Dog, Occupancy } from '../types';
import { must } from './util';

export async function getOccupancy(from: string, to: string): Promise<Occupancy[]> {
  return must(await supabase.from('daily_occupancy').select('*').gte('day', from).lte('day', to));
}

/** The default row (day = null) plus any dated rows (closed days, overrides) in range. */
export async function getCapacity(from: string, to: string): Promise<Capacity[]> {
  return must(
    await supabase.from('capacity').select('*').or(`day.is.null,and(day.gte.${from},day.lte.${to})`)
  );
}

export type DayDog = {
  booking_id: string;
  status: BookingStatus;
  dog: Pick<Dog, 'id' | 'name' | 'size' | 'vaccines_up_to_date' | 'vaccines_checked_until'> & {
    owner: { full_name: string };
  };
};

export async function getDayDogs(day: string): Promise<DayDog[]> {
  const rows = must(
    await supabase
      .from('booking_days')
      .select('booking_id, status, dog:dogs(id, name, size, vaccines_up_to_date, vaccines_checked_until, owner:owners(full_name))')
      .eq('day', day)
  ) as unknown as DayDog[];
  // One line per dog: a dog with two bookings on the same day shows once (confirmed wins).
  const byDog = new Map<string, DayDog>();
  for (const r of rows) {
    const seen = byDog.get(r.dog.id);
    if (!seen || (seen.status !== 'confirmed' && r.status === 'confirmed')) byDog.set(r.dog.id, r);
  }
  return [...byDog.values()].sort(
    (a, b) => (a.status === b.status ? a.dog.name.localeCompare(b.dog.name) : a.status === 'confirmed' ? -1 : 1)
  );
}

import { supabase } from '../supabase';
import type { Booking } from '../types';
import { must } from './util';

/** confirm_booking RPC; throws the capacity error (hint 'full_days') when full. */
export async function confirmBooking(id: string, allowOverbook = false): Promise<Booking> {
  return must(await supabase.rpc('confirm_booking', { p_booking_id: id, p_allow_overbook: allowOverbook }));
}

export async function cancelBooking(id: string): Promise<Booking> {
  return must(await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id).select().single());
}

/** The capacity trigger refuses new days that are full for a confirmed booking. */
export async function updateBookingDates(id: string, start: string, end: string, weekdays: number[]): Promise<Booking> {
  return must(
    await supabase
      .from('bookings')
      .update({ start_date: start, end_date: end, weekdays })
      .eq('id', id)
      .select()
      .single()
  );
}

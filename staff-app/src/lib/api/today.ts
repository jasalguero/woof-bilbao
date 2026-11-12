import { supabase } from '../supabase';
import type { Attendance } from '../types';
import type { AttendanceRow, TodayDog } from '../logic/today';
import { must } from './util';

const DOG = 'id, name, size, photo_path, medical_notes, vaccines_up_to_date, vaccines_checked_until, active, owner:owners(full_name, phone)';

export interface TodayData {
  booked: { booking_id: string; dog: TodayDog }[];
  attendance: (AttendanceRow & { dog: TodayDog })[];
  capacity: { day: string | null; closed: boolean; reason: string | null }[];
}

/** Confirmed dogs for the day, its attendance rows (walk-ins included) and any closure. */
export async function getToday(day: string): Promise<TodayData> {
  const [booked, attendance, capacity] = await Promise.all([
    supabase.from('booking_days').select(`booking_id, dog:dogs(${DOG})`).eq('day', day).eq('status', 'confirmed'),
    supabase
      .from('attendance')
      .select(`id, dog_id, booking_id, checked_in_at, checked_out_at, note, dog:dogs(${DOG})`)
      .eq('day', day),
    supabase.from('capacity').select('day, closed, reason').eq('day', day)
  ]);
  return {
    booked: must(booked) as unknown as TodayData['booked'],
    attendance: must(attendance) as unknown as TodayData['attendance'],
    capacity: must(capacity)
  };
}

// The RPCs always use today's date in Bilbao, decided by the database.

export async function checkIn(dogId: string, note?: string, walkIn = false): Promise<Attendance> {
  return must(await supabase.rpc('check_in', { p_dog_id: dogId, p_note: note || undefined, p_walk_in: walkIn }));
}

export async function checkOut(dogId: string, note?: string): Promise<Attendance> {
  return must(await supabase.rpc('check_out', { p_dog_id: dogId, p_note: note || undefined }));
}

export async function undoCheckIn(dogId: string): Promise<void> {
  const { error } = await supabase.rpc('undo_check_in', { p_dog_id: dogId });
  if (error) throw error;
}

export async function undoCheckOut(dogId: string): Promise<Attendance> {
  return must(await supabase.rpc('undo_check_out', { p_dog_id: dogId }));
}

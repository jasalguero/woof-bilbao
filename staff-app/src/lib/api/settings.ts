import { supabase } from '../supabase';
import type { Capacity, Staff, StaffRole } from '../types';
import { must } from './util';

export async function getDefaultMaxDogs(): Promise<number> {
  const row = must(await supabase.from('capacity').select('max_dogs').is('day', null).single());
  return row.max_dogs;
}

export async function setDefaultMaxDogs(n: number): Promise<void> {
  const rows = must(await supabase.from('capacity').update({ max_dogs: n }).is('day', null).select());
  if (rows.length === 0) throw { code: '42501', message: 'not allowed' };
}

export async function listClosedDays(): Promise<Capacity[]> {
  return must(await supabase.from('capacity').select('*').eq('closed', true).order('day'));
}

/** Closes a day (replacing any capacity override for that date). */
export async function addClosedDay(day: string, reason: string | null): Promise<void> {
  must(
    await supabase
      .from('capacity')
      .upsert({ day, max_dogs: 0, closed: true, reason }, { onConflict: 'day' })
  );
}

export async function removeClosedDay(id: number): Promise<void> {
  must(await supabase.from('capacity').delete().eq('id', id));
}

export async function listStaff(): Promise<Staff[]> {
  return must(await supabase.from('staff').select('*').order('full_name'));
}

export async function setStaffRole(userId: string, role: StaffRole): Promise<void> {
  const rows = must(await supabase.from('staff').update({ role }).eq('user_id', userId).select());
  if (rows.length === 0) throw { code: '42501', message: 'not allowed' };
}

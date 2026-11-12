import { supabase } from '../supabase';
import type { Lang, Staff } from '../types';
import { must } from './util';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** The staff row for this login, or null when the user is not staff. */
export async function getStaff(userId: string): Promise<Staff | null> {
  const { data, error } = await supabase.from('staff').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function setMyLanguage(lang: Lang) {
  must(await supabase.rpc('set_my_language', { p_language: lang }));
}

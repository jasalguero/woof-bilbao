import { supabase } from '../supabase';
import type { Dog, Inserts, Message, Owner, Updates } from '../types';
import { likeEscape, must } from './util';

export type OwnerListItem = Owner & { dogs: { id: string; name: string; active: boolean }[] };

export async function listOwners(): Promise<OwnerListItem[]> {
  return must(
    await supabase.from('owners').select('*, dogs(id, name, active)').order('full_name')
  ) as OwnerListItem[];
}

export async function getOwner(id: string): Promise<Owner | null> {
  return must(await supabase.from('owners').select('*').eq('id', id).maybeSingle()) ?? null;
}

/** Case-insensitive exact email match (emails are unique on lower(email)). */
export async function findOwnerByEmail(email: string): Promise<Owner | null> {
  const e = email.trim();
  if (!e) return null;
  const rows = must(await supabase.from('owners').select('*').ilike('email', likeEscape(e)).limit(1));
  return rows[0] ?? null;
}

export async function searchOwners(text: string): Promise<Owner[]> {
  const s = likeEscape(text.trim()).replace(/[,()"]/g, ' ');
  if (!s) return [];
  return must(
    await supabase
      .from('owners')
      .select('*')
      .or(`email.ilike.%${s}%,full_name.ilike.%${s}%`)
      .order('full_name')
      .limit(10)
  );
}

export async function createOwner(owner: Inserts<'owners'>): Promise<Owner> {
  return must(await supabase.from('owners').insert(owner).select().single());
}

export async function updateOwner(id: string, patch: Updates<'owners'>): Promise<Owner> {
  return must(await supabase.from('owners').update(patch).eq('id', id).select().single());
}

export async function listOwnerDogs(ownerId: string): Promise<Dog[]> {
  return must(await supabase.from('dogs').select('*').eq('owner_id', ownerId).order('name'));
}

/** Messages linked to the owner, plus ones sent to their address before they were an owner. */
export async function listOwnerMessages(owner: Pick<Owner, 'id' | 'email'>): Promise<Message[]> {
  const [byId, byEmail] = await Promise.all([
    supabase.from('messages').select('*').eq('owner_id', owner.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('messages').select('*').is('owner_id', null).ilike('recipient', likeEscape(owner.email)).order('created_at', { ascending: false }).limit(100)
  ]);
  const all = [...must(byId), ...must(byEmail)];
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

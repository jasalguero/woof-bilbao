import { supabase } from '../supabase';
import type { Attendance, Booking, Dog, Inserts, Owner, Updates } from '../types';
import { must } from './util';

export type DogWithOwner = Dog & { owner: Pick<Owner, 'id' | 'full_name' | 'email' | 'phone' | 'language'> };

const WITH_OWNER = '*, owner:owners(id, full_name, email, phone, language)';
const BUCKET = 'dog-files';

export async function listDogs(): Promise<DogWithOwner[]> {
  return must(await supabase.from('dogs').select(WITH_OWNER).order('name')) as DogWithOwner[];
}

export async function getDog(id: string): Promise<DogWithOwner | null> {
  return (must(await supabase.from('dogs').select(WITH_OWNER).eq('id', id).maybeSingle()) as DogWithOwner | null) ?? null;
}

export async function createDog(dog: Inserts<'dogs'>): Promise<Dog> {
  return must(await supabase.from('dogs').insert(dog).select().single());
}

export async function updateDog(id: string, patch: Updates<'dogs'>): Promise<Dog> {
  return must(await supabase.from('dogs').update(patch).eq('id', id).select().single());
}

export async function listDogBookings(dogId: string): Promise<Booking[]> {
  return must(await supabase.from('bookings').select('*').eq('dog_id', dogId).order('start_date', { ascending: false }));
}

export async function listDogAttendance(dogId: string): Promise<Attendance[]> {
  return must(
    await supabase.from('attendance').select('*').eq('dog_id', dogId).order('day', { ascending: false }).limit(200)
  );
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Uploads to dog-files/dogs/<dog_id>/photo.<ext> (private bucket) and records the path. */
export async function uploadDogPhoto(dogId: string, file: File): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error(`Unsupported image type: ${file.type || 'unknown'}`);
  const path = `dogs/${dogId}/photo.${ext}`;
  must(await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type }));
  await updateDog(dogId, { photo_path: path });
  return path;
}

/** A short-lived URL for a private photo. */
export async function photoUrl(path: string): Promise<string> {
  return must(await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)).signedUrl;
}

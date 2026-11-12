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

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Where a dog's photo lives in the private dog-files bucket. */
export function photoPath(dogId: string): string {
  return `dogs/${dogId}/photo`;
}

/**
 * Uploads the dog's photo and records its path. The object name has no
 * extension (the content type is stored with it), so a new photo always
 * replaces the old one instead of leaving a photo.jpg behind a photo.png.
 */
export async function uploadDogPhoto(dogId: string, file: File): Promise<string> {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error(`Unsupported image type: ${file.type || 'unknown'}`);
  const path = photoPath(dogId);
  must(await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type, cacheControl: '0' }));
  await updateDog(dogId, { photo_path: path });
  return path;
}

/** A short-lived URL for a private photo, or null if the object is missing. */
export async function photoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) {
    console.warn(`dog photo ${path} not available:`, error?.message);
    return null;
  }
  return data.signedUrl;
}

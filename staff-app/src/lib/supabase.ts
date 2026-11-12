import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** False when the build was made without the Supabase env vars. */
export const configured = Boolean(url && key);

// Only ever the publishable key: row-level security does the rest.
export const supabase = createClient<Database>(url || 'http://invalid.localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true }
});

// TODO(phase 4): subscribe to Realtime changes on booking_requests so new
// requests appear (and notify) without a refresh.

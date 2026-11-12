// Supabase Realtime (postgres_changes). Realtime applies row-level security,
// so only staff receive these events.
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { BookingRequest } from './types';

let requestsChannel: RealtimeChannel | null = null;
let nextId = 1;

/** Calls onInsert for every new booking request until stopRequestFeed(). */
export function startRequestFeed(onInsert: (row: BookingRequest) => void) {
  stopRequestFeed();
  requestsChannel = supabase
    .channel(`booking-requests-${nextId++}`)
    .on<BookingRequest>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_requests' }, (payload) =>
      onInsert(payload.new as BookingRequest)
    )
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('realtime booking_requests:', status, err);
    });
}

export function stopRequestFeed() {
  if (requestsChannel) supabase.removeChannel(requestsChannel);
  requestsChannel = null;
}

/**
 * Listens to every change on a table (optionally filtered, e.g. `day=eq.2026-11-12`).
 * Returns the function that stops listening.
 */
export function watchTable(
  table: 'attendance' | 'booking_requests',
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  filter?: string
): () => void {
  const channel = supabase
    .channel(`${table}-${nextId++}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, onChange)
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`realtime ${table}:`, status, err);
    });
  return () => {
    supabase.removeChannel(channel);
  };
}

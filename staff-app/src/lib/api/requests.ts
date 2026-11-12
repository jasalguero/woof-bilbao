import { supabase } from '../supabase';
import type { Booking, BookingRequest } from '../types';
import { must } from './util';

export type AcceptMode = 'confirm' | 'overbook' | 'pending';

export type RequestWithHandler = BookingRequest & {
  handler: { full_name: string } | null;
  booking: { id: string; dog_id: string; status: Booking['status'] } | null;
};

const SELECT = '*, handler:staff!booking_requests_handled_by_fkey(full_name), booking:bookings!booking_requests_booking_id_fkey(id, dog_id, status)';

export async function listRequests(tab: 'new' | 'handled'): Promise<RequestWithHandler[]> {
  let q = supabase.from('booking_requests').select(SELECT);
  q = tab === 'new'
    ? q.eq('status', 'new').order('created_at', { ascending: false })
    : q.neq('status', 'new').order('handled_at', { ascending: false, nullsFirst: false }).limit(200);
  return must(await q) as unknown as RequestWithHandler[];
}

export async function countNewRequests(): Promise<number> {
  const { count, error } = await supabase
    .from('booking_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  if (error) throw error;
  return count ?? 0;
}

/**
 * Books the dog and marks the request accepted in one transaction
 * (accept_booking_request). With mode 'confirm' a full day throws the
 * capacity error (hint 'full_days') and nothing is saved.
 */
export async function acceptRequest(args: {
  requestId: string;
  dogId: string;
  start: string;
  end: string;
  weekdays: number[];
  mode: AcceptMode;
}): Promise<Booking> {
  return must(
    await supabase.rpc('accept_booking_request', {
      p_request_id: args.requestId,
      p_dog_id: args.dogId,
      p_start_date: args.start,
      p_end_date: args.end,
      p_weekdays: args.weekdays,
      p_mode: args.mode
    })
  );
}

export async function declineRequest(requestId: string, status: 'declined' | 'spam'): Promise<void> {
  must(await supabase.rpc('decline_booking_request', { p_request_id: requestId, p_status: status }));
}

import { countNewRequests } from './api/requests';

/**
 * Numbers shown in the navigation. `requestsVersion` goes up whenever a new
 * request arrives through Realtime, so open screens can reload.
 */
export const counts = $state({ newRequests: 0, requestsVersion: 0 });

export async function refreshCounts() {
  try {
    counts.newRequests = await countNewRequests();
  } catch {
    // Not worth a toast: the requests screen shows its own errors.
  }
}

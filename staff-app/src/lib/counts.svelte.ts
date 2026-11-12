import { countNewRequests } from './api/requests';

/** Numbers shown in the navigation. */
export const counts = $state({ newRequests: 0 });

export async function refreshCounts() {
  try {
    counts.newRequests = await countNewRequests();
  } catch {
    // Not worth a toast: the requests screen shows its own errors.
  }
}

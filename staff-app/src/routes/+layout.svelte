<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { session, initSession } from '#lib/session.svelte.ts';
  import { configured } from '#lib/supabase.ts';
  import { counts, refreshCounts } from '#lib/counts.svelte.ts';
  import { startRequestFeed, stopRequestFeed } from '#lib/realtime.ts';
  import { desktopNotify } from '#lib/notify.ts';
  import { parsePayload } from '#lib/logic/prefill.ts';
  import { t, fmtDate } from '#lib/i18n/index.svelte.ts';
  import { notice } from '#lib/toast.svelte.ts';
  import type { BookingRequest } from '#lib/types.ts';
  import Login from '#lib/components/Login.svelte';
  import AppHeader from '#lib/components/AppHeader.svelte';
  import Toasts from '#lib/components/Toasts.svelte';
  import UpdateBanner from '#lib/components/UpdateBanner.svelte';
  import { startAutoUpdates } from '#lib/updater.svelte.ts';

  let { children } = $props();

  onMount(() => {
    initSession();
    // A safety net in case a Realtime event is missed (sleep, network drop).
    const timer = setInterval(() => session.staff && refreshCounts(), 60_000);
    // Desktop only: look for a new version now and every 6 hours (no-op in a browser).
    const stopUpdates = startAutoUpdates();
    return () => {
      clearInterval(timer);
      stopUpdates();
    };
  });

  const signedIn = $derived(Boolean(session.staff));

  // A new booking request: update the badge, tell whoever is at the screen,
  // and raise a desktop notification (Tauri only).
  function onNewRequest(row: BookingRequest) {
    counts.requestsVersion++;
    refreshCounts();
    const p = parsePayload(row.payload);
    const vars = { dog: p.dog.name || '?', owner: p.owner.name || '?' };
    notice(t('notify.newRequestToast', vars));
    desktopNotify(
      t('notify.newRequestTitle'),
      t('notify.newRequestBody', { ...vars, from: fmtDate(p.dates.from), to: fmtDate(p.dates.to) })
    );
  }

  $effect(() => {
    if (!signedIn) return;
    refreshCounts();
    startRequestFeed(onNewRequest);
    return () => stopRequestFeed();
  });
</script>

{#if !configured}
  <main class="empty"><p>{t('error.config')}</p></main>
{:else if !session.ready}
  <main class="empty"><p>{t('app.loading')}</p></main>
{:else if !session.staff}
  <Login />
{:else}
  <AppHeader />
  <main class="page">{@render children()}</main>
{/if}
<Toasts />
<UpdateBanner />

<style>
  .page { padding: 1.2rem; max-width: 1400px; margin: 0 auto; }
</style>

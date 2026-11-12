<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { session, initSession } from '#lib/session.svelte.ts';
  import { configured } from '#lib/supabase.ts';
  import { refreshCounts } from '#lib/counts.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import Login from '#lib/components/Login.svelte';
  import AppHeader from '#lib/components/AppHeader.svelte';
  import Toasts from '#lib/components/Toasts.svelte';

  let { children } = $props();

  onMount(() => {
    initSession();
    const timer = setInterval(() => session.staff && refreshCounts(), 60_000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    if (session.staff) refreshCounts();
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

<style>
  .page { padding: 1.2rem; max-width: 1400px; margin: 0 auto; }
</style>

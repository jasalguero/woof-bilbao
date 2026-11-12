<script lang="ts">
  import Modal from './Modal.svelte';
  import { t, fmtDate } from '#lib/i18n/index.svelte.ts';

  let { days, busy = false, onoverbook, onpending, oncancel }: {
    days: string[];
    busy?: boolean;
    onoverbook: () => void;
    /** Omit when the booking is already pending (nothing to "leave"). */
    onpending?: () => void;
    oncancel: () => void;
  } = $props();
</script>

<Modal title={t('full.title')} onclose={oncancel}>
  <p>{t('full.body')}</p>
  <ul class="days">
    {#each days as d (d)}<li>{fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</li>{/each}
  </ul>
  {#snippet actions()}
    <button class="quiet" onclick={oncancel} disabled={busy}>{t('common.cancel')}</button>
    {#if onpending}<button onclick={onpending} disabled={busy}>{t('full.pending')}</button>{/if}
    <button class="primary" onclick={onoverbook} disabled={busy}>{t('full.overbook')}</button>
  {/snippet}
</Modal>

<style>
  .days { margin: 0.4rem 0 0; padding-left: 1.2rem; font-weight: 700; }
</style>

<script lang="ts">
  import { listRequests, type RequestWithHandler } from '#lib/api/requests.ts';
  import { parsePayload } from '#lib/logic/prefill.ts';
  import { untrack } from 'svelte';
  import { counts, refreshCounts } from '#lib/counts.svelte.ts';
  import { t, fmtDate, fmtDateTime } from '#lib/i18n/index.svelte.ts';
  import { fail } from '#lib/toast.svelte.ts';
  import RequestDetail from '#lib/components/RequestDetail.svelte';
  import StatusBadge from '#lib/components/StatusBadge.svelte';

  let tab = $state<'new' | 'handled'>('new');
  let rows = $state<RequestWithHandler[]>([]);
  let loading = $state(true);
  let selectedId = $state<string | null>(null);
  const selected = $derived(rows.find((r) => r.id === selectedId) ?? null);

  // Only the latest load may update the list (tab switches, live refreshes).
  let loadToken = 0;
  async function load(quiet = false) {
    const token = ++loadToken;
    const which = tab;
    if (!quiet) loading = true;
    try {
      const list = await listRequests(which);
      if (token === loadToken) rows = list;
    } catch (e) {
      if (token === loadToken) fail(e);
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  $effect(() => {
    void tab;
    selectedId = null;
    load();
  });

  // A new request arrived through Realtime: refresh the inbox in place.
  $effect(() => {
    if (counts.requestsVersion) untrack(() => tab === 'new' && load(true));
  });

  function handled() {
    selectedId = null;
    load();
    refreshCounts();
  }
</script>

<div class="layout">
  <section class="list">
    <h1>{t('requests.title')}</h1>
    <div class="tabs">
      <button aria-pressed={tab === 'new'} onclick={() => (tab = 'new')}>{t('requests.tabNew')}</button>
      <button aria-pressed={tab === 'handled'} onclick={() => (tab = 'handled')}>{t('requests.tabHandled')}</button>
    </div>
    {#if loading}
      <p class="empty">{t('app.loading')}</p>
    {:else if rows.length === 0}
      <p class="empty">{tab === 'new' ? t('requests.empty') : t('common.none')}</p>
    {:else}
      <ul>
        {#each rows as r (r.id)}
          {@const p = parsePayload(r.payload)}
          <li>
            <button class="item" aria-current={r.id === selectedId} onclick={() => (selectedId = r.id)}>
              <span class="row">
                <strong>{p.dog.name}</strong>
                <span class="muted">· {p.owner.name}</span>
                <span class="spacer"></span>
                {#if tab === 'handled'}<StatusBadge status={r.status} />{/if}
              </span>
              <span class="muted small">
                {fmtDate(p.dates.from)} – {fmtDate(p.dates.to)} · {fmtDateTime(r.created_at)}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="detail">
    {#if selected}
      {#key selected.id}
        <RequestDetail request={selected} onhandled={handled} />
      {/key}
    {:else}
      <p class="empty">{t('requests.pick')}</p>
    {/if}
  </section>
</div>

<style>
  .layout { display: grid; grid-template-columns: minmax(16rem, 22rem) 1fr; gap: 1.5rem; align-items: start; }
  @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .item {
    width: 100%; text-align: left; display: flex; flex-direction: column; align-items: stretch; gap: 0.15rem;
    border-radius: 12px; border-width: 2px; border-color: var(--line); box-shadow: none; font-weight: 400;
  }
  .item .row { gap: 0.35rem; }
  .item:hover:not(:disabled) { transform: none; box-shadow: none; border-color: var(--shadow); }
  .item[aria-current='true'] { border-color: var(--shadow); background: var(--surface-2); box-shadow: 3px 3px 0 var(--shadow); }
  .detail { min-width: 0; }
</style>

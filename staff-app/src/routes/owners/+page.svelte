<script lang="ts">
  import { goto } from '$app/navigation';
  import { createOwner, listOwners, type OwnerListItem } from '#lib/api/owners.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';
  import Modal from '#lib/components/Modal.svelte';
  import OwnerFields, { type OwnerFormValue } from '#lib/components/OwnerFields.svelte';

  let owners = $state<OwnerListItem[] | null>(null);
  let query = $state('');
  let draft = $state<OwnerFormValue | null>(null);
  let busy = $state(false);

  $effect(() => {
    listOwners().then((o) => (owners = o)).catch(fail);
  });

  const norm = (s: string | null | undefined) =>
    (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = $derived(
    (owners ?? []).filter((o) => {
      const q = norm(query.trim());
      return !q || [o.full_name, o.email, o.phone, ...o.dogs.map((d) => d.name)].some((f) => norm(f).includes(q));
    })
  );

  async function create() {
    if (!draft) return;
    busy = true;
    try {
      const o = await createOwner({ ...draft, email: draft.email.trim(), full_name: draft.full_name.trim() });
      ok(t('owners.created'));
      draft = null;
      goto(`/owners/${o.id}`);
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="row head">
  <h1>{t('owners.title')}</h1>
  <span class="spacer"></span>
  <input type="search" placeholder={t('owners.search')} bind:value={query} />
  <button onclick={() => (draft = { full_name: '', email: '', phone: null, language: 'es', notes: null })}>{t('owners.new')}</button>
</div>

<div class="card">
  {#if owners === null}
    <p class="empty">{t('app.loading')}</p>
  {:else if shown.length === 0}
    <p class="empty">{t('common.none')}</p>
  {:else}
    <table>
      <thead><tr><th>{t('common.name')}</th><th>{t('common.email')}</th><th>{t('common.phone')}</th><th>{t('common.language')}</th><th>{t('common.dogs')}</th></tr></thead>
      <tbody>
        {#each shown as o (o.id)}
          <tr class="clickable" onclick={() => goto(`/owners/${o.id}`)}>
            <td><a href="/owners/{o.id}"><strong>{o.full_name}</strong></a></td>
            <td>{o.email}</td>
            <td>{o.phone ?? ''}</td>
            <td>{t(`lang.${o.language}` as MessageKey)}</td>
            <td>{o.dogs.map((d) => d.name).join(', ')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if draft}
  <Modal title={t('owners.new')} onclose={() => (draft = null)}>
    <OwnerFields bind:owner={draft} notes />
    {#snippet actions()}
      <button class="quiet" onclick={() => (draft = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" onclick={create} disabled={busy || !draft?.full_name.trim() || !draft?.email.trim()}>{t('common.save')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .head { margin-bottom: 0.8rem; }
  .head h1 { margin: 0; }
  input[type='search'] { width: min(20rem, 100%); }
</style>

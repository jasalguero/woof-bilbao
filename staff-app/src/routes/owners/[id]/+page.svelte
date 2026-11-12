<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { getOwner, listOwnerDogs, listOwnerMessages, updateOwner } from '#lib/api/owners.ts';
  import { createDog } from '#lib/api/dogs.ts';
  import { t, fmtDateTime } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import type { Dog, Message, Owner } from '#lib/types.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';
  import OwnerFields, { type OwnerFormValue } from '#lib/components/OwnerFields.svelte';
  import DogFields, { type DogFormValue } from '#lib/components/DogFields.svelte';
  import StatusBadge from '#lib/components/StatusBadge.svelte';
  import VaccineFlag from '#lib/components/VaccineFlag.svelte';
  import Modal from '#lib/components/Modal.svelte';

  const id = $derived(page.params.id ?? '');
  let owner = $state<Owner | null>(null);
  let missing = $state(false);
  let form = $state<OwnerFormValue | null>(null);
  let dogs = $state<Dog[]>([]);
  let messages = $state<Message[]>([]);
  let busy = $state(false);
  let newDog = $state<DogFormValue | null>(null);

  async function load(ownerId: string) {
    try {
      const o = await getOwner(ownerId);
      if (ownerId !== id) return;
      missing = !o;
      owner = o;
      if (!o) return;
      form = { full_name: o.full_name, email: o.email, phone: o.phone, language: o.language, notes: o.notes };
      [dogs, messages] = await Promise.all([listOwnerDogs(o.id), listOwnerMessages(o)]);
    } catch (e) {
      fail(e);
    }
  }

  $effect(() => {
    load(id);
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!owner || !form) return;
    busy = true;
    try {
      await updateOwner(owner.id, {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || null,
        language: form.language,
        notes: form.notes?.trim() || null
      });
      ok(t('common.saved'));
      await load(owner.id);
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function addDog() {
    if (!owner || !newDog) return;
    busy = true;
    try {
      const d = await createDog({ ...newDog, owner_id: owner.id, name: newDog.name.trim() });
      newDog = null;
      goto(`/dogs/${d.id}`);
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  function emptyDog(): DogFormValue {
    return {
      name: '', breed: null, age_text: null, size: null, sex: null, neutered: false,
      vaccines_up_to_date: false, medical_notes: null, behaviour_notes: null
    };
  }
</script>

<p><a href="/owners" class="muted">← {t('owners.title')}</a></p>

{#if missing}
  <p class="empty">{t('owners.notFound')}</p>
{:else if owner && form}
  <h1>{owner.full_name}</h1>
  <div class="layout">
    <form class="card stack" onsubmit={save}>
      <OwnerFields bind:owner={form} notes />
      <div class="row"><span class="spacer"></span><button class="primary" type="submit" disabled={busy}>{t('common.save')}</button></div>
    </form>

    <section class="card">
      <div class="row"><h2>{t('common.dogs')}</h2><span class="spacer"></span>
        <button class="quiet" onclick={() => (newDog = emptyDog())}>+ {t('dogs.newDog')}</button></div>
      {#if dogs.length === 0}
        <p class="muted">{t('common.none')}</p>
      {:else}
        <ul>
          {#each dogs as d (d.id)}
            <li>
              <a href="/dogs/{d.id}"><strong>{d.name}</strong></a>
              <span class="muted small">{d.breed ?? ''} {d.size ? t(`size.${d.size}` as MessageKey) : ''}</span>
              {#if !d.active}<span class="badge cancelled">{t('common.inactive')}</span>{/if}
              <VaccineFlag dog={d} />
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  <section class="card">
    <h2>{t('owners.messages')}</h2>
    {#if messages.length === 0}
      <p class="muted">{t('owners.noMessages')}</p>
    {:else}
      <table>
        <thead><tr><th>{t('common.date')}</th><th>{t('owners.template')}</th><th>{t('owners.recipient')}</th><th>{t('common.language')}</th><th>{t('common.status')}</th></tr></thead>
        <tbody>
          {#each messages as m (m.id)}
            <tr>
              <td>{fmtDateTime(m.created_at)}</td>
              <td><code>{m.template}</code></td>
              <td>{m.recipient}</td>
              <td>{m.language.toUpperCase()}</td>
              <td><StatusBadge status={m.status} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{:else}
  <p class="empty">{t('app.loading')}</p>
{/if}

{#if newDog}
  <Modal title={t('dogs.newDog')} onclose={() => (newDog = null)}>
    <DogFields bind:dog={newDog} />
    {#snippet actions()}
      <button class="quiet" onclick={() => (newDog = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" onclick={addDog} disabled={busy || !newDog?.name.trim()}>{t('common.save')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .layout { display: grid; grid-template-columns: 1fr minmax(15rem, 22rem); gap: 1rem; align-items: start; margin-bottom: 1rem; }
  @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li { display: flex; gap: 0.4rem; align-items: baseline; flex-wrap: wrap; }
</style>

<script lang="ts">
  import { goto } from '$app/navigation';
  import { listDogs, type DogWithOwner } from '#lib/api/dogs.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import { fail } from '#lib/toast.svelte.ts';
  import VaccineFlag from '#lib/components/VaccineFlag.svelte';

  let dogs = $state<DogWithOwner[] | null>(null);
  let query = $state('');
  let showInactive = $state(false);

  $effect(() => {
    listDogs().then((d) => (dogs = d)).catch(fail);
  });

  const norm = (s: string | null | undefined) =>
    (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const shown = $derived(
    (dogs ?? []).filter((d) => {
      if (!showInactive && !d.active) return false;
      const q = norm(query.trim());
      return !q || norm(d.name).includes(q) || norm(d.owner.full_name).includes(q) || norm(d.breed).includes(q);
    })
  );
</script>

<div class="row head">
  <h1>{t('dogs.title')}</h1>
  <span class="spacer"></span>
  <input type="search" placeholder={t('dogs.search')} bind:value={query} />
  <label class="check"><input type="checkbox" bind:checked={showInactive} /> {t('dogs.showInactive')}</label>
</div>

<div class="card">
  {#if dogs === null}
    <p class="empty">{t('app.loading')}</p>
  {:else if shown.length === 0}
    <p class="empty">{t('common.none')}</p>
  {:else}
    <table>
      <thead>
        <tr><th>{t('common.name')}</th><th>{t('common.owner')}</th><th>{t('dogs.size')}</th><th>{t('common.status')}</th><th></th></tr>
      </thead>
      <tbody>
        {#each shown as d (d.id)}
          <tr class="clickable" onclick={() => goto(`/dogs/${d.id}`)}>
            <td><a href="/dogs/{d.id}"><strong>{d.name}</strong></a> <span class="muted small">{d.breed ?? ''}</span></td>
            <td>{d.owner.full_name}</td>
            <td>{t(d.size ? (`size.${d.size}` as MessageKey) : 'size.none')}</td>
            <td>{d.active ? t('common.active') : t('common.inactive')}</td>
            <td><VaccineFlag dog={d} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .head { margin-bottom: 0.8rem; }
  .head h1 { margin: 0; }
  input[type='search'] { width: min(20rem, 100%); }
</style>

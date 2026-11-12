<script lang="ts">
  import {
    addClosedDay, getDefaultMaxDogs, listClosedDays, listStaff, removeClosedDay, setDefaultMaxDogs, setStaffRole
  } from '#lib/api/settings.ts';
  import { getDayDogs, type DayDog } from '#lib/api/calendar.ts';
  import Modal from '#lib/components/Modal.svelte';
  import StatusBadge from '#lib/components/StatusBadge.svelte';
  import { session, isAdmin, changeLanguage } from '#lib/session.svelte.ts';
  import { i18n, t, fmtDate } from '#lib/i18n/index.svelte.ts';
  import { todayIso } from '#lib/logic/dates.ts';
  import type { Capacity, Staff, StaffRole } from '#lib/types.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';

  let maxDogs = $state<number | null>(null);
  let closedDays = $state<Capacity[]>([]);
  let staff = $state<Staff[]>([]);
  let newDay = $state('');
  let newReason = $state('');
  let busy = $state(false);
  let showPast = $state(false);
  // Set when the day being closed already has bookings: staff confirm first.
  let affected = $state<{ day: string; reason: string | null; dogs: DayDog[] } | null>(null);
  const today = todayIso();
  const shownDays = $derived(closedDays.filter((c) => showPast || (c.day ?? '') >= today));

  async function load() {
    try {
      [maxDogs, closedDays, staff] = await Promise.all([getDefaultMaxDogs(), listClosedDays(), listStaff()]);
    } catch (e) {
      fail(e);
    }
  }

  $effect(() => {
    if (isAdmin()) load();
  });

  async function act(fn: () => Promise<unknown>, reload = true) {
    busy = true;
    try {
      await fn();
      ok(t('common.saved'));
      if (reload) await load();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  function saveMax(e: SubmitEvent) {
    e.preventDefault();
    if (maxDogs === null || !Number.isInteger(maxDogs) || maxDogs < 0) return;
    act(() => setDefaultMaxDogs(maxDogs!));
  }

  async function addDay(e: SubmitEvent) {
    e.preventDefault();
    if (!newDay) return;
    const day = newDay;
    const reason = newReason.trim() || null;
    busy = true;
    try {
      const dogs = await getDayDogs(day);
      if (dogs.length) {
        affected = { day, reason, dogs };
        return;
      }
    } catch (err) {
      fail(err);
      return;
    } finally {
      busy = false;
    }
    closeDay(day, reason);
  }

  function closeDay(day: string, reason: string | null) {
    affected = null;
    act(async () => {
      await addClosedDay(day, reason);
      newDay = '';
      newReason = '';
    });
  }

  function setRole(s: Staff, role: StaffRole) {
    act(() => setStaffRole(s.user_id, role));
  }
</script>

<h1>{t('settings.title')}</h1>

<div class="cols">
  <section class="card stack">
    <h2>{t('settings.myLanguage')}</h2>
    <select value={i18n.lang} onchange={(e) => changeLanguage((e.currentTarget as HTMLSelectElement).value as 'es' | 'en')}>
      <option value="es">{t('lang.es')}</option>
      <option value="en">{t('lang.en')}</option>
    </select>
  </section>

  {#if !isAdmin()}
    <p class="card muted">{t('common.adminOnly')}</p>
  {:else}
    <form class="card stack" onsubmit={saveMax}>
      <h2>{t('settings.capacity')}</h2>
      <label class="field"><span>{t('settings.maxDogs')}</span>
        <input type="number" min="0" step="1" bind:value={maxDogs} name="max_dogs" />
      </label>
      <div class="row"><span class="spacer"></span><button class="primary" type="submit" disabled={busy}>{t('common.save')}</button></div>
    </form>

    <section class="card stack">
      <h2>{t('settings.closedDays')}</h2>
      <form class="row" onsubmit={addDay}>
        <input type="date" bind:value={newDay} required aria-label={t('common.date')} />
        <input placeholder={t('settings.reason')} bind:value={newReason} aria-label={t('settings.reason')} />
        <button type="submit" disabled={busy || !newDay}>{t('common.add')}</button>
      </form>
      {#if shownDays.length === 0}
        <p class="muted">{t('settings.noClosedDays')}</p>
      {:else}
        <table>
          <tbody>
            {#each shownDays as c (c.id)}
              <tr>
                <td>{fmtDate(c.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td>{c.reason ?? ''}</td>
                <td class="right"><button class="quiet danger" disabled={busy} onclick={() => act(() => removeClosedDay(c.id))}>{t('common.remove')}</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      <label class="check small muted"><input type="checkbox" bind:checked={showPast} /> {t('settings.showPast')}</label>
    </section>

    <section class="card stack wide">
      <h2>{t('settings.staff')}</h2>
      <table>
        <thead><tr><th>{t('common.name')}</th><th>{t('common.language')}</th><th>{t('settings.role')}</th></tr></thead>
        <tbody>
          {#each staff as s (s.user_id)}
            {@const me = s.user_id === session.staff?.user_id}
            <tr>
              <td>{s.full_name} {#if me}<span class="muted">{t('settings.you')}</span>{/if}</td>
              <td>{s.language.toUpperCase()}</td>
              <td>
                <select value={s.role} disabled={busy || me} onchange={(e) => setRole(s, (e.currentTarget as HTMLSelectElement).value as StaffRole)}>
                  <option value="staff">{t('settings.role.staff')}</option>
                  <option value="admin">{t('settings.role.admin')}</option>
                </select>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="muted small">{t('settings.invite')}</p>
    </section>
  {/if}
</div>

{#if affected}
  {@const a = affected}
  <Modal title={t('settings.closeDayTitle')} onclose={() => (affected = null)}>
    <p>{t('settings.closeDayBody', { day: fmtDate(a.day, { weekday: 'long', day: 'numeric', month: 'long' }) })}</p>
    <ul class="affected">
      {#each a.dogs as d (d.dog.id)}
        <li><strong>{d.dog.name}</strong> <span class="muted">({d.dog.owner.full_name})</span> <StatusBadge status={d.status} /></li>
      {/each}
    </ul>
    {#snippet actions()}
      <button class="quiet" onclick={() => (affected = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" onclick={() => closeDay(a.day, a.reason)} disabled={busy}>{t('settings.closeAnyway')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .affected { padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.3rem; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 1rem; align-items: start; }
  .wide { grid-column: 1 / -1; }
  input[type='number'] { width: 8rem; }
  .right { text-align: right; }
</style>

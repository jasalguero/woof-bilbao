<script lang="ts">
  // Days a booked dog won't come. With 24 h notice (before 08:00 the day
  // before) the day is not charged; later notice is noted but still charged.
  // The notice time is when staff record it; only admins can enter an
  // earlier one (a call someone took yesterday).
  import { addAbsence, listDogAbsences, removeAbsence } from '#lib/api/payments.ts';
  import { t, fmtDate, fmtDateTime } from '#lib/i18n/index.svelte.ts';
  import { localNowInput, notifiedInTime } from '#lib/logic/absence.ts';
  import { nextWeekday, todayIso } from '#lib/logic/dates.ts';
  import { isAdmin } from '#lib/session.svelte.ts';
  import type { Absence } from '#lib/types.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';

  let { dogId }: { dogId: string } = $props();

  let absences = $state<Absence[]>([]);
  let day = $state(nextWeekday(todayIso()));
  let notifiedAt = $state(localNowInput());
  let note = $state('');
  let busy = $state(false);

  async function load() {
    try {
      absences = await listDogAbsences(dogId);
    } catch (e) {
      fail(e);
    }
  }

  $effect(() => {
    void dogId;
    load();
  });

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!day || (isAdmin() && !notifiedAt)) return;
    busy = true;
    try {
      // datetime-local is this computer's wall clock (the daycare's laptop, in Bilbao).
      await addAbsence(dogId, day, note.trim() || null, isAdmin() ? new Date(notifiedAt).toISOString() : undefined);
      note = '';
      ok(t('common.saved'));
      await load();
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove(a: Absence) {
    busy = true;
    try {
      await removeAbsence(a.id);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<section class="card stack absences">
  <h2>{t('absence.title')}</h2>
  <p class="muted small">{t('absence.help')}</p>
  <form class="row" onsubmit={add}>
    <label class="field"><span>{t('absence.day')}</span><input type="date" bind:value={day} required /></label>
    {#if isAdmin()}
      <label class="field"><span>{t('absence.notifiedAt')}</span><input type="datetime-local" bind:value={notifiedAt} required /></label>
    {/if}
    <label class="field grow"><span>{t('common.note')}</span><input bind:value={note} maxlength="500" /></label>
    <button type="submit" disabled={busy || !day || (isAdmin() && !notifiedAt)}>{t('common.add')}</button>
  </form>
  {#if !isAdmin()}<p class="muted small">{t('absence.nowNote')}</p>{/if}
  {#if absences.length === 0}
    <p class="muted small">{t('absence.none')}</p>
  {:else}
    <table class="small">
      <tbody>
        {#each absences as a (a.id)}
          {@const inTime = notifiedInTime(a.day, a.notified_at)}
          <tr>
            <td>{fmtDate(a.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
            <td>{t('absence.notifiedAt')} {fmtDateTime(a.notified_at)}</td>
            <td><span class="badge {inTime ? 'confirmed' : 'pending'}">{inTime ? t('absence.inTime') : t('absence.late')}</span></td>
            <td>{a.note ?? ''}</td>
            <td class="right"><button class="quiet danger" disabled={busy} onclick={() => remove(a)}>{t('common.remove')}</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .absences { margin: 1rem 0; }
  .grow { flex: 1; min-width: 10rem; }
  .right { text-align: right; }
  form { align-items: flex-end; }
</style>

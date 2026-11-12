<script lang="ts">
  import { page } from '$app/state';
  import {
    getDog, listDogAttendance, listDogBookings, photoUrl, updateDog, uploadDogPhoto, type DogWithOwner
  } from '#lib/api/dogs.ts';
  import { cancelBooking, confirmBooking, updateBookingDates } from '#lib/api/bookings.ts';
  import { classifyError } from '#lib/logic/errors.ts';
  import { normaliseWeekdays } from '#lib/logic/dates.ts';
  import { t, fmtDate, fmtWeekdays } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import type { Attendance, Booking } from '#lib/types.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';
  import DogFields, { type DogFormValue } from '#lib/components/DogFields.svelte';
  import StatusBadge from '#lib/components/StatusBadge.svelte';
  import VaccineFlag from '#lib/components/VaccineFlag.svelte';
  import WeekdayPicker from '#lib/components/WeekdayPicker.svelte';
  import FullDaysDialog from '#lib/components/FullDaysDialog.svelte';
  import Modal from '#lib/components/Modal.svelte';

  const id = $derived(page.params.id ?? '');

  let dog = $state<DogWithOwner | null>(null);
  let missing = $state(false);
  let form = $state<DogFormValue | null>(null);
  let bookings = $state<Booking[]>([]);
  let attendance = $state<Attendance[]>([]);
  let photo = $state<string | null>(null);
  let busy = $state(false);

  let editing = $state<{ id: string; start: string; end: string; weekdays: number[] } | null>(null);
  let full = $state<{ bookingId: string; days: string[] } | null>(null);
  let cancelling = $state<Booking | null>(null);

  function toForm(d: DogWithOwner): DogFormValue {
    return {
      name: d.name, breed: d.breed, age_text: d.age_text, size: d.size, sex: d.sex, neutered: d.neutered,
      vaccines_up_to_date: d.vaccines_up_to_date, vaccines_checked_until: d.vaccines_checked_until,
      medical_notes: d.medical_notes, behaviour_notes: d.behaviour_notes, active: d.active
    };
  }

  async function load(dogId: string) {
    try {
      const [d, b, a] = await Promise.all([getDog(dogId), listDogBookings(dogId), listDogAttendance(dogId)]);
      if (dogId !== id) return;
      missing = !d;
      dog = d;
      form = d ? toForm(d) : null;
      bookings = b;
      attendance = a;
      photo = d?.photo_path ? await photoUrl(d.photo_path) : null;
    } catch (e) {
      fail(e);
    }
  }

  $effect(() => {
    load(id);
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!form || !dog) return;
    busy = true;
    try {
      const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
      await updateDog(dog.id, {
        ...form,
        name: form.name.trim(),
        breed: blank(form.breed), age_text: blank(form.age_text),
        medical_notes: blank(form.medical_notes), behaviour_notes: blank(form.behaviour_notes),
        vaccines_checked_until: form.vaccines_checked_until || null
      });
      ok(t('common.saved'));
      await load(dog.id);
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function onPhoto(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !dog) return;
    busy = true;
    try {
      const path = await uploadDogPhoto(dog.id, file);
      photo = await photoUrl(path);
      ok(t('dogs.photoUploaded'));
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
      input.value = '';
    }
  }

  async function confirm(b: Booking, overbook = false) {
    busy = true;
    try {
      await confirmBooking(b.id, overbook);
      full = null;
      ok(t('dogs.bookingUpdated'));
      await load(b.dog_id);
    } catch (err) {
      const k = classifyError(err);
      if (k.kind === 'full_days' && !overbook) full = { bookingId: b.id, days: k.days };
      else fail(err);
    } finally {
      busy = false;
    }
  }

  async function doCancel(b: Booking) {
    busy = true;
    try {
      await cancelBooking(b.id);
      cancelling = null;
      ok(t('dogs.bookingUpdated'));
      await load(b.dog_id);
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function saveDates() {
    if (!editing || !dog) return;
    busy = true;
    try {
      await updateBookingDates(editing.id, editing.start, editing.end, normaliseWeekdays(editing.weekdays));
      editing = null;
      ok(t('dogs.bookingUpdated'));
      await load(dog.id);
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  const time = (iso: string | null) => (iso ? fmtDate(iso, { hour: '2-digit', minute: '2-digit' }) : '–');
</script>

<p><a href="/dogs" class="muted">← {t('dogs.title')}</a></p>

{#if missing}
  <p class="empty">{t('dogs.notFound')}</p>
{:else if dog && form}
  <div class="row title">
    <h1>{dog.name}</h1>
    {#if !dog.active}<span class="badge cancelled">{t('common.inactive')}</span>{/if}
    <VaccineFlag dog={dog} />
  </div>

  <div class="layout">
    <form class="card stack" onsubmit={save}>
      <h2>{t('dogs.profile')}</h2>
      <DogFields bind:dog={form} full />
      <div class="row"><span class="spacer"></span><button class="primary" type="submit" disabled={busy}>{t('common.save')}</button></div>
    </form>

    <div class="stack side">
      <section class="card stack">
        <h2>{t('dogs.photo')}</h2>
        {#if photo}<img src={photo} alt={dog.name} class="photo" />{/if}
        <label class="button upload">
          {t('dogs.uploadPhoto')}
          <input type="file" accept="image/jpeg,image/png,image/webp" onchange={onPhoto} disabled={busy} />
        </label>
      </section>

      <section class="card">
        <h2>{t('common.owner')}</h2>
        <p><a href="/owners/{dog.owner.id}"><strong>{dog.owner.full_name}</strong></a></p>
        <p class="small">
          <a href="mailto:{dog.owner.email}">{dog.owner.email}</a><br />
          {#if dog.owner.phone}<a href="tel:{dog.owner.phone}">{dog.owner.phone}</a><br />{/if}
          <span class="muted">{t(`lang.${dog.owner.language}` as MessageKey)}</span>
        </p>
      </section>
    </div>
  </div>

  <section class="card">
    <h2>{t('dogs.bookings')}</h2>
    {#if bookings.length === 0}
      <p class="muted">{t('dogs.noBookings')}</p>
    {:else}
      <table>
        <thead><tr><th>{t('common.from')}</th><th>{t('common.to')}</th><th>{t('common.weekdays')}</th><th>{t('common.status')}</th><th></th></tr></thead>
        <tbody>
          {#each bookings as b (b.id)}
            {#if editing?.id === b.id}
              <tr>
                <td><input type="date" bind:value={editing.start} /></td>
                <td><input type="date" bind:value={editing.end} /></td>
                <td><WeekdayPicker bind:value={editing.weekdays} /></td>
                <td><StatusBadge status={b.status} /></td>
                <td class="actions">
                  <button class="quiet" onclick={() => (editing = null)} disabled={busy}>{t('common.cancel')}</button>
                  <button class="primary" onclick={saveDates} disabled={busy}>{t('common.save')}</button>
                </td>
              </tr>
            {:else}
              <tr>
                <td>{fmtDate(b.start_date)}</td>
                <td>{fmtDate(b.end_date)}</td>
                <td>{fmtWeekdays(b.weekdays)}</td>
                <td><StatusBadge status={b.status} /></td>
                <td class="actions">
                  {#if b.status === 'pending'}<button class="ok" onclick={() => confirm(b)} disabled={busy}>{t('dogs.confirm')}</button>{/if}
                  {#if b.status !== 'cancelled'}
                    <button class="quiet" onclick={() => (editing = { id: b.id, start: b.start_date, end: b.end_date, weekdays: [...b.weekdays] })} disabled={busy}>{t('dogs.editDates')}</button>
                    <button class="quiet danger" onclick={() => (cancelling = b)} disabled={busy}>{t('dogs.cancelBooking')}</button>
                  {/if}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="card">
    <h2>{t('dogs.attendance')}</h2>
    {#if attendance.length === 0}
      <p class="muted">{t('dogs.noAttendance')}</p>
    {:else}
      <table>
        <thead><tr><th>{t('common.date')}</th><th>{t('dogs.checkIn')}</th><th>{t('dogs.checkOut')}</th><th>{t('common.notes')}</th></tr></thead>
        <tbody>
          {#each attendance as a (a.id)}
            <tr><td>{fmtDate(a.day)}</td><td>{time(a.checked_in_at)}</td><td>{time(a.checked_out_at)}</td><td>{a.note ?? ''}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{:else}
  <p class="empty">{t('app.loading')}</p>
{/if}

{#if full}
  {@const b = bookings.find((x) => x.id === full?.bookingId)}
  <FullDaysDialog days={full.days} {busy} onoverbook={() => b && confirm(b, true)} oncancel={() => (full = null)} />
{/if}

{#if cancelling}
  {@const b = cancelling}
  <Modal title={t('dogs.cancelBooking')} onclose={() => (cancelling = null)}>
    <p>{t('dogs.confirmCancel')}</p>
    <p class="muted">{fmtDate(b.start_date)} – {fmtDate(b.end_date)} · {fmtWeekdays(b.weekdays)}</p>
    {#snippet actions()}
      <button class="quiet" onclick={() => (cancelling = null)} disabled={busy}>{t('common.back')}</button>
      <button class="primary" onclick={() => doCancel(b)} disabled={busy}>{t('dogs.cancelBooking')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .title { margin-bottom: 0.6rem; }
  .title h1 { margin: 0; }
  .layout { display: grid; grid-template-columns: 1fr minmax(15rem, 20rem); gap: 1rem; align-items: start; margin-bottom: 1rem; }
  @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
  section.card + section.card { margin-top: 1rem; }
  .side > section + section { margin-top: 1rem; }
  .photo { width: 100%; border-radius: 12px; border: 2px solid var(--shadow); object-fit: cover; aspect-ratio: 4 / 3; }
  .upload { position: relative; overflow: hidden; align-self: flex-start; }
  .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .actions { white-space: nowrap; text-align: right; }
  .actions button { font-size: 0.85rem; }
</style>

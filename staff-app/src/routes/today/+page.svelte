<script lang="ts">
  import { onMount } from 'svelte';
  import { checkIn, checkOut, getToday, undoCheckIn, undoCheckOut, type TodayData } from '#lib/api/today.ts';
  import { listDogs, photoUrls, type DogWithOwner } from '#lib/api/dogs.ts';
  import { buildToday, countToday, dayKind, walkInCandidates, type TodayEntry } from '#lib/logic/today.ts';
  import { todayIso } from '#lib/logic/dates.ts';
  import { watchTable } from '#lib/realtime.ts';
  import { t, fmtDate } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import { classifyError } from '#lib/logic/errors.ts';
  import { fail, notice, ok } from '#lib/toast.svelte.ts';
  import Modal from '#lib/components/Modal.svelte';
  import VaccineFlag from '#lib/components/VaccineFlag.svelte';

  // Today in Bilbao, kept current if the app stays open past midnight.
  let day = $state(todayIso());
  let data = $state<TodayData | null>(null);
  let photos = $state(new Map<string, string>());
  let busy = $state<string | null>(null);

  const kind = $derived(dayKind(day, data?.capacity ?? []));
  const entries = $derived(data ? buildToday(data.booked, data.attendance) : []);
  const c = $derived(countToday(entries));

  // Only the latest load may update the screen.
  let token = 0;
  async function load() {
    const mine = ++token;
    const forDay = day;
    try {
      const d = await getToday(forDay);
      if (mine !== token) return;
      data = d;
      const paths = [...d.booked.map((b) => b.dog.photo_path), ...d.attendance.map((a) => a.dog.photo_path)]
        .filter((p): p is string => Boolean(p) && !photos.has(p!));
      if (paths.length) {
        const urls = await photoUrls(paths);
        if (mine === token && urls.size) photos = new Map([...photos, ...urls]);
      }
    } catch (e) {
      if (mine === token) fail(e);
    }
  }

  $effect(() => {
    void day;
    load();
  });

  onMount(() => {
    const timer = setInterval(() => {
      const now = todayIso();
      if (now !== day) day = now;
    }, 60_000);
    // Another staff member checking a dog in or out shows up here at once.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const stop = watchTable('attendance', () => {
      clearTimeout(pending);
      pending = setTimeout(load, 250);
    });
    return () => {
      clearInterval(timer);
      clearTimeout(pending);
      stop();
    };
  });

  // The app may have been open since yesterday: never act on a stale list.
  // If the date in Bilbao has moved on, switch to the new day (which reloads)
  // and let the person look again.
  function dayMoved(): boolean {
    const now = todayIso();
    if (now === day) return false;
    day = now;
    noting = null;
    walkIn = null;
    overCap = null;
    notice(t('today.dayChanged'));
    return true;
  }

  // A walk-in on a day already at the daily maximum asks before going over.
  let overCap = $state<{ dogId: string; name: string; note?: string; count: number; max: number } | null>(null);

  /** Checks a dog in; false when it stopped to ask about capacity. */
  async function doCheckIn(dogId: string, name: string, note: string | undefined, walkIn: boolean, allowOver = false) {
    try {
      await checkIn(dogId, note, walkIn, allowOver);
    } catch (err) {
      const k = classifyError(err);
      if (k.kind === 'over_capacity' && !allowOver) {
        overCap = { dogId, name, note, count: k.count, max: k.max };
        return false;
      }
      throw err;
    }
    ok(t('today.checkedIn', { dog: name }));
    return true;
  }

  async function admitOver() {
    if (!overCap || dayMoved()) return;
    const { dogId, name, note } = overCap;
    overCap = null;
    busy = dogId;
    try {
      await doCheckIn(dogId, name, note, true, true);
    } catch (err) {
      fail(err);
    } finally {
      busy = null;
      await load();
    }
  }

  async function act(e: TodayEntry, what: 'in' | 'out' | 'undoIn' | 'undoOut', note?: string) {
    if (dayMoved()) return;
    busy = e.dog.id;
    try {
      if (what === 'in') {
        await doCheckIn(e.dog.id, e.dog.name, note, !e.booked);
      } else if (what === 'out') {
        await checkOut(e.dog.id, note);
        ok(t('today.checkedOut', { dog: e.dog.name }));
      } else if (what === 'undoIn') {
        await undoCheckIn(e.dog.id);
        ok(t('today.undone'));
      } else {
        await undoCheckOut(e.dog.id);
        ok(t('today.undone'));
      }
    } catch (err) {
      fail(err);
    } finally {
      busy = null;
      await load();
    }
  }

  // Optional note: "With a note…" opens a small dialog before the check-in/out.
  let noting = $state<{ entry: TodayEntry; what: 'in' | 'out'; text: string } | null>(null);
  async function saveNote() {
    if (!noting) return;
    const { entry, what, text } = noting;
    noting = null;
    await act(entry, what, text.trim());
  }

  // Walk-in: pick an active dog without a booking today, then confirm.
  let walkIn = $state<{ dogs: DogWithOwner[] | null; query: string; chosen: DogWithOwner | null; note: string } | null>(null);
  const candidates = $derived(walkIn?.dogs ? walkInCandidates(walkIn.dogs, entries, walkIn.query) : []);

  async function openWalkIn() {
    if (dayMoved()) return;
    walkIn = { dogs: null, query: '', chosen: null, note: '' };
    try {
      const dogs = await listDogs();
      if (walkIn) walkIn.dogs = dogs;
    } catch (e) {
      fail(e);
      walkIn = null;
    }
  }

  async function confirmWalkIn() {
    const chosen = walkIn?.chosen;
    if (!walkIn || !chosen || dayMoved()) return;
    const note = walkIn.note.trim();
    busy = chosen.id;
    try {
      await doCheckIn(chosen.id, chosen.name, note, true);
      walkIn = null;
    } catch (err) {
      fail(err);
    } finally {
      busy = null;
      await load();
    }
  }

  const time = (iso: string | null | undefined) => fmtDate(iso, { hour: '2-digit', minute: '2-digit' });
  const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';
</script>

<div class="row head">
  <div>
    <h1>{t('today.title')}</h1>
    <p class="muted date">{fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>
  <span class="spacer"></span>
  {#if kind.kind === 'open'}
    <button onclick={openWalkIn}>+ {t('today.addWalkIn')}</button>
  {/if}
</div>

{#if data === null}
  <p class="empty">{t('app.loading')}</p>
{:else if kind.kind !== 'open'}
  <div class="card closed-day" data-testid="today-closed">
    <img src="/logo.png" alt="" />
    <p class="big">{kind.kind === 'weekend' ? t('today.weekend') : t('today.closed')}</p>
    {#if kind.reason}<p class="muted">{t('today.closedReason', { reason: kind.reason })}</p>{/if}
  </div>
{:else}
  <div class="stats" data-testid="today-counters">
    <div class="stat">
      <span class="label">{t('today.expected')}</span>
      <strong data-testid="count-expected">{c.expected}</strong>
      <span class="muted small">{t('today.toCome', { n: c.toCome })}</span>
    </div>
    <div class="stat here">
      <span class="label">{t('today.here')}</span>
      <strong data-testid="count-here">{c.here}</strong>
      {#if c.walkIns}<span class="muted small">{t('today.walkIns', { n: c.walkIns })}</span>{/if}
    </div>
    <div class="stat gone">
      <span class="label">{t('today.gone')}</span>
      <strong data-testid="count-gone">{c.gone}</strong>
    </div>
  </div>

  {#if entries.length === 0}
    <div class="card closed-day">
      <img src="/logo.png" alt="" />
      <p class="big">{t('today.empty')}</p>
    </div>
  {:else}
    <ul class="dogs">
      {#each entries as e (e.dog.id)}
        {@const photo = e.dog.photo_path ? photos.get(e.dog.photo_path) : undefined}
        <li class="card dog {e.presence}" data-dog={e.dog.name} data-presence={e.presence}>
          <div class="top">
            {#if photo}
              <img class="thumb" src={photo} alt="" />
            {:else}
              <span class="thumb placeholder" aria-hidden="true">{initial(e.dog.name)}</span>
            {/if}
            <div class="who">
              <a class="name" href="/dogs/{e.dog.id}">{e.dog.name}</a>
              <span class="tags">
                <span class="badge">{t(e.dog.size ? (`size.${e.dog.size}` as MessageKey) : 'size.none')}</span>
                {#if !e.booked}<span class="badge walkin">{t('today.walkIn')}</span>{/if}
                <VaccineFlag dog={e.dog} />
              </span>
              <span class="small">
                {e.dog.owner.full_name} ·
                {#if e.dog.owner.phone}<a class="phone" href="tel:{e.dog.owner.phone.replace(/\s+/g, '')}">{e.dog.owner.phone}</a>{:else}<span class="muted">{t('today.noPhone')}</span>{/if}
              </span>
            </div>
          </div>

          {#if e.dog.medical_notes}
            <p class="medical" role="note"><strong>{t('today.medical')}:</strong> {e.dog.medical_notes}</p>
          {/if}

          <p class="state small">
            {#if e.presence === 'expected'}
              <span class="muted">{t('today.notArrived')}</span>
            {:else}
              {t('today.arrivedAt', { time: time(e.attendance?.checked_in_at) })}
              {#if e.presence === 'gone'} · {t('today.leftAt', { time: time(e.attendance?.checked_out_at) })}{/if}
            {/if}
          </p>
          {#if e.attendance?.note}<p class="note small">{e.attendance.note}</p>{/if}

          <div class="actions">
            {#if e.presence === 'expected'}
              <button class="big primary" disabled={busy === e.dog.id} onclick={() => act(e, 'in')}>{t('today.checkIn')}</button>
              <button class="quiet small" disabled={busy === e.dog.id} onclick={() => (noting = { entry: e, what: 'in', text: '' })}>{t('today.withNote')}</button>
            {:else if e.presence === 'here'}
              <button class="big ok" disabled={busy === e.dog.id} onclick={() => act(e, 'out')}>{t('today.checkOut')}</button>
              <button class="quiet small" disabled={busy === e.dog.id} onclick={() => (noting = { entry: e, what: 'out', text: '' })}>{t('today.withNote')}</button>
              <button class="quiet small" disabled={busy === e.dog.id} onclick={() => act(e, 'undoIn')}>{t('today.undoCheckIn')}</button>
            {:else}
              <button class="quiet small" disabled={busy === e.dog.id} onclick={() => act(e, 'undoOut')}>{t('today.undoCheckOut')}</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

{#if noting}
  <Modal
    title={t(noting.what === 'in' ? 'today.noteTitleIn' : 'today.noteTitleOut', { dog: noting.entry.dog.name })}
    onclose={() => (noting = null)}
  >
    <label class="field"><span>{t('today.note')}</span>
      <textarea bind:value={noting.text} maxlength="500"></textarea>
    </label>
    {#snippet actions()}
      <button class="quiet" onclick={() => (noting = null)}>{t('common.cancel')}</button>
      <button class="primary" onclick={saveNote}>{t(noting!.what === 'in' ? 'today.checkIn' : 'today.checkOut')}</button>
    {/snippet}
  </Modal>
{/if}

{#if overCap}
  <Modal title={t('today.overTitle')} onclose={() => (overCap = null)}>
    <p data-testid="over-capacity">{t('today.overBody', { count: overCap.count, max: overCap.max })}</p>
    {#snippet actions()}
      <button class="quiet" onclick={() => (overCap = null)}>{t('common.cancel')}</button>
      <button class="primary" onclick={admitOver}>{t('today.overDo')}</button>
    {/snippet}
  </Modal>
{/if}

{#if walkIn}
  <Modal title={t('today.addWalkIn')} onclose={() => (walkIn = null)}>
    {#if walkIn.chosen}
      <p>{t('today.walkInConfirm', { dog: walkIn.chosen.name })}</p>
      <label class="field"><span>{t('today.note')}</span>
        <textarea bind:value={walkIn.note} maxlength="500"></textarea>
      </label>
    {:else}
      <input type="search" placeholder={t('today.walkInSearch')} bind:value={walkIn.query} aria-label={t('today.walkInSearch')} />
      {#if walkIn.dogs === null}
        <p class="muted">{t('app.loading')}</p>
      {:else if candidates.length === 0}
        <p class="muted">{t('today.walkInNone')}</p>
      {:else}
        <ul class="pick">
          {#each candidates as d (d.id)}
            <li><button class="quiet" onclick={() => walkIn && (walkIn.chosen = d)}><strong>{d.name}</strong> <span class="muted small">{d.owner.full_name}</span></button></li>
          {/each}
        </ul>
      {/if}
    {/if}
    {#snippet actions()}
      {#if walkIn?.chosen}
        <button class="quiet" onclick={() => walkIn && (walkIn.chosen = null)}>{t('common.back')}</button>
        <button class="primary" disabled={busy !== null} onclick={confirmWalkIn}>{t('today.walkInDo')}</button>
      {:else}
        <button class="quiet" onclick={() => (walkIn = null)}>{t('common.cancel')}</button>
      {/if}
    {/snippet}
  </Modal>
{/if}

<style>
  .head { margin-bottom: 0.8rem; align-items: flex-end; }
  .head h1 { margin: 0; }
  .date { margin: 0.1rem 0 0; font-weight: 700; }
  .date::first-letter { text-transform: uppercase; }

  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.8rem; margin-bottom: 1rem; }
  .stat {
    background: var(--surface); border: 2px solid var(--line); border-radius: var(--radius);
    padding: 0.7rem 1rem; display: flex; flex-direction: column;
  }
  .stat strong { font: 2.4rem/1.1 var(--display); }
  .stat .label { font-weight: 800; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.04em; color: var(--muted); }
  .stat.here { background: var(--mint-soft); }
  .stat.gone { background: var(--surface-2); }

  .dogs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); gap: 0.9rem; }
  .dog { display: flex; flex-direction: column; gap: 0.5rem; }
  .dog.here { border-color: var(--mint); box-shadow: 4px 4px 0 var(--mint); }
  .dog.gone { opacity: 0.7; }
  .top { display: flex; gap: 0.8rem; align-items: center; }
  .thumb { width: 4.2rem; height: 4.2rem; border-radius: 50%; object-fit: cover; border: 2px solid var(--shadow); flex: none; }
  .placeholder { display: grid; place-items: center; background: var(--sun); color: #1d1b3a; font: 1.8rem var(--display); }
  .who { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
  .name { font: 1.35rem var(--display); text-decoration: none; }
  .tags { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .phone { white-space: nowrap; }
  .badge.walkin { background: var(--sky); color: #1d1b3a; }
  .medical {
    margin: 0; padding: 0.4rem 0.6rem; border-radius: 10px; border: 2px solid var(--pop);
    background: var(--pop-soft); font-size: 0.9rem;
  }
  .state, .note { margin: 0; }
  .note { white-space: pre-line; font-style: italic; }
  .actions { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; margin-top: auto; }
  button.big { font-size: 1.15rem; padding: 0.7rem 1.6rem; min-width: 9rem; justify-content: center; }

  .closed-day { text-align: center; padding: 2.5rem 1rem; }
  .closed-day img { width: 5rem; height: 5rem; }
  .closed-day .big { font-size: 1.2rem; font-weight: 800; }

  .pick { list-style: none; margin: 0.6rem 0 0; padding: 0; max-height: 18rem; overflow: auto; }
  .pick button { width: 100%; justify-content: flex-start; }
  input[type='search'] { width: 100%; }
  @media (max-width: 700px) { .stats { grid-template-columns: 1fr; } }
</style>

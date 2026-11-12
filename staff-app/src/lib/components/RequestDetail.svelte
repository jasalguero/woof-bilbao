<script lang="ts">
  import { onMount } from 'svelte';
  import type { Dog, Owner } from '#lib/types.ts';
  import type { RequestWithHandler, AcceptMode } from '#lib/api/requests.ts';
  import { acceptRequest, declineRequest } from '#lib/api/requests.ts';
  import { createOwner, findOwnerByEmail, listOwnerDogs, searchOwners } from '#lib/api/owners.ts';
  import { createDog } from '#lib/api/dogs.ts';
  import { listClosedDays } from '#lib/api/settings.ts';
  import {
    bookingFromPayload, dogFromPayload, matchDogByName, ownerFromPayload, parsePayload
  } from '#lib/logic/prefill.ts';
  import { expandBookingDays, isValidIso } from '#lib/logic/dates.ts';
  import { classifyError } from '#lib/logic/errors.ts';
  import { t, fmtDate, fmtDateTime, fmtWeekdays } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';
  import OwnerFields from './OwnerFields.svelte';
  import DogFields from './DogFields.svelte';
  import WeekdayPicker from './WeekdayPicker.svelte';
  import FullDaysDialog from './FullDaysDialog.svelte';
  import Modal from './Modal.svelte';
  import StatusBadge from './StatusBadge.svelte';

  let { request, onhandled }: { request: RequestWithHandler; onhandled: () => void } = $props();

  // The parent re-creates this component per request ({#key}), so reading the
  // prop once here is intended.
  // svelte-ignore state_referenced_locally
  const payload = parsePayload(request.payload);
  // svelte-ignore state_referenced_locally
  const isNew = request.status === 'new';

  let suggested = $state<Owner | null>(null);
  let ownerChoice = $state<'suggested' | 'other' | 'new'>('new');
  let otherOwner = $state<Owner | null>(null);
  let ownerQuery = $state('');
  let ownerResults = $state<Owner[]>([]);
  // svelte-ignore state_referenced_locally
  let newOwner = $state(ownerFromPayload(payload, request.created_at));

  let dogs = $state<Dog[]>([]);
  let dogChoice = $state<string>('new');
  let newDog = $state(dogFromPayload(payload));

  let booking = $state(bookingFromPayload(payload));
  let closed = $state<Set<string>>(new Set());

  let busy = $state(false);
  let fullDays = $state<string[] | null>(null);
  let confirmAction = $state<'declined' | 'spam' | null>(null);
  // The dog the last "Accept" used, so "Confirm anyway"/"Leave as pending" reuse it.
  let acceptDogId = '';

  const ownerId = $derived(
    ownerChoice === 'suggested' ? (suggested?.id ?? null) : ownerChoice === 'other' ? (otherOwner?.id ?? null) : null
  );
  const bookable = $derived(expandBookingDays(booking.start_date, booking.end_date, booking.weekdays, closed));

  onMount(async () => {
    if (!isNew) return;
    try {
      const [owner, closedRows] = await Promise.all([findOwnerByEmail(payload.owner.email), listClosedDays()]);
      closed = new Set(closedRows.map((r) => r.day).filter((d): d is string => d !== null));
      if (owner) {
        suggested = owner;
        ownerChoice = 'suggested';
      }
    } catch (e) {
      fail(e);
    }
  });

  // Load the chosen owner's dogs and preselect the one named in the form.
  $effect(() => {
    const id = ownerId;
    dogs = [];
    dogChoice = 'new';
    if (!id) return;
    listOwnerDogs(id)
      .then((list) => {
        if (id !== ownerId) return;
        dogs = list;
        dogChoice = matchDogByName(list, payload.dog.name)?.id ?? 'new';
      })
      .catch(fail);
  });

  let searchTimer: ReturnType<typeof setTimeout>;
  function onOwnerSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try {
        ownerResults = await searchOwners(ownerQuery);
      } catch (e) {
        fail(e);
      }
    }, 250);
  }

  async function accept() {
    if (ownerChoice !== 'new' && !ownerId) return fail({ message: t('requests.chooseOwner') });
    if (!isValidIso(booking.start_date) || !isValidIso(booking.end_date) || booking.end_date < booking.start_date || !booking.weekdays.length) {
      return fail({ message: t('requests.badDates') });
    }
    busy = true;
    try {
      // Create the owner and dog first; on a retry (e.g. after "no room") they
      // are reused because the choice switches to the created records.
      let oid = ownerId;
      if (ownerChoice === 'new') {
        const created = await createOwner({ ...newOwner, email: newOwner.email.trim() });
        suggested = created;
        ownerChoice = 'suggested';
        oid = created.id;
      }
      let did = dogChoice;
      if (did === 'new') {
        const created = await createDog({ ...newDog, owner_id: oid! });
        dogs = [...dogs, created];
        did = created.id;
        dogChoice = created.id;
      }
      acceptDogId = did;
      await run('confirm');
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  async function run(mode: AcceptMode) {
    busy = true;
    try {
      const b = await acceptRequest({
        requestId: request.id,
        dogId: acceptDogId,
        start: booking.start_date,
        end: booking.end_date,
        weekdays: booking.weekdays,
        mode
      });
      fullDays = null;
      ok(b.status === 'confirmed' ? t('requests.accepted') : t('requests.acceptedPending'));
      onhandled();
    } catch (e) {
      const known = classifyError(e);
      if (known.kind === 'full_days' && mode === 'confirm') fullDays = known.days;
      else fail(e);
    } finally {
      busy = false;
    }
  }

  async function decline(status: 'declined' | 'spam') {
    busy = true;
    try {
      await declineRequest(request.id, status);
      confirmAction = null;
      ok(status === 'spam' ? t('requests.markedSpam') : t('requests.declined'));
      onhandled();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }
</script>

<article class="stack">
  <header class="row">
    <div>
      <h2>{payload.owner.name || payload.owner.email} · {payload.dog.name}</h2>
      <p class="muted small">{t('requests.received', { when: fmtDateTime(request.created_at) })}</p>
    </div>
    <span class="spacer"></span>
    <StatusBadge status={request.status} />
  </header>

  {#if !isNew}
    <p class="muted">
      {t('requests.handledBy', { name: request.handler?.full_name ?? '–', when: fmtDateTime(request.handled_at) })}
      {#if request.booking}
        · <StatusBadge status={request.booking.status} /> <a href="/dogs/{request.booking.dog_id}">{t('requests.openBooking')}</a>
      {/if}
    </p>
  {/if}

  <section class="card">
    <h3>{t('requests.form')}</h3>
    <dl class="payload">
      <dt>{t('requests.formOwner')}</dt>
      <dd>{payload.owner.name}<br /><span class="muted">{payload.owner.email} · {payload.owner.phone} · {t(`lang.${payload.lang}` as MessageKey)}</span></dd>
      <dt>{t('requests.formDog')}</dt>
      <dd>
        <strong>{payload.dog.name}</strong>
        {#if payload.dog.breed}· {payload.dog.breed}{/if}
        {#if payload.dog.age}· {payload.dog.age}{/if}
        · {t(payload.dog.size ? (`size.${payload.dog.size}` as MessageKey) : 'size.none')}
        · {t(payload.dog.sex ? (`sex.${payload.dog.sex}` as MessageKey) : 'sex.none')}
        {#if payload.dog.neutered}· {t('dogs.neutered')}{/if}
        <br /><span class="muted">{t('requests.vaccinated')}: {payload.dog.vaccinated ? t('common.yes') : t('common.no')}</span>
      </dd>
      {#if payload.dog.medical}<dt>{t('requests.medical')}</dt><dd>{payload.dog.medical}</dd>{/if}
      {#if payload.dog.preferences}<dt>{t('requests.preferences')}</dt><dd>{payload.dog.preferences}</dd>{/if}
      <dt>{t('requests.formDates')}</dt>
      <dd>{fmtDate(payload.dates.from)} – {fmtDate(payload.dates.to)} · {fmtWeekdays(payload.dates.weekdays)}</dd>
      {#if payload.notes}<dt>{t('common.notes')}</dt><dd>{payload.notes}</dd>{/if}
      <dt>{t('requests.consent')}</dt><dd>{payload.consent ? t('common.yes') : t('common.no')}</dd>
    </dl>
  </section>

  {#if isNew}
    <section class="card stack">
      <h3>{t('requests.step1')}</h3>
      {#if suggested}
        <label class="check"><input type="radio" bind:group={ownerChoice} value="suggested" />
          {t('requests.useOwner', { name: suggested.full_name, email: suggested.email })}</label>
      {/if}
      <label class="check"><input type="radio" bind:group={ownerChoice} value="other" /> {t('requests.otherOwner')}</label>
      {#if ownerChoice === 'other'}
        <div class="indent stack">
          <input type="search" placeholder={t('requests.ownerSearch')} bind:value={ownerQuery} oninput={onOwnerSearch} />
          {#each ownerResults as o (o.id)}
            <label class="check"><input type="radio" name="other-owner" checked={otherOwner?.id === o.id} onchange={() => (otherOwner = o)} />
              {o.full_name} <span class="muted">({o.email})</span></label>
          {/each}
        </div>
      {/if}
      <label class="check"><input type="radio" bind:group={ownerChoice} value="new" /> {t('requests.newOwner')}</label>
      {#if ownerChoice === 'new'}
        <div class="indent"><OwnerFields bind:owner={newOwner} /></div>
      {/if}
    </section>

    <section class="card stack">
      <h3>{t('requests.step2')}</h3>
      {#each dogs as d (d.id)}
        <label class="check"><input type="radio" bind:group={dogChoice} value={d.id} />
          <strong>{d.name}</strong> <span class="muted">{d.breed ?? ''} {d.size ? t(`size.${d.size}` as MessageKey) : ''}</span></label>
      {/each}
      <label class="check"><input type="radio" bind:group={dogChoice} value="new" /> {t('requests.newDog')}</label>
      {#if dogChoice === 'new'}
        <div class="indent"><DogFields bind:dog={newDog} /></div>
      {/if}
    </section>

    <section class="card stack">
      <h3>{t('requests.step3')}</h3>
      <div class="row">
        <label class="field"><span>{t('common.from')}</span><input type="date" bind:value={booking.start_date} /></label>
        <label class="field"><span>{t('common.to')}</span><input type="date" bind:value={booking.end_date} /></label>
        <div class="field"><span class="muted small"><strong>{t('common.weekdays')}</strong></span><WeekdayPicker bind:value={booking.weekdays} /></div>
      </div>
      <p class="muted small">{t('requests.bookableDays', { n: bookable.length })}</p>
    </section>

    <div class="row actions">
      <button class="danger" disabled={busy} onclick={() => (confirmAction = 'spam')}>{t('requests.spam')}</button>
      <button disabled={busy} onclick={() => (confirmAction = 'declined')}>{t('requests.decline')}</button>
      <span class="spacer"></span>
      <button class="primary" disabled={busy} onclick={accept}>{t('requests.accept')}</button>
    </div>
  {/if}
</article>

{#if fullDays}
  <FullDaysDialog
    days={fullDays}
    {busy}
    onoverbook={() => run('overbook')}
    onpending={() => run('pending')}
    oncancel={() => (fullDays = null)}
  />
{/if}

{#if confirmAction}
  <Modal title={confirmAction === 'spam' ? t('requests.spam') : t('requests.decline')} onclose={() => (confirmAction = null)}>
    <p>{confirmAction === 'spam' ? t('requests.confirmSpam') : t('requests.confirmDecline')}</p>
    {#snippet actions()}
      <button class="quiet" onclick={() => (confirmAction = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" onclick={() => decline(confirmAction!)} disabled={busy}>
        {confirmAction === 'spam' ? t('requests.spam') : t('requests.decline')}
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  .payload { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 1rem; margin: 0; }
  .payload dt { font-weight: 800; color: var(--muted); font-size: 0.85rem; padding-top: 0.1rem; }
  .payload dd { margin: 0; }
  .indent { margin-left: 1.6rem; }
  label.check { display: flex; }
  .indent input[type='search'] { width: min(24rem, 100%); }
  .actions { position: sticky; bottom: 0; background: var(--bg); padding: 0.6rem 0; }
  .field span { display: block; margin-bottom: 0.2rem; }
</style>

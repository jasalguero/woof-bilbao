<script lang="ts">
  // An owner's account on their page: balance, packs, charges and payments.
  // Everyone records payments, sells packs and sends a soft reminder; admins
  // also refund, correct, edit and delete. Owing never blocks anything.
  import Modal from './Modal.svelte';
  import PaymentDialog from './PaymentDialog.svelte';
  import PackDialog from './PackDialog.svelte';
  import {
    addCorrection, chargeOwnerDays, deletePayment, getBalance, getOwing, listCharges, listPacks, listPayments, pricesOn,
    recordRefund, sendBalanceReminder, updatePayment, voidCharge, PAYMENT_METHODS,
    type ChargeWithDog, type PaymentWithStaff
  } from '#lib/api/payments.ts';
  import { isAdmin } from '#lib/session.svelte.ts';
  import { i18n, t, fmtDate, fmtDateTime } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import { centsToInput, formatMoney, parseEuros } from '#lib/logic/money.ts';
  import { todayIso } from '#lib/logic/dates.ts';
  import type { Owner, OwnerBalance, PackBalance, PaymentMethod, PriceList } from '#lib/types.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';

  let { owner }: { owner: Owner } = $props();

  let balance = $state<OwnerBalance | null>(null);
  let charges = $state<ChargeWithDog[]>([]);
  /** What each charge still owes (a payment pays its ticked items, the rest goes oldest first). */
  let owing = $state<Map<string, number>>(new Map());
  let payments = $state<PaymentWithStaff[]>([]);
  let packs = $state<PackBalance[]>([]);
  let prices = $state<PriceList | null>(null);
  let busy = $state(false);
  let showAll = $state(false);

  let paying = $state(false);
  let selling = $state(false);
  let reminding = $state(false);
  let refund = $state<{ amount: string; method: PaymentMethod; note: string; refundOf: string | null } | null>(null);
  let correction = $state<{ amount: string; reason: string } | null>(null);
  let editing = $state<{ id: string; amount: string; method: PaymentMethod; note: string } | null>(null);
  let deleting = $state<PaymentWithStaff | null>(null);
  let voiding = $state<{ charge: ChargeWithDog; reason: string } | null>(null);

  const lang = $derived(i18n.lang);
  const today = todayIso();
  const owes = $derived(balance?.balance_cents ?? 0);
  const open = $derived(
    charges.filter((c) => !c.voided_at && (owing.get(c.id) ?? 0) > 0)
      .sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at))
  );
  const shownCharges = $derived(showAll ? charges : charges.slice(0, 15));
  const shownPayments = $derived(showAll ? payments : payments.slice(0, 10));

  let token = 0;
  async function load(charge = false) {
    const mine = ++token;
    try {
      // Bring today's (and any missed) days onto the account first.
      if (charge) await chargeOwnerDays(owner.id);
      const [b, c, o, p, k, pr] = await Promise.all([
        getBalance(owner.id), listCharges(owner.id), getOwing(owner.id), listPayments(owner.id), listPacks(owner.id), pricesOn()
      ]);
      if (mine !== token) return;
      [balance, charges, owing, payments, packs, prices] = [b, c, o, p, k, pr];
    } catch (e) {
      if (mine === token) fail(e);
    }
  }

  $effect(() => {
    void owner.id;
    load(true);
  });

  async function act(fn: () => Promise<unknown>, message: string) {
    busy = true;
    try {
      await fn();
      ok(message);
      refund = correction = editing = deleting = voiding = null;
      reminding = false;
      await load();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  function chargeLabel(c: ChargeWithDog): string {
    if (c.kind === 'day') return c.dog?.name ?? t('charge.kind.day');
    if (c.kind === 'pack' && c.pack) return t('account.packLabel', { n: c.pack.days_total });
    const kind = t(`charge.kind.${c.kind}` as MessageKey);
    return c.description ? `${kind} · ${c.description}` : kind;
  }

  // A refund gives back (part of) one payment, never more than was paid.
  function openRefund() {
    const first = payments.find((p) => p.kind === 'payment' && p.status === 'succeeded');
    refund = { amount: '', method: first?.method ?? 'cash', note: '', refundOf: first?.id ?? null };
  }

  const refundAmount = $derived(refund ? parseEuros(refund.amount) : null);
  const correctionAmount = $derived(correction ? parseEuros(correction.amount, true) : null);
  const editAmount = $derived(editing ? parseEuros(editing.amount) : null);
</script>

<section class="card stack account">
  <div class="row">
    <h2>{t('account.title')}</h2>
    {#if owes > 0}
      <span class="badge warn big" data-testid="balance">{t('account.owes', { amount: formatMoney(lang, owes) })}</span>
    {:else if owes < 0}
      <span class="badge confirmed big" data-testid="balance">{t('account.credit', { amount: formatMoney(lang, -owes) })}</span>
    {:else}
      <span class="badge confirmed big" data-testid="balance">{t('account.settled')}</span>
    {/if}
    <span class="spacer"></span>
    <button class="primary" onclick={() => (paying = true)} disabled={busy}>{t('account.recordPayment')}</button>
    <button onclick={() => (selling = true)} disabled={busy || !prices}>{t('account.sellPack')}</button>
    {#if owes > 0}
      <button class="quiet" onclick={() => (reminding = true)} disabled={busy || !owner.email}>{t('account.sendReminder')}</button>
    {/if}
    {#if isAdmin()}
      <button class="quiet" onclick={() => openRefund()} disabled={busy}>{t('account.refund')}</button>
      <button class="quiet" onclick={() => (correction = { amount: '', reason: '' })} disabled={busy}>{t('account.correction')}</button>
    {/if}
  </div>
  {#if balance && balance.unpaid_days && balance.oldest_unpaid_day}
    <p class="small">{t('account.unpaidDays', { n: balance.unpaid_days, since: fmtDate(balance.oldest_unpaid_day) })}
      <span class="muted">· {t('account.softNote')}</span></p>
  {/if}

  <div class="cols">
    <div>
      <h3>{t('account.packs')}</h3>
      {#if packs.length === 0}
        <p class="muted small">{t('account.noPacks')}</p>
      {:else}
        <ul class="plain">
          {#each packs as p (p.id)}
            {@const expired = (p.expires_on ?? '') < today}
            <li class:muted={expired || !p.days_left}>
              <strong>{t('account.daysLeft', { left: p.days_left ?? 0, total: p.days_total ?? 0 })}</strong>
              <span class="small">· {expired ? t('account.expired') : t('account.expires', { date: fmtDate(p.expires_on) })}
                · {formatMoney(lang, p.total_cents)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div>
      <h3>{t('account.payments')}</h3>
      {#if payments.length === 0}
        <p class="muted small">{t('account.noPayments')}</p>
      {:else}
        <table class="small">
          <tbody>
            {#each shownPayments as p (p.id)}
              <tr>
                <td>{fmtDateTime(p.paid_at)}</td>
                <td>
                  {t(`method.${p.method}` as MessageKey)}
                  {#if p.kind === 'refund'}<span class="badge cancelled">{t('account.refundTag')}</span>{/if}
                  {#if p.status !== 'succeeded'}<span class="badge pending">{t(`account.status.${p.status}` as MessageKey)}</span>{/if}
                  {#if p.provider !== 'manual'}<span class="muted">({p.provider})</span>{/if}
                  {#if p.note}<br /><span class="muted">{p.note}</span>{/if}
                  {#if p.staff}<br /><span class="muted">{t('account.by', { name: p.staff.full_name })}</span>{/if}
                </td>
                <td class="num">{p.kind === 'refund' ? '−' : ''}{formatMoney(lang, p.amount_cents)}</td>
                {#if isAdmin()}
                  <td class="num nowrap">
                    <button class="quiet" disabled={busy} onclick={() => (editing = { id: p.id, amount: centsToInput(lang, p.amount_cents), method: p.method, note: p.note ?? '' })}>{t('common.edit')}</button>
                    <button class="quiet danger" disabled={busy} onclick={() => (deleting = p)}>{t('common.delete')}</button>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>

  <h3>{t('account.charges')}</h3>
  {#if charges.length === 0}
    <p class="muted small">{t('account.noCharges')}</p>
  {:else}
    <table class="small">
      <thead>
        <tr><th>{t('common.date')}</th><th></th><th class="num">{t('pay.unitPrice')}</th><th class="num">{t('common.total')}</th><th>{t('common.status')}</th>{#if isAdmin()}<th></th>{/if}</tr>
      </thead>
      <tbody>
        {#each shownCharges as c (c.id)}
          <tr class:muted={Boolean(c.voided_at)}>
            <td>{fmtDate(c.day)}</td>
            <td>
              {chargeLabel(c)}
              {#if c.walk_in}<span class="badge">{t('account.walkIn')}</span>{/if}
              {#if Number(c.discount_pct) > 0}<span class="muted">−{Number(c.discount_pct)} %</span>{/if}
            </td>
            <td class="num">{c.pack_id && c.kind === 'day' ? '' : formatMoney(lang, c.unit_price_cents)}</td>
            <td class="num">{formatMoney(lang, c.total_cents)}</td>
            <td>
              {#if c.voided_at}<span class="badge cancelled" title={c.void_reason ?? ''}>{t('account.voided')}</span>
              {:else if c.kind === 'day' && c.pack_id}<span class="badge confirmed">{t('account.coveredByPack')}</span>
              {:else if (c.total_cents ?? 0) > 0}
                {@const left = owing.get(c.id) ?? 0}
                {#if left === 0}<span class="badge confirmed">{t('account.paid')}</span>
                {:else if left < (c.total_cents ?? 0)}<span class="badge pending">{t('account.partPaid', { amount: formatMoney(lang, left) })}</span>
                {:else}<span class="badge pending">{t('account.unpaid')}</span>
                {/if}
              {/if}
            </td>
            {#if isAdmin()}
              <td class="num">{#if !c.voided_at}<button class="quiet danger" disabled={busy} onclick={() => (voiding = { charge: c, reason: '' })}>{t('account.void')}</button>{/if}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if charges.length > 15 || payments.length > 10}
    <button class="quiet" onclick={() => (showAll = !showAll)}>{showAll ? t('account.onlyRecent') : t('account.showAll')}</button>
  {/if}
</section>

{#if paying}
  <PaymentDialog ownerId={owner.id} ownerName={owner.full_name} {open} {owing} secondDogPct={Number(prices?.second_dog_discount_pct ?? 0)}
    onclose={() => (paying = false)} ondone={() => { paying = false; load(); }} />
{/if}

{#if selling && prices}
  <PackDialog ownerId={owner.id} ownerName={owner.full_name} {prices}
    onclose={() => (selling = false)} ondone={() => { selling = false; load(); }} />
{/if}

{#if reminding}
  <Modal title={t('account.sendReminder')} onclose={() => (reminding = false)}>
    <p>{t('account.confirmReminder', { email: owner.email, amount: formatMoney(lang, owes) })}</p>
    {#snippet actions()}
      <button class="quiet" onclick={() => (reminding = false)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" disabled={busy} onclick={() => act(() => sendBalanceReminder(owner.id), t('account.reminderSent'))}>{t('account.sendReminder')}</button>
    {/snippet}
  </Modal>
{/if}

{#if refund}
  {@const r = refund}
  <Modal title={t('refund.title')} onclose={() => (refund = null)}>
    <div class="stack">
      <p class="muted small">{t('refund.hint')}</p>
      <div class="grid2">
        <label class="field"><span>{t('common.amount')}</span><input inputmode="decimal" bind:value={r.amount} /></label>
        <label class="field"><span>{t('common.method')}</span>
          <select bind:value={r.method}>{#each PAYMENT_METHODS as m (m)}<option value={m}>{t(`method.${m}` as MessageKey)}</option>{/each}</select>
        </label>
      </div>
      <label class="field"><span>{t('refund.of')}</span>
        <select bind:value={r.refundOf} required>
          {#each payments.filter((p) => p.kind === 'payment' && p.status === 'succeeded') as p (p.id)}
            <option value={p.id}>{fmtDate(p.paid_at)} · {t(`method.${p.method}` as MessageKey)} · {formatMoney(lang, p.amount_cents)}</option>
          {/each}
        </select>
      </label>
      <label class="field"><span>{t('common.note')}</span><input bind:value={r.note} maxlength="500" /></label>
    </div>
    {#snippet actions()}
      <button class="quiet" onclick={() => (refund = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" disabled={busy || refundAmount === null || refundAmount <= 0 || !r.refundOf}
        onclick={() => act(() => recordRefund({ ownerId: owner.id, amountCents: refundAmount!, method: r.method, refundOf: r.refundOf!, note: r.note.trim() }), t('refund.done'))}>
        {t('account.refund')}
      </button>
    {/snippet}
  </Modal>
{/if}

{#if correction}
  {@const c = correction}
  <Modal title={t('correction.title')} onclose={() => (correction = null)}>
    <div class="stack">
      <p class="muted small">{t('correction.hint')}</p>
      <label class="field"><span>{t('common.amount')}</span><input inputmode="decimal" bind:value={c.amount} placeholder="-10,00" /></label>
      <label class="field"><span>{t('correction.reason')}</span><input bind:value={c.reason} maxlength="200" required /></label>
    </div>
    {#snippet actions()}
      <button class="quiet" onclick={() => (correction = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" disabled={busy || correctionAmount === null || correctionAmount === 0 || !c.reason.trim()}
        onclick={() => act(() => addCorrection(owner.id, correctionAmount!, c.reason.trim()), t('correction.done'))}>
        {t('common.save')}
      </button>
    {/snippet}
  </Modal>
{/if}

{#if editing}
  {@const e = editing}
  <Modal title={t('payEdit.title')} onclose={() => (editing = null)}>
    <div class="grid2">
      <label class="field"><span>{t('common.amount')}</span><input inputmode="decimal" bind:value={e.amount} /></label>
      <label class="field"><span>{t('common.method')}</span>
        <select bind:value={e.method}>{#each PAYMENT_METHODS as m (m)}<option value={m}>{t(`method.${m}` as MessageKey)}</option>{/each}</select>
      </label>
    </div>
    <label class="field"><span>{t('common.note')}</span><input bind:value={e.note} maxlength="500" /></label>
    {#snippet actions()}
      <button class="quiet" onclick={() => (editing = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" disabled={busy || editAmount === null || editAmount <= 0}
        onclick={() => act(() => updatePayment(e.id, { amount_cents: editAmount!, method: e.method, note: e.note.trim() || null }), t('common.saved'))}>
        {t('common.save')}
      </button>
    {/snippet}
  </Modal>
{/if}

{#if deleting}
  {@const p = deleting}
  <Modal title={t('common.delete')} onclose={() => (deleting = null)}>
    <p>{t('account.confirmDeletePayment')}</p>
    <p class="muted">{fmtDateTime(p.paid_at)} · {t(`method.${p.method}` as MessageKey)} · {formatMoney(lang, p.amount_cents)}</p>
    {#snippet actions()}
      <button class="quiet" onclick={() => (deleting = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" disabled={busy} onclick={() => act(() => deletePayment(p.id), t('common.saved'))}>{t('common.delete')}</button>
    {/snippet}
  </Modal>
{/if}

{#if voiding}
  {@const v = voiding}
  <Modal title={t('account.void')} onclose={() => (voiding = null)}>
    <p>{t('account.confirmVoid')}</p>
    <p class="muted">{fmtDate(v.charge.day)} · {chargeLabel(v.charge)} · {formatMoney(lang, v.charge.total_cents)}</p>
    <label class="field"><span>{t('account.voidReason')}</span><input bind:value={v.reason} maxlength="200" /></label>
    {#snippet actions()}
      <button class="quiet" onclick={() => (voiding = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" disabled={busy} onclick={() => act(() => voidCharge(v.charge.id, v.reason.trim()), t('common.saved'))}>{t('account.void')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .account { margin-bottom: 1rem; }
  .big { font-size: 0.9rem; padding: 0.15rem 0.7rem; }
  .cols { display: grid; grid-template-columns: 1fr 2fr; gap: 1rem; align-items: start; }
  @media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
  .plain { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .num { text-align: right; white-space: nowrap; }
  .nowrap { white-space: nowrap; }
</style>

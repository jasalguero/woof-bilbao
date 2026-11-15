<script lang="ts">
  // Record money received from an owner (any staff member). Staff tick the
  // items being paid; an unpaid day's price and discount can be changed on
  // the fly (a special price, the second-dog discount; up to half off, more
  // needs an admin). The amount defaults to what is ticked and must cover it;
  // a part payment ticks nothing and goes to the oldest items first.
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import { recordPayment, PAYMENT_METHODS, type ChargeWithDog, type PriceOverride } from '#lib/api/payments.ts';
  import { i18n, t, fmtDate } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import { centsToInput, formatMoney, formatPct, lineTotals, parseEuros, parsePct } from '#lib/logic/money.ts';
  import { todayIso } from '#lib/logic/dates.ts';
  import type { PaymentMethod } from '#lib/types.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';

  let {
    ownerId, ownerName, open, owing, secondDogPct = 0, ondone, onclose
  }: {
    ownerId: string;
    ownerName: string;
    /** Charges that still owe something, oldest first. */
    open: ChargeWithDog[];
    /** What each charge still owes. */
    owing: Map<string, number>;
    secondDogPct?: number;
    ondone: () => void;
    onclose: () => void;
  } = $props();

  interface Row {
    charge: ChargeWithDog;
    /** Already paid of this charge (a part payment). */
    paid: number;
    picked: boolean;
    unit: string;
    discount: string;
  }

  const lang = i18n.lang;
  // The dialog works on the charges as they were when it opened.
  let rows = $state<Row[]>(
    untrack(() => open).map((c) => ({
      charge: c,
      paid: (c.total_cents ?? 0) - (untrack(() => owing).get(c.id) ?? 0),
      picked: true,
      unit: centsToInput(lang, c.unit_price_cents),
      discount: String(Number(c.discount_pct))
    }))
  );
  let method = $state<PaymentMethod>('cash');
  let paidOn = $state(todayIso());
  let note = $state('');
  let busy = $state(false);

  // An unpaid day without a pack can be repriced; packs, corrections and
  // part-paid items cannot.
  const editable = (r: Row) => r.charge.kind === 'day' && !r.charge.pack_id && r.paid === 0;

  /** What a row still owes (with the price as edited). */
  function rowTotal(r: Row): number | null {
    if (!editable(r)) return (r.charge.total_cents ?? 0) - r.paid;
    const unit = parseEuros(r.unit);
    const disc = parsePct(r.discount);
    if (unit === null || disc === null) return null;
    return lineTotals(unit, disc, Number(r.charge.vat_rate)).total;
  }

  const selectedTotal = $derived(
    rows.filter((r) => r.picked).reduce((sum, r) => sum + (rowTotal(r) ?? 0), 0)
  );
  const invalidRow = $derived(rows.some((r) => r.picked && rowTotal(r) === null));

  let amountText = $state('');
  let amountTouched = $state(false);
  $effect(() => {
    if (!amountTouched) amountText = centsToInput(lang, Math.max(selectedTotal, 0));
  });
  const amount = $derived(parseEuros(amountText));
  const anyPicked = $derived(rows.some((r) => r.picked));
  const differs = $derived(amount !== null && anyPicked && amount > selectedTotal);
  const short = $derived(amount !== null && anyPicked && amount < selectedTotal);

  function label(c: ChargeWithDog): string {
    const kind = t(`charge.kind.${c.kind}` as MessageKey);
    if (c.kind === 'day') return c.dog?.name ?? kind;
    if (c.kind === 'pack' && c.pack) return t('account.packLabel', { n: c.pack.days_total });
    return c.description ? `${kind} · ${c.description}` : kind;
  }

  async function save() {
    if (amount === null || amount <= 0 || invalidRow || short) return;
    const picked = rows.filter((r) => r.picked);
    const overrides: PriceOverride[] = [];
    for (const r of picked) {
      if (!editable(r)) continue;
      const unit = parseEuros(r.unit)!;
      const disc = parsePct(r.discount)!;
      if (unit !== r.charge.unit_price_cents || disc !== Number(r.charge.discount_pct)) {
        overrides.push({ id: r.charge.id, unit_price_cents: unit, discount_pct: disc });
      }
    }
    busy = true;
    try {
      await recordPayment({
        ownerId,
        amountCents: amount,
        method,
        chargeIds: picked.map((r) => r.charge.id),
        overrides,
        // Today: the exact time; another day: midday that day (Bilbao is UTC+1/+2).
        paidAt: paidOn === todayIso() ? undefined : `${paidOn}T12:00:00`,
        note: note.trim()
      });
      ok(t('pay.done'));
      ondone();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={t('pay.title', { name: ownerName })} {onclose} wide>
  <div class="stack">
    <h3>{t('pay.pick')}</h3>
    {#if rows.length === 0}
      <p class="muted">{t('pay.noOpen')}</p>
    {:else}
      <div class="scroll">
        <table>
          <thead>
            <tr><th></th><th>{t('common.date')}</th><th></th><th>{t('pay.unitPrice')}</th><th>{t('pay.discount')}</th><th class="num">{t('common.total')}</th></tr>
          </thead>
          <tbody>
            {#each rows as r (r.charge.id)}
              {@const total = rowTotal(r)}
              <tr>
                <td><input type="checkbox" bind:checked={r.picked} aria-label={label(r.charge)} /></td>
                <td>{fmtDate(r.charge.day, { day: 'numeric', month: 'short' })}</td>
                <td>{label(r.charge)}{#if r.charge.walk_in} <span class="badge">{t('account.walkIn')}</span>{/if}</td>
                {#if editable(r)}
                  <td><input class="money" inputmode="decimal" bind:value={r.unit} disabled={!r.picked} aria-label={t('pay.unitPrice')} /></td>
                  <td><input class="pct" inputmode="decimal" bind:value={r.discount} disabled={!r.picked} aria-label={t('pay.discount')} /></td>
                {:else}
                  <td></td><td></td>
                {/if}
                <td class="num">
                  {total === null ? '?' : formatMoney(lang, total)}
                  {#if r.paid > 0}<br /><span class="muted small">{t('pay.leftOf', { amount: formatMoney(lang, r.charge.total_cents) })}</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small"><strong>{t('pay.selectedTotal', { amount: formatMoney(lang, selectedTotal) })}</strong></p>
      {#if secondDogPct > 0}<p class="muted small">{t('pay.secondDogHint', { pct: formatPct(lang, secondDogPct) })}</p>{/if}
    {/if}

    <div class="grid2">
      <label class="field"><span>{t('pay.amount')}</span>
        <input inputmode="decimal" bind:value={amountText} oninput={() => (amountTouched = true)} required />
      </label>
      <label class="field"><span>{t('common.method')}</span>
        <select bind:value={method}>
          {#each PAYMENT_METHODS as m (m)}<option value={m}>{t(`method.${m}` as MessageKey)}</option>{/each}
        </select>
      </label>
      <label class="field"><span>{t('pay.paidOn')}</span>
        <input type="date" bind:value={paidOn} max={todayIso()} required />
      </label>
    </div>
    <label class="field"><span>{t('common.note')}</span><input bind:value={note} maxlength="500" /></label>
    {#if amount === null && amountText.trim()}<p class="error small">{t('pay.badAmount')}</p>{/if}
    {#if differs}<p class="muted small">{t('pay.differs')}</p>{/if}
    {#if short}<p class="error small">{t('pay.short')}</p>{/if}
  </div>
  {#snippet actions()}
    <button class="quiet" onclick={onclose} disabled={busy}>{t('common.cancel')}</button>
    <button class="primary" onclick={save} disabled={busy || amount === null || amount <= 0 || invalidRow || short || !paidOn}>
      {t('account.recordPayment')}
    </button>
  {/snippet}
</Modal>

<style>
  .scroll { max-height: 18rem; overflow: auto; }
  .money { width: 6rem; }
  .pct { width: 4rem; }
  .num { text-align: right; white-space: nowrap; }
  .error { color: var(--danger); }
</style>

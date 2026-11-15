<script lang="ts">
  // Sell a pack (any staff member), paid upfront. Starts from the prices in
  // force today; staff can change days, price, VAT and expiry for this sale.
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import { sellPack, PAYMENT_METHODS } from '#lib/api/payments.ts';
  import { i18n, t } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import { centsToInput, formatMoney, lineTotals, packExpiry, parseEuros, parsePct } from '#lib/logic/money.ts';
  import { todayIso } from '#lib/logic/dates.ts';
  import type { PaymentMethod, PriceList } from '#lib/types.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';

  let { ownerId, ownerName, prices, ondone, onclose }: {
    ownerId: string;
    ownerName: string;
    prices: PriceList;
    ondone: () => void;
    onclose: () => void;
  } = $props();

  const lang = i18n.lang;
  const today = todayIso();
  // The form starts from the prices as they were when it opened.
  const base = untrack(() => prices);
  let days = $state(base.pack_days);
  let priceText = $state(centsToInput(lang, base.pack_price_cents));
  let vatText = $state(String(Number(base.vat_rate)));
  let expires = $state(packExpiry(today, base.pack_valid_months));
  let method = $state<PaymentMethod>('card');
  let note = $state('');
  let busy = $state(false);

  const price = $derived(parseEuros(priceText));
  const vat = $derived(parsePct(vatText));
  const total = $derived(price !== null && vat !== null ? lineTotals(price, 0, vat).total : null);

  let paidText = $state('');
  let paidTouched = $state(false);
  $effect(() => {
    if (!paidTouched && total !== null) paidText = centsToInput(lang, total);
  });
  const paid = $derived(parseEuros(paidText));

  const valid = $derived(
    Number.isInteger(days) && days >= 1 && days <= 100 && price !== null && vat !== null && vat < 100 &&
      paid !== null && paid > 0 && expires >= today
  );

  async function save() {
    if (!valid) return;
    busy = true;
    try {
      // Only send what differs from the price list, so the database applies
      // the same defaults it shows on the website.
      await sellPack({
        ownerId,
        method,
        days: days !== base.pack_days ? days : undefined,
        priceCents: price !== base.pack_price_cents ? price! : undefined,
        vatRate: vat !== Number(base.vat_rate) ? vat! : undefined,
        expiresOn: expires,
        amountCents: paid !== total ? paid! : undefined,
        note: note.trim()
      });
      ok(t('pack.done'));
      ondone();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={t('pack.title', { name: ownerName })} {onclose}>
  <div class="stack">
    <p class="muted small">{t('pack.defaults')}</p>
    <div class="grid2">
      <label class="field"><span>{t('pack.days')}</span><input type="number" min="1" max="100" step="1" bind:value={days} /></label>
      <label class="field"><span>{t('pack.price')}</span><input inputmode="decimal" bind:value={priceText} /></label>
      <label class="field"><span>{t('pack.vat')}</span><input inputmode="decimal" bind:value={vatText} /></label>
      <label class="field"><span>{t('pack.expires')}</span><input type="date" min={today} bind:value={expires} /></label>
    </div>
    <p><strong>{total === null ? t('prices.invalid') : t('pack.total', { amount: formatMoney(lang, total) })}</strong></p>
    <div class="grid2">
      <label class="field"><span>{t('pack.paid')}</span>
        <input inputmode="decimal" bind:value={paidText} oninput={() => (paidTouched = true)} />
      </label>
      <label class="field"><span>{t('common.method')}</span>
        <select bind:value={method}>
          {#each PAYMENT_METHODS as m (m)}<option value={m}>{t(`method.${m}` as MessageKey)}</option>{/each}
        </select>
      </label>
    </div>
    <label class="field"><span>{t('common.note')}</span><input bind:value={note} maxlength="500" /></label>
  </div>
  {#snippet actions()}
    <button class="quiet" onclick={onclose} disabled={busy}>{t('common.cancel')}</button>
    <button class="primary" onclick={save} disabled={busy || !valid}>{t('account.sellPack')}</button>
  {/snippet}
</Modal>

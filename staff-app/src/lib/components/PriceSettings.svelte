<script lang="ts">
  // Admins: the default prices. Each price list applies from its date, so a
  // price rise can be scheduled ahead; past charges and sold packs keep their
  // price. The website reads the list in force (public-prices function).
  import Modal from './Modal.svelte';
  import { deletePriceList, listPriceLists, savePriceList } from '#lib/api/payments.ts';
  import { i18n, t, fmtDate } from '#lib/i18n/index.svelte.ts';
  import { centsToInput, formatMoney, formatPct, parseEuros, parsePct } from '#lib/logic/money.ts';
  import { todayIso } from '#lib/logic/dates.ts';
  import type { PriceList } from '#lib/types.ts';
  import { fail, ok } from '#lib/toast.svelte.ts';

  const today = todayIso();
  const lang = $derived(i18n.lang);
  let lists = $state<PriceList[]>([]);
  let busy = $state(false);
  let deleting = $state<PriceList | null>(null);
  let form = $state({ validFrom: today, day: '', pack: '', packDays: 10, months: 6, vat: '21', second: '0' });

  // Newest first: the first one not in the future is the one in force.
  const current = $derived(lists.find((l) => l.valid_from <= today) ?? null);

  async function load() {
    try {
      lists = await listPriceLists();
      const base = lists.find((l) => l.valid_from <= today) ?? lists[0];
      if (base) {
        form = {
          validFrom: today,
          day: centsToInput(i18n.lang, base.day_price_cents),
          pack: centsToInput(i18n.lang, base.pack_price_cents),
          packDays: base.pack_days,
          months: base.pack_valid_months,
          vat: String(Number(base.vat_rate)),
          second: String(Number(base.second_dog_discount_pct))
        };
      }
    } catch (e) {
      fail(e);
    }
  }

  $effect(() => {
    load();
  });

  const parsed = $derived({
    day: parseEuros(form.day),
    pack: parseEuros(form.pack),
    vat: parsePct(form.vat),
    second: parsePct(form.second)
  });
  const valid = $derived(
    Boolean(form.validFrom) && parsed.day !== null && parsed.pack !== null && parsed.vat !== null && parsed.vat < 100 &&
      parsed.second !== null && Number.isInteger(form.packDays) && form.packDays >= 1 && form.packDays <= 100 &&
      Number.isInteger(form.months) && form.months >= 1 && form.months <= 36
  );

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!valid) return;
    busy = true;
    try {
      await savePriceList({
        valid_from: form.validFrom,
        day_price_cents: parsed.day!,
        pack_price_cents: parsed.pack!,
        pack_days: form.packDays,
        pack_valid_months: form.months,
        vat_rate: parsed.vat!,
        second_dog_discount_pct: parsed.second!
      });
      ok(t('common.saved'));
      await load();
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove(p: PriceList) {
    busy = true;
    try {
      await deletePriceList(p.id);
      deleting = null;
      ok(t('common.saved'));
      await load();
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  function summary(p: PriceList): string {
    return t('prices.summary', {
      day: formatMoney(lang, p.day_price_cents),
      days: p.pack_days,
      pack: formatMoney(lang, p.pack_price_cents),
      months: p.pack_valid_months,
      vat: formatPct(lang, p.vat_rate)
    }) + (Number(p.second_dog_discount_pct) > 0
      ? ' · ' + t('prices.secondShort', { pct: formatPct(lang, p.second_dog_discount_pct) })
      : '');
  }
</script>

<section class="card stack wide" data-testid="price-settings">
  <h2>{t('prices.title')}</h2>
  {#if current}
    <p><strong>{t('prices.current', { date: fmtDate(current.valid_from) })}</strong><br />{summary(current)}</p>
  {:else}
    <p class="muted">{t('prices.none')}</p>
  {/if}
  <p class="muted small">{t('prices.help')}</p>

  <form class="stack" onsubmit={save}>
    <div class="grid2">
      <label class="field"><span>{t('prices.validFrom')}</span><input type="date" bind:value={form.validFrom} required /></label>
      <label class="field"><span>{t('prices.dayPrice')}</span><input inputmode="decimal" bind:value={form.day} required /></label>
      <label class="field"><span>{t('prices.packPrice')}</span><input inputmode="decimal" bind:value={form.pack} required /></label>
      <label class="field"><span>{t('prices.packDays')}</span><input type="number" min="1" max="100" step="1" bind:value={form.packDays} required /></label>
      <label class="field"><span>{t('prices.packMonths')}</span><input type="number" min="1" max="36" step="1" bind:value={form.months} required /></label>
      <label class="field"><span>{t('prices.vat')}</span><input inputmode="decimal" bind:value={form.vat} required /></label>
      <label class="field"><span>{t('prices.secondDog')}</span><input inputmode="decimal" bind:value={form.second} required /></label>
    </div>
    <div class="row">
      {#if !valid}<span class="muted small">{t('prices.invalid')}</span>{/if}
      <span class="spacer"></span>
      <button class="primary" type="submit" disabled={busy || !valid}>{t('prices.saveNew')}</button>
    </div>
  </form>

  {#if lists.length}
    <h3>{t('prices.history')}</h3>
    <table class="small">
      <tbody>
        {#each lists as p (p.id)}
          <tr>
            <td>{fmtDate(p.valid_from)}</td>
            <td>
              {#if p.valid_from > today}<span class="badge pending">{t('prices.scheduled')}</span>
              {:else if p.id === current?.id}<span class="badge confirmed">{t('prices.inForce')}</span>
              {:else}<span class="badge">{t('prices.past')}</span>{/if}
            </td>
            <td>{summary(p)}</td>
            <td class="right">
              {#if p.valid_from > today}
                <button class="quiet danger" disabled={busy} onclick={() => (deleting = p)}>{t('common.delete')}</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

{#if deleting}
  {@const p = deleting}
  <Modal title={t('common.delete')} onclose={() => (deleting = null)}>
    <p>{t('prices.confirmDelete')}</p>
    <p class="muted">{fmtDate(p.valid_from)} · {summary(p)}</p>
    {#snippet actions()}
      <button class="quiet" onclick={() => (deleting = null)} disabled={busy}>{t('common.cancel')}</button>
      <button class="primary" onclick={() => remove(p)} disabled={busy}>{t('common.delete')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .wide { grid-column: 1 / -1; }
  .right { text-align: right; }
</style>

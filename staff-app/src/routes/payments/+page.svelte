<script lang="ts">
  // Admins: the month's income by payment method, what was charged, and who
  // owed what at the end of the month, with CSV export for the accountant.
  import { monthlyReport, type MonthlyReport } from '#lib/api/payments.ts';
  import { isAdmin } from '#lib/session.svelte.ts';
  import { i18n, t, fmtDate, fmtMonth } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import { formatMoney } from '#lib/logic/money.ts';
  import { incomeCsv, incomeTotals, owingCsv } from '#lib/logic/report.ts';
  import { shiftMonth } from '#lib/logic/calendar.ts';
  import { todayIso } from '#lib/logic/dates.ts';
  import { fail, notice } from '#lib/toast.svelte.ts';

  const start = todayIso();
  let year = $state(+start.slice(0, 4));
  let month = $state(+start.slice(5, 7));
  let report = $state<MonthlyReport | null>(null);
  const lang = $derived(i18n.lang);
  const monthIso = $derived(`${year}-${String(month).padStart(2, '0')}`);
  const totals = $derived(report ? incomeTotals(report.income) : null);

  let token = 0;
  $effect(() => {
    if (!isAdmin()) return;
    const mine = ++token;
    const m = `${monthIso}-01`;
    report = null;
    monthlyReport(m)
      .then((r) => mine === token && (report = r))
      .catch((e) => mine === token && fail(e));
  });

  function go(by: number) {
    ({ year, month } = shiftMonth(year, month, by));
  }

  const methodName = (m: string) => t(`method.${m}` as MessageKey);

  async function download(name: string, csv: string) {
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      await navigator.clipboard.writeText(csv);
      notice(t('report.copied'));
    }
  }

  function exportIncome() {
    if (!report) return;
    download(`woof-cobros-${monthIso}.csv`, incomeCsv(lang, monthIso, report.income, {
      month: t('report.month'), method: t('common.method'), payments: t('report.count'), received: t('report.received'),
      refunds: t('report.refunds'), refunded: t('report.refunded'), net: t('report.net'), total: t('common.total')
    }, methodName));
  }

  function exportOwing() {
    if (!report) return;
    download(`woof-deudas-${monthIso}.csv`, owingCsv(lang, monthIso, report.owing, {
      month: t('report.month'), owner: t('common.owner'), email: t('common.email'), phone: t('common.phone'),
      balance: t('report.balance'), unpaidDays: t('report.unpaidDays'), since: t('report.since')
    }));
  }
</script>

<div class="row head">
  <h1>{t('report.title')}</h1>
  <span class="spacer"></span>
  <button class="quiet" aria-label={t('calendar.prev')} onclick={() => go(-1)}>‹</button>
  <strong class="month">{fmtMonth(year, month)}</strong>
  <button class="quiet" aria-label={t('calendar.next')} onclick={() => go(1)}>›</button>
</div>

{#if !isAdmin()}
  <p class="card muted">{t('common.adminOnly')}</p>
{:else if !report}
  <p class="empty">{t('app.loading')}</p>
{:else}
  <div class="cols">
    <section class="card stack">
      <div class="row"><h2>{t('report.income')}</h2><span class="spacer"></span>
        <button onclick={exportIncome}>{t('report.csvIncome')}</button></div>
      {#if report.income.length === 0}
        <p class="muted">{t('report.noIncome')}</p>
      {:else}
        <table>
          <thead><tr><th>{t('common.method')}</th><th class="num">{t('report.count')}</th><th class="num">{t('report.received')}</th><th class="num">{t('report.refunded')}</th><th class="num">{t('report.net')}</th></tr></thead>
          <tbody>
            {#each report.income as r (r.method)}
              <tr><td>{methodName(r.method)}</td><td class="num">{r.payments}</td><td class="num">{formatMoney(lang, r.received_cents)}</td>
                <td class="num">{r.refunded_cents ? '−' + formatMoney(lang, r.refunded_cents) : ''}</td><td class="num">{formatMoney(lang, r.net_cents)}</td></tr>
            {/each}
            {#if totals}
              <tr class="total"><td>{t('common.total')}</td><td class="num">{totals.payments}</td><td class="num">{formatMoney(lang, totals.received_cents)}</td>
                <td class="num">{totals.refunded_cents ? '−' + formatMoney(lang, totals.refunded_cents) : ''}</td><td class="num">{formatMoney(lang, totals.net_cents)}</td></tr>
            {/if}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="card stack">
      <h2>{t('report.charges')}</h2>
      <p class="muted small">{t('report.chargesHelp')}</p>
      {#if report.charges.length === 0}
        <p class="muted">{t('account.noCharges')}</p>
      {:else}
        <table>
          <thead><tr><th></th><th class="num">{t('report.items')}</th><th class="num">{t('report.netCol')}</th><th class="num">{t('report.vatCol')}</th><th class="num">{t('common.total')}</th></tr></thead>
          <tbody>
            {#each report.charges as c (c.kind)}
              <tr><td>{t(`charge.kind.${c.kind}` as MessageKey)}{#if c.pack_days}<br /><span class="muted small">{t('report.packDays', { n: c.pack_days })}</span>{/if}</td>
                <td class="num">{c.items}</td><td class="num">{formatMoney(lang, c.net_cents)}</td><td class="num">{formatMoney(lang, c.vat_cents)}</td><td class="num">{formatMoney(lang, c.total_cents)}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  </div>

  <section class="card stack">
    <div class="row"><h2>{t('report.owing')}</h2><span class="spacer"></span>
      <button onclick={exportOwing} disabled={report.owing.length === 0}>{t('report.csvOwing')}</button></div>
    {#if report.owing.length === 0}
      <p class="muted">{t('report.noOwing')}</p>
    {:else}
      <table>
        <thead><tr><th>{t('common.owner')}</th><th>{t('common.phone')}</th><th class="num">{t('report.unpaidDays')}</th><th>{t('report.since')}</th><th class="num">{t('report.balance')}</th></tr></thead>
        <tbody>
          {#each report.owing as o (o.owner_id)}
            <tr><td><a href="/owners/{o.owner_id}">{o.full_name}</a><br /><span class="muted small">{o.email}</span></td>
              <td>{o.phone ?? ''}</td><td class="num">{o.unpaid_days}</td><td>{fmtDate(o.oldest_unpaid_day)}</td>
              <td class="num"><strong>{formatMoney(lang, o.balance_cents)}</strong></td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}

<style>
  .head { margin-bottom: 0.8rem; }
  .head h1 { margin: 0; }
  .month { min-width: 10rem; text-align: center; display: inline-block; }
  .month::first-letter { text-transform: uppercase; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: 1rem; align-items: start; margin-bottom: 1rem; }
  .num { text-align: right; white-space: nowrap; }
  .total td { font-weight: 800; border-top: 2px solid var(--line); }
</style>

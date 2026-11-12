<script lang="ts">
  import { getCapacity, getDayDogs, getOccupancy, type DayDog } from '#lib/api/calendar.ts';
  import { dayLoad, gridRange, maxDogsOn, monthGrid, shiftMonth } from '#lib/logic/calendar.ts';
  import { todayIso, WEEKDAYS } from '#lib/logic/dates.ts';
  import { t, fmtDate, fmtMonth } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  import type { Capacity, Occupancy } from '#lib/types.ts';
  import { fail } from '#lib/toast.svelte.ts';
  import StatusBadge from '#lib/components/StatusBadge.svelte';
  import VaccineFlag from '#lib/components/VaccineFlag.svelte';

  const today = todayIso();
  let year = $state(+today.slice(0, 4));
  let month = $state(+today.slice(5, 7));
  const grid = $derived(monthGrid(year, month));

  let occupancy = $state(new Map<string, Occupancy>());
  let capacity = $state<Capacity[]>([]);
  let selected = $state<string | null>(null);
  let dayDogs = $state<DayDog[] | null>(null);

  $effect(() => {
    const { from, to } = gridRange(grid);
    Promise.all([getOccupancy(from, to), getCapacity(from, to)])
      .then(([occ, cap]) => {
        occupancy = new Map(occ.filter((o) => o.day).map((o) => [o.day!, o]));
        capacity = cap;
      })
      .catch(fail);
  });

  $effect(() => {
    const day = selected;
    dayDogs = null;
    if (!day) return;
    getDayDogs(day)
      .then((list) => {
        if (selected === day) dayDogs = list;
      })
      .catch(fail);
  });

  function info(day: string) {
    const occ = occupancy.get(day);
    const row = capacity.find((c) => c.day === day);
    const closed = row?.closed ?? false;
    // Days with bookings get max_dogs from daily_occupancy; others use the same rule as max_dogs_on().
    const max = occ?.max_dogs ?? maxDogsOn(day, capacity);
    const confirmed = occ?.confirmed ?? 0;
    return { confirmed, pending: occ?.pending ?? 0, max, closed, reason: row?.reason ?? null, load: dayLoad(confirmed, max, closed) };
  }

  function go(by: number) {
    ({ year, month } = shiftMonth(year, month, by));
    selected = null;
  }
  function goToday() {
    year = +today.slice(0, 4);
    month = +today.slice(5, 7);
    selected = today;
  }
</script>

<div class="layout">
  <section>
    <div class="row head">
      <h1>{t('calendar.title')}</h1>
      <span class="spacer"></span>
      <button class="quiet" aria-label={t('calendar.prev')} onclick={() => go(-1)}>‹</button>
      <strong class="month">{fmtMonth(year, month)}</strong>
      <button class="quiet" aria-label={t('calendar.next')} onclick={() => go(1)}>›</button>
      <button onclick={goToday}>{t('calendar.today')}</button>
    </div>

    <div class="cal" role="grid">
      <div class="row-h" role="row">
        {#each WEEKDAYS as d (d)}<div class="wd" role="columnheader">{t(`wd.${d}` as MessageKey)}</div>{/each}
      </div>
      {#each grid as week (week[0].date)}
        <div class="week" role="row">
          {#each week as cell (cell.date)}
            {@const i = info(cell.date)}
            <button
              role="gridcell"
              class="day {i.load}"
              class:out={!cell.inMonth}
              class:today={cell.date === today}
              aria-selected={selected === cell.date}
              title={i.reason ?? ''}
              onclick={() => (selected = cell.date)}
            >
              <span class="num">{+cell.date.slice(8)}</span>
              {#if i.closed}
                <span class="closed-label">{t('calendar.closed')}</span>
                {#if i.reason}<span class="small reason">{i.reason}</span>{/if}
              {:else}
                <span class="count"><strong>{i.confirmed}</strong>/{i.max}</span>
                {#if i.pending}<span class="pending">{t('calendar.pending', { n: i.pending })}</span>{/if}
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>

    <div class="row legend small">
      <span><i class="sw free"></i>{t('calendar.legendFree')}</span>
      <span><i class="sw near"></i>{t('calendar.legendNear')}</span>
      <span><i class="sw full"></i>{t('calendar.legendFull')}</span>
      <span><i class="sw closed"></i>{t('calendar.legendClosed')}</span>
    </div>
  </section>

  <aside class="card">
    {#if !selected}
      <p class="muted">{t('calendar.pickDay')}</p>
    {:else}
      <h2>{t('calendar.dayTitle', { day: fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'long' }) })}</h2>
      {#if dayDogs === null}
        <p class="muted">{t('app.loading')}</p>
      {:else if dayDogs.length === 0}
        <p class="muted">{t('calendar.noDogs')}</p>
      {:else}
        <ul>
          {#each dayDogs as d (d.dog.id)}
            <li class:pending-row={d.status === 'pending'}>
              <a href="/dogs/{d.dog.id}"><strong>{d.dog.name}</strong></a>
              <span class="muted small">{d.dog.owner.full_name}</span>
              <span class="tags">
                <span class="badge">{t(d.dog.size ? (`size.${d.dog.size}` as MessageKey) : 'size.none')}</span>
                <StatusBadge status={d.status} />
                <VaccineFlag dog={d.dog} />
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </aside>
</div>

<style>
  .layout { display: grid; grid-template-columns: 1fr minmax(16rem, 22rem); gap: 1.5rem; align-items: start; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
  .head h1 { margin: 0; }
  .head { margin-bottom: 0.8rem; }
  .month { display: inline-block; min-width: 10rem; text-align: center; font-size: 1.1rem; }
  .month::first-letter { text-transform: uppercase; }
  .cal { display: flex; flex-direction: column; gap: 0.4rem; }
  .row-h, .week { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.4rem; }
  .wd { font-weight: 800; color: var(--muted); text-transform: uppercase; font-size: 0.8rem; padding-left: 0.3rem; }
  .day {
    min-height: 5.6rem; border-radius: 12px; box-shadow: none; border: 2px solid var(--line);
    display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 0.1rem;
    padding: 0.4rem 0.55rem; font-weight: 400; background: var(--surface);
  }
  .day:hover:not(:disabled) { transform: none; box-shadow: none; border-color: var(--shadow); }
  .day[aria-selected='true'] { border-color: var(--shadow); box-shadow: 3px 3px 0 var(--shadow); }
  .day.near { background: var(--near); color: #1d1b3a; }
  .day.full { background: var(--full); color: #1d1b3a; }
  .day.closed { background: var(--closed); color: var(--muted); }
  .day.out { opacity: 0.45; }
  .day.today .num { background: var(--pop); color: var(--pop-ink); border-radius: 999px; padding: 0 0.4rem; }
  .num { font-weight: 800; }
  .count { font-size: 1.05rem; }
  .count strong { font-size: 1.4rem; }
  .pending { font-size: 0.8rem; font-weight: 700; }
  .closed-label { font-weight: 800; }
  .reason { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .legend { margin-top: 0.8rem; gap: 1rem; color: var(--muted); }
  .sw { display: inline-block; width: 0.9rem; height: 0.9rem; border-radius: 4px; border: 1.5px solid var(--line); margin-right: 0.3rem; vertical-align: -2px; }
  .sw.free { background: var(--surface); }
  .sw.near { background: var(--near); }
  .sw.full { background: var(--full); }
  .sw.closed { background: var(--closed); }
  aside ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  aside li { display: flex; flex-direction: column; gap: 0.15rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--line); }
  .tags { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .pending-row strong { font-style: italic; }
</style>

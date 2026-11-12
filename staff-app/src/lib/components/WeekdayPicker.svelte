<script lang="ts">
  import { WEEKDAYS } from '#lib/logic/dates.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';

  let { value = $bindable([]) }: { value: number[] } = $props();

  function toggle(d: number) {
    value = value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b);
  }
</script>

<div class="wd" role="group" aria-label={t('common.weekdays')}>
  {#each WEEKDAYS as d (d)}
    <button type="button" aria-pressed={value.includes(d)} onclick={() => toggle(d)}>{t(`wd.${d}` as MessageKey)}</button>
  {/each}
</div>

<style>
  .wd { display: flex; gap: 0.25rem; }
  .wd button { box-shadow: none; padding: 0.2rem 0.6rem; border-width: 1.5px; font-size: 0.85rem; }
  .wd button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
</style>

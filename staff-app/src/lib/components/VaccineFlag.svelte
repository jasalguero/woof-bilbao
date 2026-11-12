<script lang="ts">
  import { needsVaccineCheck } from '#lib/logic/vaccines.ts';
  import { todayIso } from '#lib/logic/dates.ts';
  import { t, fmtDate } from '#lib/i18n/index.svelte.ts';

  let { dog }: { dog: { vaccines_up_to_date: boolean; vaccines_checked_until: string | null } } = $props();
  const show = $derived(needsVaccineCheck(dog, todayIso()));
  const title = $derived(
    dog.vaccines_checked_until ? `${t('vaccines.checkedUntil')}: ${fmtDate(dog.vaccines_checked_until)}` : t('vaccines.check')
  );
</script>

{#if show}<span class="badge warn" {title}>{t('vaccines.check')}</span>{/if}

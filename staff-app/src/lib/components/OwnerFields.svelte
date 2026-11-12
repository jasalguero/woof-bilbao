<script module lang="ts">
export interface OwnerFormValue {
  full_name: string;
  email: string;
  phone: string | null;
  language: 'es' | 'en';
  notes?: string | null;
}
</script>

<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';


  let { owner = $bindable(), notes = false }: { owner: OwnerFormValue; notes?: boolean } = $props();
</script>

<div class="grid2">
  <label class="field"><span>{t('common.name')}</span><input bind:value={owner.full_name} required /></label>
  <label class="field"><span>{t('common.email')}</span><input type="email" bind:value={owner.email} required /></label>
  <label class="field"><span>{t('common.phone')}</span><input bind:value={owner.phone} /></label>
  <label class="field">
    <span>{t('common.language')}</span>
    <select bind:value={owner.language}>
      <option value="es">{t('lang.es')}</option>
      <option value="en">{t('lang.en')}</option>
    </select>
  </label>
</div>
{#if notes}
  <label class="field notes"><span>{t('common.notes')}</span><textarea bind:value={owner.notes}></textarea></label>
{/if}

<style>
  .notes { margin-top: 0.7rem; }
</style>

<script module lang="ts">
export interface DogFormValue {
  name: string;
  breed: string | null;
  age_text: string | null;
  size: 's' | 'm' | 'l' | null;
  sex: 'm' | 'f' | null;
  neutered: boolean;
  vaccines_up_to_date: boolean;
  vaccines_checked_until?: string | null;
  medical_notes: string | null;
  behaviour_notes: string | null;
  active?: boolean;
}
</script>

<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';


  let { dog = $bindable(), full = false }: { dog: DogFormValue; full?: boolean } = $props();
</script>

<div class="grid2">
  <label class="field"><span>{t('common.name')}</span><input bind:value={dog.name} required /></label>
  <label class="field"><span>{t('dogs.breed')}</span><input bind:value={dog.breed} /></label>
  <label class="field"><span>{t('dogs.age')}</span><input bind:value={dog.age_text} /></label>
  <label class="field">
    <span>{t('dogs.size')}</span>
    <select bind:value={dog.size}>
      <option value={null}>{t('size.none')}</option>
      <option value="s">{t('size.s')}</option>
      <option value="m">{t('size.m')}</option>
      <option value="l">{t('size.l')}</option>
    </select>
  </label>
  <label class="field">
    <span>{t('dogs.sex')}</span>
    <select bind:value={dog.sex}>
      <option value={null}>{t('sex.none')}</option>
      <option value="m">{t('sex.m')}</option>
      <option value="f">{t('sex.f')}</option>
    </select>
  </label>
  {#if full}
    <label class="field">
      <span>{t('vaccines.checkedUntil')}</span>
      <input type="date" bind:value={dog.vaccines_checked_until} />
    </label>
  {/if}
</div>
<div class="row checks">
  <label class="check"><input type="checkbox" bind:checked={dog.neutered} /> {t('dogs.neutered')}</label>
  <label class="check"><input type="checkbox" bind:checked={dog.vaccines_up_to_date} /> {t('vaccines.upToDate')}</label>
  {#if full && dog.active !== undefined}
    <label class="check"><input type="checkbox" bind:checked={dog.active} /> {t('common.active')}</label>
  {/if}
</div>
<label class="field notes"><span>{t('dogs.medical')}</span><textarea bind:value={dog.medical_notes}></textarea></label>
<label class="field notes"><span>{t('dogs.behaviour')}</span><textarea bind:value={dog.behaviour_notes}></textarea></label>

<style>
  .checks { margin: 0.7rem 0; gap: 1.2rem; }
  .notes + .notes { margin-top: 0.6rem; }
</style>

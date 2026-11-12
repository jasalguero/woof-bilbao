<script lang="ts">
  // Floating, non-blocking card shown when a new version is available, while
  // it downloads/installs, and if installing fails. Staff can keep working.
  import { updater, installUpdate, dismissUpdate } from '#lib/updater.svelte.ts';
  import { displayVersion, formatBytes, progressPercent, showBanner } from '#lib/logic/updates.ts';
  import { t } from '#lib/i18n/index.svelte.ts';

  const s = $derived(updater.state);
  const info = $derived('info' in s ? s.info : null);
  const percent = $derived(s.kind === 'downloading' ? progressPercent(s.downloaded, s.total) : null);
</script>

{#if showBanner(s) && info}
  <aside class="update" role="status" aria-live="polite" data-testid="update-banner">
    <strong>{t('update.available', { version: displayVersion(info.version) })}</strong>
    {#if info.notes && s.kind === 'available'}
      <details>
        <summary>{t('update.notes')}</summary>
        <p class="notes">{info.notes}</p>
      </details>
    {/if}

    {#if s.kind === 'downloading'}
      <progress max="100" value={percent ?? undefined} aria-label={t('update.install')}></progress>
      <span class="small">
        {percent === null
          ? t('update.downloadingBytes', { size: formatBytes(s.downloaded) })
          : t('update.downloadingPct', { percent })}
      </span>
    {:else if s.kind === 'installing'}
      <progress aria-label={t('update.installing')}></progress>
      <span class="small">{t('update.installing')}</span>
    {:else if s.kind === 'restarting'}
      <span class="small">{t('update.restarting')}</span>
    {:else if s.kind === 'error'}
      <span class="small err">{t('update.failed', { message: s.message })}</span>
    {/if}

    {#if s.kind === 'available' || s.kind === 'error'}
      <div class="row">
        <button class="quiet" onclick={dismissUpdate}>{t('update.later')}</button>
        <span class="spacer"></span>
        <button class="primary" onclick={installUpdate}>
          {s.kind === 'error' ? t('update.retry') : t('update.install')}
        </button>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .update {
    position: fixed;
    left: 1rem;
    bottom: 1rem;
    z-index: 90;
    width: min(24rem, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.8rem 0.9rem;
    border: 2px solid var(--shadow);
    border-radius: 12px;
    box-shadow: 3px 3px 0 var(--shadow);
    background: var(--surface);
  }
  .notes { white-space: pre-wrap; margin: 0.4rem 0 0; max-height: 10rem; overflow: auto; }
  summary { cursor: pointer; font-weight: 700; }
  progress { width: 100%; }
  .err { color: var(--danger); font-weight: 700; }
</style>

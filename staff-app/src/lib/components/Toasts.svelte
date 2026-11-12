<script lang="ts">
  import { toasts, dismiss } from '#lib/toast.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div class="toast {toast.kind}" role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span>{toast.text}</span>
      <button class="quiet" aria-label={t('common.close')} onclick={() => dismiss(toast.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 100;
    max-width: min(28rem, calc(100vw - 2rem));
  }
  .toast {
    display: flex;
    align-items: start;
    gap: 0.5rem;
    padding: 0.6rem 0.6rem 0.6rem 0.9rem;
    border: 2px solid var(--shadow);
    border-radius: 12px;
    box-shadow: 3px 3px 0 var(--shadow);
    background: var(--mint);
    color: #1d1b3a;
    font-weight: 700;
  }
  .toast.error { background: var(--pop); color: var(--pop-ink); }
  .toast.info { background: var(--sun); color: #1d1b3a; }
  .toast span { flex: 1; padding-top: 0.2rem; }
  .toast button { color: inherit; font-size: 1.2rem; line-height: 1; }
</style>

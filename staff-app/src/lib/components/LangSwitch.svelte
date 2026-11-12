<script lang="ts">
  import { i18n } from '#lib/i18n/index.svelte.ts';
  import { changeLanguage } from '#lib/session.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
</script>

<div class="lang" role="group" aria-label={t('nav.language')}>
  <button type="button" aria-pressed={i18n.lang === 'es'} onclick={() => changeLanguage('es')}>ES</button>
  <button type="button" aria-pressed={i18n.lang === 'en'} onclick={() => changeLanguage('en')}>EN</button>
</div>

<style>
  .lang { display: inline-flex; border: 2px solid var(--shadow); border-radius: 999px; overflow: hidden; }
  .lang button { border: 0; border-radius: 0; box-shadow: none; padding: 0.2rem 0.6rem; background: transparent; font-size: 0.8rem; }
  .lang button:hover { transform: none; box-shadow: none; }
  .lang button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
</style>

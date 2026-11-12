<script lang="ts">
  import { page } from '$app/state';
  import { session, signOut } from '#lib/session.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { counts } from '#lib/counts.svelte.ts';
  import LangSwitch from './LangSwitch.svelte';

  const links = $derived([
    { href: '/today', label: t('nav.today'), badge: 0 },
    { href: '/requests', label: t('nav.requests'), badge: counts.newRequests },
    { href: '/calendar', label: t('nav.calendar'), badge: 0 },
    { href: '/dogs', label: t('nav.dogs'), badge: 0 },
    { href: '/owners', label: t('nav.owners'), badge: 0 },
    // Everyone: language and app version/updates; the rest of Settings is admin-only.
    { href: '/settings', label: t('nav.settings'), badge: 0 }
  ]);
</script>

<header>
  <a class="brand" href="/today"><img class="logo" src="/logo.png" alt="" />{t('app.name')}</a>
  <nav>
    {#each links as l (l.href)}
      <a href={l.href} aria-current={page.url.pathname.startsWith(l.href) ? 'page' : undefined}>
        {l.label}{#if l.badge}<span class="count" data-testid="badge-{l.href.slice(1)}">{l.badge}</span>{/if}
      </a>
    {/each}
  </nav>
  <span class="spacer"></span>
  <LangSwitch />
  <span class="who" title={session.email ?? ''}>{session.staff?.full_name}</span>
  <button class="quiet" onclick={signOut}>{t('nav.signOut')}</button>
</header>

<style>
  header {
    display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
    padding: 0.6rem 1.2rem;
    background: var(--surface);
    border-bottom: 2px solid var(--shadow);
    position: sticky; top: 0; z-index: 10;
  }
  .brand { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; font: 1.15rem var(--display); }
  .logo { width: 2.1rem; height: 2.1rem; }
  nav { display: flex; gap: 0.2rem; flex-wrap: wrap; }
  nav a {
    text-decoration: none; font-weight: 800; padding: 0.3rem 0.75rem; border-radius: 999px;
    display: inline-flex; align-items: center; gap: 0.35rem;
  }
  nav a:hover { background: var(--surface-2); }
  nav a[aria-current='page'] { background: var(--ink); color: var(--bg); }
  .count {
    background: var(--pop); color: var(--pop-ink); border-radius: 999px; font-size: 0.72rem;
    min-width: 1.3rem; text-align: center; padding: 0 0.35rem;
  }
  .who { font-weight: 700; }
</style>

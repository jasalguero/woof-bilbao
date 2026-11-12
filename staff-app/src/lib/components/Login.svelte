<script lang="ts">
  import { signIn } from '#lib/api/auth.ts';
  import { session, signInAndLoad } from '#lib/session.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { describeError } from '#lib/toast.svelte.ts';
  import LangSwitch from './LangSwitch.svelte';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    session.denied = false;
    try {
      const { user } = await signIn(email.trim(), password);
      await signInAndLoad(user.id, user.email ?? null);
      if (session.denied) error = t('login.notAuthorised');
    } catch (err) {
      const status = (err as { status?: number }).status;
      error = status === 400 ? t('login.failed') : describeError(err);
    } finally {
      busy = false;
    }
  }
</script>

<main class="login">
  <form class="card stack" onsubmit={submit}>
    <div class="row">
      <img class="logo" src="/logo.png" alt="" />
      <div>
        <h1>{t('app.name')}</h1>
        <p class="muted small">{t('login.hint')}</p>
      </div>
    </div>
    <h2>{t('login.title')}</h2>
    <label class="field"><span>{t('login.email')}</span>
      <input type="email" name="email" autocomplete="username" bind:value={email} required />
    </label>
    <label class="field"><span>{t('login.password')}</span>
      <input type="password" name="password" autocomplete="current-password" bind:value={password} required />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="row">
      <LangSwitch />
      <span class="spacer"></span>
      <button class="primary" type="submit" disabled={busy}>{t('login.submit')}</button>
    </div>
  </form>
</main>

<style>
  .login { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
  form { width: min(24rem, 100%); box-shadow: 5px 5px 0 var(--shadow); border-color: var(--shadow); }
  h1 { margin: 0; }
  .logo { width: 3.2rem; height: 3.2rem; }
  .error { color: var(--danger); font-weight: 700; margin: 0; }
</style>

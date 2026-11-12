// Auto-updates through the Tauri updater and process plugins. The app looks
// for a newer signed release on GitHub (endpoint + public key in
// src-tauri/tauri.conf.json) at startup and every 6 hours; staff choose when
// to install. In a plain browser (vite dev/preview) all of this is a no-op.
// Pure logic and the state machine are in logic/updates.ts.
import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { warn as logWarn, info as logInfo } from '@tauri-apps/plugin-log';
import {
  CHECK_INTERVAL_MS, initialUpdateState, isBusy, isNewer, releaseNotes, updateReducer,
  type UpdateEvent, type UpdateState
} from './logic/updates';

declare const __APP_VERSION__: string;

/** The version baked in at build time (package.json); the desktop app reads its own at startup. */
const BUILD_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export const updater = $state<{ state: UpdateState; version: string; desktop: boolean }>({
  state: initialUpdateState,
  version: BUILD_VERSION,
  desktop: false
});

// The plugin's Update handle owns a Rust resource; keep it out of reactive state.
let pending: Update | null = null;
let dismissedVersion: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function send(e: UpdateEvent) {
  updater.state = updateReducer(updater.state, e);
}

function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

function log(level: 'info' | 'warn', text: string) {
  (level === 'warn' ? console.warn : console.info)(`[updater] ${text}`);
  (level === 'warn' ? logWarn : logInfo)(`[updater] ${text}`).catch(() => {});
}

async function release() {
  const old = pending;
  pending = null;
  await old?.close().catch(() => {});
}

/** Looks for a new version. Manual checks (Settings button) also show "up to date" and errors. */
export async function checkForUpdates(manual = false): Promise<void> {
  if (!isTauri()) return;
  if (isBusy(updater.state)) return; // already checking, or downloading/installing
  send({ type: 'check', manual });
  try {
    const update = await check({ timeout: 30_000 });
    await release();
    if (!update || !isNewer(update.version, updater.version)) {
      await update?.close().catch(() => {});
      send({ type: 'none', at: Date.now() });
      return;
    }
    pending = update;
    log('info', `version ${update.version} available (running ${updater.version})`);
    send({
      type: 'found',
      info: { version: update.version, notes: releaseNotes(update.body), date: update.date ?? null },
      dismissed: dismissedVersion
    });
  } catch (err) {
    log('warn', `update check failed: ${message(err)}`);
    send({ type: 'failed', message: message(err) });
  }
}

/** Downloads with progress, installs, then relaunches the app. */
export async function installUpdate(): Promise<void> {
  if (!isTauri() || !pending) return;
  send({ type: 'download' });
  if (updater.state.kind !== 'downloading') return;
  try {
    await pending.download((e) => {
      if (e.event === 'Started') send({ type: 'started', total: e.data.contentLength ?? null });
      else if (e.event === 'Progress') send({ type: 'progress', chunk: e.data.chunkLength });
    });
    send({ type: 'installed' }); // downloaded -> installing
    await pending.install(); // on Windows the passive installer takes over and closes the app
    send({ type: 'installed' }); // installing -> restarting
    log('info', 'update installed, relaunching');
    await relaunch();
  } catch (err) {
    log('warn', `update install failed: ${message(err)}`);
    send({ type: 'failed', message: message(err) });
  }
}

/** "Later": hides the banner for this version until a manual check or a newer release. */
export function dismissUpdate() {
  const s = updater.state;
  if (s.kind === 'available') dismissedVersion = s.info.version;
  if (s.kind === 'error' && s.info) dismissedVersion = s.info.version;
  send({ type: 'dismiss' });
}

/** Startup: read the real app version, check now and every 6 hours. Returns a stop function. */
export function startAutoUpdates(): () => void {
  if (!isTauri()) return () => {};
  updater.desktop = true;
  getVersion()
    .then((v) => (updater.version = v))
    .catch((err) => log('warn', `could not read app version: ${message(err)}`))
    .finally(() => checkForUpdates(false));
  timer ??= setInterval(() => checkForUpdates(false), CHECK_INTERVAL_MS);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

/** For tests only. */
export function _resetUpdater() {
  if (timer) clearInterval(timer);
  timer = null;
  pending = null;
  dismissedVersion = null;
  updater.state = initialUpdateState;
  updater.version = BUILD_VERSION;
  updater.desktop = false;
}

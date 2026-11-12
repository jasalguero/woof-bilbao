// The updater module with the Tauri plugins mocked: no desktop app needed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  getVersion: vi.fn(async () => '0.1.0'),
  check: vi.fn(),
  relaunch: vi.fn(async () => {}),
  logWarn: vi.fn(async () => {}),
  logInfo: vi.fn(async () => {})
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: m.isTauri }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: m.getVersion }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: m.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: m.relaunch }));
vi.mock('@tauri-apps/plugin-log', () => ({ warn: m.logWarn, info: m.logInfo }));

import {
  updater, checkForUpdates, installUpdate, dismissUpdate, startAutoUpdates, _resetUpdater
} from './updater.svelte';
import { CHECK_INTERVAL_MS, showBanner } from './logic/updates';

type Progress = (e: { event: string; data?: Record<string, number> }) => void;

function fakeUpdate(version: string, opts: { failInstall?: boolean } = {}) {
  return {
    version,
    body: 'Mejoras\n- más rápido',
    date: '2026-11-10T10:00:00Z',
    close: vi.fn(async () => {}),
    download: vi.fn(async (cb: Progress) => {
      cb({ event: 'Started', data: { contentLength: 1000 } });
      cb({ event: 'Progress', data: { chunkLength: 400 } });
      cb({ event: 'Progress', data: { chunkLength: 600 } });
      cb({ event: 'Finished' });
    }),
    install: vi.fn(async () => {
      if (opts.failInstall) throw new Error('signature mismatch');
    })
  };
}

beforeEach(() => {
  _resetUpdater();
  vi.clearAllMocks();
  m.isTauri.mockReturnValue(true);
  m.getVersion.mockResolvedValue('0.1.0');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('in a plain browser', () => {
  it('does nothing and never calls the plugins', async () => {
    m.isTauri.mockReturnValue(false);
    const stop = startAutoUpdates();
    await checkForUpdates(true);
    await installUpdate();
    stop();
    expect(m.check).not.toHaveBeenCalled();
    expect(m.getVersion).not.toHaveBeenCalled();
    expect(updater.state.kind).toBe('idle');
    expect(updater.desktop).toBe(false);
    // The build-time version from package.json is still shown.
    expect(updater.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('in the desktop app', () => {
  it('finds, downloads with progress, installs and relaunches', async () => {
    updater.version = '0.1.0';
    const u = fakeUpdate('0.2.0');
    m.check.mockResolvedValue(u);
    await checkForUpdates(false);
    expect(updater.state).toMatchObject({ kind: 'available', info: { version: '0.2.0', notes: 'Mejoras\n- más rápido' } });
    expect(showBanner(updater.state)).toBe(true);

    const kinds: string[] = [];
    u.download.mockImplementation(async (cb: Progress) => {
      cb({ event: 'Started', data: { contentLength: 1000 } });
      cb({ event: 'Progress', data: { chunkLength: 400 } });
      kinds.push(`${updater.state.kind}:${'downloaded' in updater.state ? updater.state.downloaded : ''}`);
      cb({ event: 'Finished' });
    });
    u.install.mockImplementation(async () => {
      kinds.push(updater.state.kind);
    });
    await installUpdate();
    expect(kinds).toEqual(['downloading:400', 'installing']);
    expect(updater.state.kind).toBe('restarting');
    expect(m.relaunch).toHaveBeenCalledOnce();
  });

  it('says up to date when there is nothing newer', async () => {
    m.check.mockResolvedValue(null);
    await checkForUpdates(true);
    expect(updater.state.kind).toBe('upToDate');
  });

  it('ignores an endpoint answer that is not newer than the running app', async () => {
    updater.version = '0.3.0';
    const u = fakeUpdate('0.2.0');
    m.check.mockResolvedValue(u);
    await checkForUpdates(true);
    expect(updater.state.kind).toBe('upToDate');
    expect(u.close).toHaveBeenCalled();
  });

  it('logs check errors softly without a banner', async () => {
    m.check.mockRejectedValue(new Error('network down'));
    await checkForUpdates(false);
    expect(updater.state).toMatchObject({ kind: 'error', phase: 'check', message: 'network down' });
    expect(showBanner(updater.state)).toBe(false);
    expect(m.logWarn).toHaveBeenCalledWith(expect.stringContaining('network down'));
  });

  it('shows install errors and does not relaunch', async () => {
    m.check.mockResolvedValue(fakeUpdate('0.2.0', { failInstall: true }));
    await checkForUpdates(false);
    await installUpdate();
    expect(updater.state).toMatchObject({ kind: 'error', phase: 'install', message: 'signature mismatch' });
    expect(showBanner(updater.state)).toBe(true);
    expect(m.relaunch).not.toHaveBeenCalled();
  });

  it('keeps a found update when an automatic re-check fails', async () => {
    m.check.mockResolvedValueOnce(fakeUpdate('0.2.0'));
    await checkForUpdates(false);
    m.check.mockRejectedValueOnce(new Error('offline'));
    await checkForUpdates(false);
    expect(updater.state).toMatchObject({ kind: 'available', info: { version: '0.2.0' } });
    expect(showBanner(updater.state)).toBe(true);
  });

  it('shows a newer release on an automatic check after "Later"', async () => {
    m.check.mockResolvedValueOnce(fakeUpdate('0.2.0'));
    await checkForUpdates(false);
    dismissUpdate();
    expect(showBanner(updater.state)).toBe(false);
    m.check.mockResolvedValueOnce(fakeUpdate('0.3.0'));
    await checkForUpdates(false);
    expect(updater.state).toMatchObject({ kind: 'available', info: { version: '0.3.0' } });
    expect(showBanner(updater.state)).toBe(true);
  });

  it('keeps a dismissed version hidden on automatic checks only', async () => {
    m.check.mockImplementation(async () => fakeUpdate('0.2.0'));
    await checkForUpdates(false);
    dismissUpdate();
    expect(showBanner(updater.state)).toBe(false);
    await checkForUpdates(false);
    expect(showBanner(updater.state)).toBe(false);
    await checkForUpdates(true);
    expect(showBanner(updater.state)).toBe(true);
  });

  it('checks at startup with the real app version, then every 6 hours', async () => {
    vi.useFakeTimers();
    m.getVersion.mockResolvedValue('0.1.5');
    m.check.mockResolvedValue(null);
    const stop = startAutoUpdates();
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.desktop).toBe(true);
    expect(updater.version).toBe('0.1.5');
    expect(m.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(m.check).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(m.check).toHaveBeenCalledTimes(2);
  });

  it('does not start a check while an update is downloading', async () => {
    const u = fakeUpdate('0.2.0');
    let finish!: () => void;
    u.download.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    m.check.mockResolvedValue(u);
    await checkForUpdates(false);
    const installing = installUpdate();
    expect(updater.state.kind).toBe('downloading');
    await checkForUpdates(true);
    expect(m.check).toHaveBeenCalledTimes(1);
    finish();
    await installing;
    expect(m.relaunch).toHaveBeenCalled();
  });
});

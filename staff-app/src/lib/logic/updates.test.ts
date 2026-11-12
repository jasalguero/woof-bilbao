import { describe, expect, it } from 'vitest';
import {
  compareVersions, displayVersion, formatBytes, initialUpdateState, isBusy, isNewer, parseVersion,
  progressPercent, releaseNotes, showBanner, updateReducer, type UpdateEvent, type UpdateInfo, type UpdateState
} from './updates';

describe('versions', () => {
  it('parses plain, v-prefixed and tag-style versions', () => {
    expect(parseVersion('0.2.0')?.core).toEqual([0, 2, 0]);
    expect(parseVersion('v1.10.3')?.core).toEqual([1, 10, 3]);
    expect(parseVersion('app-v0.3.1')?.core).toEqual([0, 3, 1]);
    expect(parseVersion('1.0.0-beta.2+build.5')?.pre).toEqual(['beta', '2']);
    expect(parseVersion('1.0')).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  it('compares numerically, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3', '1.3.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('orders pre-releases before the release', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBeLessThan(0);
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-beta.9')).toBeGreaterThan(0);
  });

  it('treats invalid versions as oldest', () => {
    expect(compareVersions('garbage', '0.0.1')).toBeLessThan(0);
    expect(compareVersions('0.0.1', 'garbage')).toBeGreaterThan(0);
    expect(compareVersions('x', 'y')).toBe(0);
  });

  it('isNewer only moves forward', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.0.9', '0.1.0')).toBe(false);
  });

  it('formats versions for display', () => {
    expect(displayVersion('v0.2.0')).toBe('0.2.0');
    expect(displayVersion('app-v0.2.0')).toBe('0.2.0');
    expect(displayVersion(' 0.2.0 ')).toBe('0.2.0');
    expect(displayVersion('dev')).toBe('dev');
  });
});

describe('notes and progress', () => {
  it('cleans up release notes', () => {
    expect(releaseNotes(undefined)).toBeNull();
    expect(releaseNotes('   \n ')).toBeNull();
    expect(releaseNotes(' Fixes\r\n- one ')).toBe('Fixes\n- one');
    const long = releaseNotes('x'.repeat(50), 10)!;
    expect(long).toHaveLength(10);
    expect(long.endsWith('…')).toBe(true);
  });

  it('computes a bounded percentage', () => {
    expect(progressPercent(50, 200)).toBe(25);
    expect(progressPercent(0, 0)).toBeNull();
    expect(progressPercent(10, null)).toBeNull();
    expect(progressPercent(300, 200)).toBe(100);
  });

  it('formats byte counts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('update state machine', () => {
  const info: UpdateInfo = { version: '0.2.0', notes: 'New stuff', date: null };
  const run = (events: UpdateEvent[], from: UpdateState = initialUpdateState) => events.reduce(updateReducer, from);

  it('goes check -> available -> download -> install -> restart', () => {
    let s = run([{ type: 'check', manual: false }]);
    expect(s).toEqual({ kind: 'checking', manual: false });
    s = run([{ type: 'found', info, dismissed: null }], s);
    expect(s).toEqual({ kind: 'available', info, dismissed: false });
    expect(showBanner(s)).toBe(true);
    s = run([{ type: 'download' }, { type: 'started', total: 1000 }, { type: 'progress', chunk: 300 }, { type: 'progress', chunk: 200 }], s);
    expect(s).toEqual({ kind: 'downloading', info, downloaded: 500, total: 1000 });
    expect(isBusy(s)).toBe(true);
    s = run([{ type: 'installed' }], s);
    expect(s.kind).toBe('installing');
    s = run([{ type: 'installed' }], s);
    expect(s.kind).toBe('restarting');
    expect(showBanner(s)).toBe(true);
  });

  it('reports up to date without a banner', () => {
    const s = run([{ type: 'check', manual: true }, { type: 'none', at: 42 }]);
    expect(s).toEqual({ kind: 'upToDate', checkedAt: 42 });
    expect(showBanner(s)).toBe(false);
  });

  it('keeps check errors soft (no banner) and remembers whether they were manual', () => {
    const s = run([{ type: 'check', manual: false }, { type: 'failed', message: 'offline' }]);
    expect(s).toEqual({ kind: 'error', phase: 'check', message: 'offline', manual: false, info: null });
    expect(showBanner(s)).toBe(false);
    // A later check can still run.
    expect(run([{ type: 'check', manual: false }], s).kind).toBe('checking');
  });

  it('shows install errors in the banner and allows a retry', () => {
    let s = run([{ type: 'check', manual: false }, { type: 'found', info, dismissed: null }, { type: 'download' }, { type: 'failed', message: 'bad signature' }]);
    expect(s).toEqual({ kind: 'error', phase: 'install', message: 'bad signature', manual: true, info });
    expect(showBanner(s)).toBe(true);
    s = run([{ type: 'download' }], s);
    expect(s).toEqual({ kind: 'downloading', info, downloaded: 0, total: null });
  });

  it('never starts a check while busy', () => {
    const downloading: UpdateState = { kind: 'downloading', info, downloaded: 1, total: 2 };
    expect(run([{ type: 'check', manual: true }], downloading)).toBe(downloading);
    const checking: UpdateState = { kind: 'checking', manual: false };
    expect(run([{ type: 'check', manual: true }], checking)).toBe(checking);
  });

  it('ignores events that do not fit the current state', () => {
    expect(run([{ type: 'download' }])).toBe(initialUpdateState);
    expect(run([{ type: 'progress', chunk: 5 }])).toBe(initialUpdateState);
    expect(run([{ type: 'found', info, dismissed: null }])).toBe(initialUpdateState);
    expect(run([{ type: 'installed' }])).toBe(initialUpdateState);
    expect(run([{ type: 'failed', message: 'x' }])).toBe(initialUpdateState);
  });

  it('"Later" hides the banner; automatic checks keep that version hidden, manual ones do not', () => {
    let s = run([{ type: 'check', manual: false }, { type: 'found', info, dismissed: null }, { type: 'dismiss' }]);
    expect(s).toEqual({ kind: 'available', info, dismissed: true });
    expect(showBanner(s)).toBe(false);

    s = run([{ type: 'check', manual: false }, { type: 'found', info, dismissed: '0.2.0' }], s);
    expect(showBanner(s)).toBe(false);

    const newer = { ...info, version: '0.3.0' };
    s = run([{ type: 'check', manual: false }, { type: 'found', info: newer, dismissed: '0.2.0' }], s);
    expect(showBanner(s)).toBe(true);

    s = run([{ type: 'check', manual: true }, { type: 'found', info, dismissed: '0.2.0' }], s);
    expect(showBanner(s)).toBe(true);
  });

  it('dismissing an install error goes back to a hidden "available"', () => {
    const err: UpdateState = { kind: 'error', phase: 'install', message: 'x', manual: true, info };
    expect(run([{ type: 'dismiss' }], err)).toEqual({ kind: 'available', info, dismissed: true });
    const checkErr: UpdateState = { kind: 'error', phase: 'check', message: 'x', manual: true, info: null };
    expect(run([{ type: 'dismiss' }], checkErr)).toBe(initialUpdateState);
  });
});

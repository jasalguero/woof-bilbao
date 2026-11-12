// Pure parts of the auto-updater: version comparison, download progress and
// the small state machine behind the update banner and the Settings card.
// The plugin calls live in ../updater.svelte.ts.

/** How often a running app looks for a new version (startup + every 6 h). */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface Parsed {
  core: [number, number, number];
  pre: string[];
}

/** "app-v1.2.3", "v1.2.3" or "1.2.3-beta.1" -> parts; null when not a version. */
export function parseVersion(v: string | null | undefined): Parsed | null {
  const m = /^(?:app-)?v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec((v ?? '').trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
}

/** Semver order: negative when a < b, 0 when equal, positive when a > b. Invalid versions sort first. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  for (let i = 0; i < 3; i++) if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  // A pre-release is older than the release itself (1.0.0-beta < 1.0.0).
  if (!pa.pre.length || !pb.pre.length) return pb.pre.length - pa.pre.length;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/** "v0.2.0" / "app-v0.2.0" -> "0.2.0", for display. Unknown shapes come back trimmed. */
export function displayVersion(v: string): string {
  return v.trim().replace(/^(?:app-)?v(?=\d)/, '');
}

/** The release notes worth showing, or null when there are none. */
export function releaseNotes(body: string | null | undefined, max = 600): string | null {
  const text = (body ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** 0..100, or null while the total size is unknown. */
export function progressPercent(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
}

/** 1536 -> "1.5 MB" style sizes for the progress label. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 1024) return `${Math.max(0, Math.round(n || 0))} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}

// ---------------------------------------------------------------- state machine

export interface UpdateInfo {
  version: string;
  notes: string | null;
  date: string | null;
}

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking'; manual: boolean }
  | { kind: 'upToDate'; checkedAt: number }
  | { kind: 'available'; info: UpdateInfo; dismissed: boolean }
  | { kind: 'downloading'; info: UpdateInfo; downloaded: number; total: number | null }
  | { kind: 'installing'; info: UpdateInfo }
  | { kind: 'restarting'; info: UpdateInfo }
  | { kind: 'error'; phase: 'check' | 'install'; message: string; manual: boolean; info: UpdateInfo | null };

export type UpdateEvent =
  | { type: 'check'; manual: boolean }
  /** dismissed: the version staff last closed the banner for, if any. */
  | { type: 'found'; info: UpdateInfo; dismissed: string | null }
  | { type: 'none'; at: number }
  | { type: 'download' }
  | { type: 'started'; total: number | null }
  | { type: 'progress'; chunk: number }
  | { type: 'installed' }
  | { type: 'failed'; message: string }
  | { type: 'dismiss' };

export const initialUpdateState: UpdateState = { kind: 'idle' };

/** True while an update is being downloaded or installed: nothing else may start. */
export function isBusy(s: UpdateState): boolean {
  return s.kind === 'checking' || s.kind === 'downloading' || s.kind === 'installing' || s.kind === 'restarting';
}

export function updateReducer(s: UpdateState, e: UpdateEvent): UpdateState {
  switch (e.type) {
    case 'check':
      // Never interrupt a download; a second check while checking is a no-op.
      if (isBusy(s)) return s;
      return { kind: 'checking', manual: e.manual };
    case 'found': {
      if (s.kind !== 'checking') return s;
      // An automatic check finding the version staff already put off keeps it out of the way;
      // asking explicitly ("Check for updates") or a newer version shows it again.
      const hidden = !s.manual && e.dismissed !== null && compareVersions(e.info.version, e.dismissed) === 0;
      return { kind: 'available', info: e.info, dismissed: hidden };
    }
    case 'none':
      return s.kind === 'checking' ? { kind: 'upToDate', checkedAt: e.at } : s;
    case 'download':
      if (s.kind === 'available') return { kind: 'downloading', info: s.info, downloaded: 0, total: null };
      if (s.kind === 'error' && s.phase === 'install' && s.info)
        return { kind: 'downloading', info: s.info, downloaded: 0, total: null };
      return s;
    case 'started':
      return s.kind === 'downloading' ? { ...s, downloaded: 0, total: e.total } : s;
    case 'progress':
      return s.kind === 'downloading' ? { ...s, downloaded: s.downloaded + e.chunk } : s;
    case 'installed':
      if (s.kind === 'downloading') return { kind: 'installing', info: s.info };
      if (s.kind === 'installing') return { kind: 'restarting', info: s.info };
      return s;
    case 'failed':
      if (s.kind === 'checking')
        return { kind: 'error', phase: 'check', message: e.message, manual: s.manual, info: null };
      if (s.kind === 'downloading' || s.kind === 'installing' || s.kind === 'restarting')
        return { kind: 'error', phase: 'install', message: e.message, manual: true, info: s.info };
      return s;
    case 'dismiss':
      if (s.kind === 'available') return { ...s, dismissed: true };
      if (s.kind === 'error') return s.info ? { kind: 'available', info: s.info, dismissed: true } : initialUpdateState;
      return s;
  }
}

/** Whether the floating banner shows. Check errors are soft: only the Settings card shows them. */
export function showBanner(s: UpdateState): boolean {
  switch (s.kind) {
    case 'available':
      return !s.dismissed;
    case 'downloading':
    case 'installing':
    case 'restarting':
      return true;
    case 'error':
      return s.phase === 'install';
    default:
      return false;
  }
}

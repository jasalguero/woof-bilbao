// Desktop notifications through the Tauri notification plugin. Permission is
// asked the first time a notification is needed. In a plain browser (vite
// dev/preview) there is no native notification: the in-app toast is enough.
import { isTauri } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

let permission: Promise<boolean> | null = null;

function allowed(): Promise<boolean> {
  if (!isTauri()) return Promise.resolve(false);
  permission ??= (async () => {
    try {
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === 'granted';
    } catch (e) {
      console.warn('notification permission unavailable', e);
      return false;
    }
  })();
  return permission;
}

/** Shows a desktop notification; resolves false when it could not. */
export async function desktopNotify(title: string, body: string): Promise<boolean> {
  if (!(await allowed())) return false;
  try {
    sendNotification({ title, body });
    return true;
  } catch (e) {
    console.warn('notification failed', e);
    return false;
  }
}

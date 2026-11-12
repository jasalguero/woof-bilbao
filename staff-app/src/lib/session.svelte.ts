// Who is signed in. A Supabase login is only let in when it has a `staff` row.
import { supabase } from './supabase';
import { getStaff, setMyLanguage, signOut as apiSignOut } from './api/auth';
import { i18n, setLang } from './i18n/index.svelte';
import type { Lang, Staff } from './types';
import { fail } from './toast.svelte';

export const session = $state<{
  ready: boolean;
  staff: Staff | null;
  email: string | null;
  /** Set when a login worked but the account is not staff. */
  denied: boolean;
}>({ ready: false, staff: null, email: null, denied: false });

export const isAdmin = () => session.staff?.role === 'admin';

async function load(userId: string | undefined, email: string | null) {
  if (!userId) {
    session.staff = null;
    session.email = null;
    return;
  }
  try {
    const staff = await getStaff(userId);
    if (!staff) {
      session.denied = true;
      session.staff = null;
      await apiSignOut();
      return;
    }
    session.denied = false;
    session.staff = staff;
    session.email = email;
    // The staff member's saved choice wins over this computer's.
    if (staff.language !== i18n.lang) setLang(staff.language);
  } catch (e) {
    fail(e);
  }
}

let started = false;

export async function initSession() {
  if (started) return;
  started = true;
  const { data } = await supabase.auth.getSession();
  await load(data.session?.user.id, data.session?.user.email ?? null);
  session.ready = true;
  supabase.auth.onAuthStateChange((event) => {
    // Signing in is handled by signInAndLoad (called from the login form).
    if (event === 'SIGNED_OUT') {
      session.staff = null;
      session.email = null;
    }
  });
}

/** Signs in and resolves once the staff check is done. */
export async function signInAndLoad(userId: string, email: string | null) {
  await load(userId, email);
}

export async function signOut() {
  await apiSignOut();
  session.staff = null;
}

export async function changeLanguage(lang: Lang) {
  setLang(lang);
  if (session.staff) {
    try {
      await setMyLanguage(lang);
      session.staff.language = lang;
    } catch (e) {
      fail(e);
    }
  }
}

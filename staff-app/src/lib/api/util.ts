/** Unwraps a supabase-js result: returns the data or throws the error. */
export function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

/** Escapes % and _ so user text can be used in ilike patterns. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

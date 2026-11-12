// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}

  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  }
}

export {};

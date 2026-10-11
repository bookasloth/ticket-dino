import { createClient } from '@supabase/supabase-js';

/** Anon, cookie-less: safe for cached public pages. RLS limits it to published data. */
export function publicDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

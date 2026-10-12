import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Service role: bypasses RLS. Only for server code that has already checked who is calling. */
export function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

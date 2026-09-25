import { createClient } from "@supabase/supabase-js";

// Service-role client: used only in server routes (the proxy, API endpoints).
// Bypasses RLS to write request logs and perform project lookups safely.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key",
  { auth: { persistSession: false } }
);

// Browser client: used by the dashboard UI for querying metrics & subscribing to Realtime.
export function createBrowserSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
  );
}

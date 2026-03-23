import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    _client = createClient(url, key);
  }
  return _client;
}

// Convenience proxy — returns no-op for missing env vars
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getSupabaseBrowserClient();
    if (!client) {
      // Return a chainable no-op so hooks don't crash
      if (prop === "from" || prop === "channel" || prop === "removeChannel") {
        return (..._args: unknown[]) => noopChain;
      }
      return undefined;
    }
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// No-op chain that resolves to empty data for missing Supabase config
const noopChain: Record<string, unknown> = new Proxy(
  {},
  {
    get(_, prop) {
      if (prop === "then") return undefined; // not a thenable
      if (prop === "subscribe") return () => ({ unsubscribe: () => {} });
      if (prop === "single" || prop === "maybeSingle") {
        return () => Promise.resolve({ data: null, error: null });
      }
      // For select/eq/order/limit/on/etc — return self to keep chaining
      return (..._args: unknown[]) => noopChain;
    },
  }
);

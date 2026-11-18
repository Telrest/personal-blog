import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseBackendConfig } from "./backend-config";

const config = parseBackendConfig(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export const backendConfigured = Boolean(config);
let client: SupabaseClient | null = null;
export function backend() {
  if (!config) throw new Error("云端草稿尚未连接，当前内容请先导出。");
  client ??= createClient(config.url, config.key, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(15000),
          ]),
        }),
    },
  });
  return client;
}

import { createClient } from "@supabase/supabase-js";

const ENTITLEMENT_CACHE_MS = 60_000;
const proEntitlementCache = new Map<
  string,
  { isPro: boolean; expiresAt: number }
>();

/** Returns null when the entitlement service itself is unavailable. */
export async function hasProEntitlement(
  userId: string,
): Promise<boolean | null> {
  // `verifyAuth` permits a local-development bypass when Supabase is absent.
  // Never let a partially configured hosted deployment inherit that bypass.
  if (userId === "local-dev") return process.env.VERCEL_ENV ? null : true;

  const cached = proEntitlementCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.isPro;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;

  const isPro = data?.subscription_tier === "pro";
  proEntitlementCache.set(userId, {
    isPro,
    expiresAt: Date.now() + ENTITLEMENT_CACHE_MS,
  });
  return isPro;
}

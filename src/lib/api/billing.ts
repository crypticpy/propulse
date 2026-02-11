import { getSupabase } from "@/lib/supabase";

/**
 * Create a Stripe Checkout session for upgrading to Pro.
 * Requires authenticated user.
 */
export async function createCheckoutSession(): Promise<{ url: string }> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Authentication required");
  }

  const res = await fetch("/api/billing/create-checkout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Checkout failed" }));
    throw new Error(err.error || `Checkout failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Create a Stripe Customer Portal session for managing subscription.
 */
export async function createPortalSession(): Promise<{ url: string }> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Authentication required");
  }

  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Portal failed" }));
    throw new Error(err.error || `Portal failed: ${res.status}`);
  }

  return res.json();
}

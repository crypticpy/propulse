import { useProfileStore } from "@/stores/profileStore";
import { createCheckoutSession, createPortalSession } from "@/lib/api/billing";
import { useCallback, useState } from "react";

export function useSubscription() {
  const tier = useProfileStore((s) => s.subscriptionTier);
  const status = useProfileStore((s) => s.subscriptionStatus);
  const periodEnd = useProfileStore((s) => s.subscriptionPeriodEnd);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = tier === "pro";
  const isActive = status === "active" || status === "trialing";
  const isPastDue = status === "past_due";

  const upgrade = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { url } = await createCheckoutSession();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setIsLoading(false);
    }
  }, []);

  const manageSubscription = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open portal");
      setIsLoading(false);
    }
  }, []);

  return {
    tier,
    status,
    periodEnd,
    isPro,
    isActive,
    isPastDue,
    isLoading,
    error,
    upgrade,
    manageSubscription,
  };
}

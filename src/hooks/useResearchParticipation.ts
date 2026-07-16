import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import {
  RESEARCH_PARTICIPATION_ENABLED,
  canRecordResearchOutcomes,
  completeResearchAttempt,
  getResearchParticipation,
  saveResearchConsent,
  startResearchAttempt,
  withdrawResearchConsent,
  type ResearchAllowedUse,
  type ResearchOutcome,
} from "@/lib/propagation/researchParticipation";
import type { SignedResearchReceipt } from "@/lib/propagation/modelClient";

export const RESEARCH_PARTICIPATION_QUERY_KEY = [
  "propagation-v4",
  "research-participation",
] as const;

export function useResearchParticipation() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.session?.access_token ?? null);
  const queryKey = [...RESEARCH_PARTICIPATION_QUERY_KEY, user?.id ?? "anonymous"];
  const query = useQuery({
    queryKey,
    queryFn: () => getResearchParticipation(accessToken!),
    enabled: RESEARCH_PARTICIPATION_ENABLED && Boolean(user && accessToken),
    staleTime: 60_000,
    retry: 1,
  });

  const requireToken = () => {
    if (!accessToken) throw new Error("Sign in to manage research participation");
    return accessToken;
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const consent = useMutation({
    mutationFn: (allowedUses: ResearchAllowedUse[]) =>
      saveResearchConsent(requireToken(), allowedUses),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: () => withdrawResearchConsent(requireToken()),
    onSuccess: refresh,
  });
  const startAttempt = useMutation({
    mutationFn: (receipt: SignedResearchReceipt) =>
      startResearchAttempt(requireToken(), receipt),
  });
  const completeAttempt = useMutation({
    mutationFn: ({ attemptId, outcomeType }: {
      attemptId: string;
      outcomeType: ResearchOutcome;
    }) => completeResearchAttempt(requireToken(), attemptId, outcomeType),
  });

  return {
    enabled: RESEARCH_PARTICIPATION_ENABLED,
    authenticated: Boolean(user && accessToken),
    state: query.data,
    loading: query.isLoading,
    error: query.error,
    canRecordOutcomes: canRecordResearchOutcomes(query.data),
    saveConsent: consent.mutateAsync,
    withdrawConsent: withdraw.mutateAsync,
    startAttempt: startAttempt.mutateAsync,
    completeAttempt: completeAttempt.mutateAsync,
    savingConsent: consent.isPending || withdraw.isPending,
    startingAttempt: startAttempt.isPending,
    completingAttempt: completeAttempt.isPending,
  };
}

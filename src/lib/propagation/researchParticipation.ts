import type {
  ResearchSubjectBinding,
  SignedResearchReceipt,
} from "@/lib/propagation/modelClient";

export const RESEARCH_POLICY_VERSION = "propagation-research-v1-2026-07-12";

export const RESEARCH_PARTICIPATION_ENABLED =
  import.meta.env.VITE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED === "true";

export type ResearchAllowedUse =
  | "anonymous_quality_metrics"
  | "derived_equipment_training"
  | "attempt_outcome_training"
  | "research_follow_up";

export type ResearchOutcome =
  | "receive_success"
  | "receive_failure"
  | "contact_success"
  | "contact_failure"
  | "not_attempted"
  | "unknown";

export interface ResearchConsent {
  policyVersion: string;
  status: "opted_in" | "withdrawn";
  allowedUses: ResearchAllowedUse[];
  consentedAt: string | null;
  withdrawnAt: string | null;
  retentionAcknowledgedAt: string | null;
  updatedAt: string;
}

export interface ResearchParticipationState {
  policyVersion: string;
  consent: ResearchConsent | null;
  subjectBinding: ResearchSubjectBinding | null;
}

export interface ResearchAttempt {
  id: string;
  predictionId: string;
  startedAt: string;
  endedAt: string | null;
  band: string;
  mode: string;
  evidenceGrade: "bridge" | "wsjtx" | "rig" | "logbook" | "manual";
}

async function apiRequest<T>(
  accessToken: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/propagation/research-participation", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    let message = "Research participation request failed";
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the privacy-bounded generic message for non-JSON failures.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function getResearchParticipation(
  accessToken: string,
): Promise<ResearchParticipationState> {
  return apiRequest(accessToken);
}

export async function saveResearchConsent(
  accessToken: string,
  allowedUses: ResearchAllowedUse[],
): Promise<ResearchConsent> {
  const response = await apiRequest<{ consent: ResearchConsent }>(accessToken, {
    action: "consent",
    allowedUses,
    retentionAcknowledged: true,
  });
  return response.consent;
}

export async function withdrawResearchConsent(
  accessToken: string,
): Promise<ResearchConsent> {
  const response = await apiRequest<{ consent: ResearchConsent }>(accessToken, {
    action: "withdraw",
  });
  return response.consent;
}

export async function startResearchAttempt(
  accessToken: string,
  receipt: SignedResearchReceipt,
): Promise<ResearchAttempt> {
  const response = await apiRequest<{ attempt: ResearchAttempt }>(accessToken, {
    action: "start_attempt",
    receipt,
    evidenceGrade: "manual",
  });
  return response.attempt;
}

export async function completeResearchAttempt(
  accessToken: string,
  attemptId: string,
  outcomeType: ResearchOutcome,
): Promise<{ attemptId: string; outcome: { type: ResearchOutcome; observedAt: string } }> {
  return apiRequest(accessToken, {
    action: "complete_attempt",
    attemptId,
    outcomeType,
  });
}

export function canRecordResearchOutcomes(
  state: ResearchParticipationState | undefined,
): boolean {
  return Boolean(
    state?.consent?.policyVersion === RESEARCH_POLICY_VERSION &&
      state.consent.status === "opted_in" &&
      state.consent.allowedUses.includes("attempt_outcome_training"),
  );
}

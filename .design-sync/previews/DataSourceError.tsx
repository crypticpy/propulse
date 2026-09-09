import { DataSourceError, Stack, Surface } from "propulse";

const upstreamError = {
  category: "upstream" as const,
  sourceId: null,
  source: null,
  userMessage:
    "DXHeat did not respond. We'll keep trying automatically and switch to the backup feed if needed.",
  shortMessage: "DX cluster unavailable",
  isUpstream: true,
  httpStatus: 503,
  originalError: null,
  timestamp: Date.now(),
  suggestedRetryMs: 15000,
};

const authError = {
  category: "auth" as const,
  sourceId: null,
  source: null,
  userMessage: "Your session expired. Sign in again to sync your log.",
  shortMessage: "Sign-in required",
  isUpstream: false,
  httpStatus: 401,
  originalError: null,
  timestamp: Date.now(),
  suggestedRetryMs: null,
};

export function Tones() {
  return (
    <Surface>
      <Stack>
        <DataSourceError error={upstreamError} onRetry={() => {}} />
        <DataSourceError error={authError} onRetry={() => {}} />
      </Stack>
    </Surface>
  );
}

export function CompactAndStale() {
  return (
    <Surface>
      <Stack>
        <DataSourceError error={upstreamError} compact onRetry={() => {}} />
        <DataSourceError
          error={null}
          staleness="very-stale"
          stalenessMessage="Solar data is 42 minutes old"
        />
      </Stack>
    </Surface>
  );
}

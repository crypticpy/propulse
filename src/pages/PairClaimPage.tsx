import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authHeaders, getAccessToken } from "@/lib/api/authFetch";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { AuthRequiredPlaceholder } from "@/components/auth/AuthRequiredPlaceholder";

const CODE_LENGTH = 6;
const MAX_NAME_LENGTH = 60;

/** Mirrors api/_lib/handlers/displays.ts normalizePairingCode client-side */
function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .slice(0, CODE_LENGTH);
}

interface ClaimResponse {
  displayId: string;
  name: string;
}

/**
 * PairClaimPage — /pair
 *
 * Phone-friendly claim form: the owner scans the wall device's QR (which
 * lands here with ?code=), or types the code shown on the wall by hand.
 * Requires a signed-in Supabase session; unauthenticated visitors see a
 * sign-in prompt instead of the form.
 */
export function PairClaimPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  const [hasToken, setHasToken] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getAccessToken().then((token) => {
      if (!cancelled) setHasToken(Boolean(token));
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const [code, setCode] = useState(() =>
    normalizeCode(searchParams.get("code") ?? ""),
  );
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const headers = await authHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/displays/pair", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "claim",
          code,
          ...(name.trim() && { name: name.trim().slice(0, MAX_NAME_LENGTH) }),
        }),
      });

      if (res.status === 404) {
        setError("Code not found or expired — generate a new one on the display");
        return;
      }
      if (res.status === 409) {
        setError("Already claimed");
        return;
      }
      if (!res.ok) {
        setError("Could not claim this display — try again");
        return;
      }

      const data = (await res.json()) as ClaimResponse;
      setClaimed(data.name);
      setTimeout(() => navigate("/displays"), 1200);
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <p className="text-gray-400 text-sm text-center max-w-sm">
          Display Wall needs a PropPulse account (cloud feature) — sign in
          from a device with Supabase configured to claim a display.
        </p>
      </div>
    );
  }

  if (hasToken === false) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <AuthRequiredPlaceholder prompt="Sign in to claim this display" />
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-deep-space/60 border border-white/10 rounded-2xl p-6">
        <h1 className="font-orbitron text-xl text-white mb-1 text-center">
          Claim Display
        </h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          Enter the code shown on the wall display.
        </p>

        {claimed ? (
          <div className="text-center py-6">
            <p className="text-signal-green font-orbitron text-lg mb-1">
              Claimed
            </p>
            <p className="text-gray-400 text-sm">
              &ldquo;{claimed}&rdquo; is now yours to manage.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="pair-code"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Pairing code
              </label>
              <input
                id="pair-code"
                type="text"
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                placeholder="ABC2DE"
                maxLength={CODE_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                className="w-full px-3 py-3 bg-void-black border border-white/15 rounded-lg text-white font-mono text-2xl tracking-[0.3em] text-center placeholder-gray-600 focus:outline-none focus:border-plasma-orange/60"
              />
            </div>

            <div>
              <label
                htmlFor="pair-name"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Name <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="pair-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Shack wall"
                maxLength={MAX_NAME_LENGTH}
                className="w-full px-3 py-2 bg-void-black border border-white/15 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-plasma-orange/60"
              />
            </div>

            {error && (
              <div className="p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
                <p className="text-sm text-alert-red">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={code.length !== CODE_LENGTH || submitting}
              className="w-full px-4 py-3 bg-plasma-orange/20 border border-plasma-orange/40 rounded-lg text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Claiming…" : "Claim Display"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

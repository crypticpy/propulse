import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useDisplayStore } from "@/stores/displayStore";
import { useWakeLock } from "@/hooks/useWakeLock";

const POLL_INTERVAL_MS = 5_000;
const RETRY_DELAY_MS = 5_000;

interface RegisterResponse {
  displayId: string;
  deviceToken: string;
  code: string;
  expiresAt: string;
}

interface StateResponse {
  paired: boolean;
}

/**
 * DisplayPairPage — /display/pair
 *
 * Zero-distraction pairing screen for a dedicated wall device. Registers an
 * anonymous display identity, shows the 6-char code + QR big enough to read
 * across a room, and polls until the owner claims it from their phone at
 * /pair. If the code expires unclaimed, it silently re-registers (unclaimed
 * rows are harmless) and shows a fresh code. No spinners — the code renders
 * the moment it exists.
 */
export function DisplayPairPage() {
  const navigate = useNavigate();
  const displayId = useDisplayStore((s) => s.displayId);
  const setIdentity = useDisplayStore((s) => s.setIdentity);
  const setSyncActive = useDisplayStore((s) => s.setSyncActive);
  const clearIdentity = useDisplayStore((s) => s.clearIdentity);

  useWakeLock(true);

  const [code, setCodeState] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expiresAtDisplay, setExpiresAtDisplay] = useState<string | null>(
    null,
  );
  const expiresAtRef = useRef<string | null>(null);

  const setExpiresAt = (value: string | null) => {
    expiresAtRef.current = value;
    setExpiresAtDisplay(value);
  };

  // Tick the countdown display every second.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Registration + poll-for-claim loop. Runs once on mount; reads live
  // identity from the store rather than closed-over props so it survives
  // register → claim → expiry transitions without re-subscribing.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const register = async (): Promise<boolean> => {
      try {
        const res = await fetch("/api/displays/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "register" }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as RegisterResponse;
        if (cancelled) return true;
        setIdentity(data.displayId, data.deviceToken);
        setCodeState(data.code);
        setExpiresAt(data.expiresAt);
        return true;
      } catch {
        return false;
      }
    };

    const checkPaired = async (
      id: string,
      token: string,
    ): Promise<"paired" | "unpaired" | "gone" | "error"> => {
      try {
        const res = await fetch(
          `/api/displays/state?id=${encodeURIComponent(id)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.status === 404) return "gone";
        if (!res.ok) return "error";
        const data = (await res.json()) as StateResponse;
        return data.paired ? "paired" : "unpaired";
      } catch {
        return "error";
      }
    };

    const loop = async () => {
      const state = useDisplayStore.getState();
      const id = state.displayId;
      const token = state.deviceToken;

      if (id && token) {
        const status = await checkPaired(id, token);
        if (cancelled) return;

        if (status === "paired") {
          setSyncActive(true);
          navigate(`/display/${id}`, { replace: true });
          return;
        }
        if (status === "gone") {
          clearIdentity();
          setCodeState(null);
          setExpiresAt(null);
        } else if (status === "unpaired" && expiresAtRef.current === null) {
          // Reloaded mid-pairing: the code only lived in component state,
          // so there is nothing to show for this identity anymore. Abandon
          // it and mint a fresh one (unclaimed rows are harmless). On
          // transient "error" we keep polling instead — the display might
          // actually be paired and must not discard its identity.
          clearIdentity();
        }
      }

      const fresh = useDisplayStore.getState();
      const expired =
        expiresAtRef.current !== null &&
        Date.now() >= new Date(expiresAtRef.current).getTime();

      if (!fresh.displayId || !fresh.deviceToken || expired) {
        const ok = await register();
        if (cancelled) return;
        timer = setTimeout(() => void loop(), ok ? POLL_INTERVAL_MS : RETRY_DELAY_MS);
        return;
      }

      timer = setTimeout(() => void loop(), POLL_INTERVAL_MS);
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Mount-only: the loop reads live store state itself on each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // QR of the phone-facing claim URL.
  useEffect(() => {
    if (!code) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    const url = `${window.location.origin}/pair?code=${code}`;
    QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        // QR is a convenience — the code itself is always readable.
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const remainingMs = expiresAtDisplay
    ? new Date(expiresAtDisplay).getTime() - now
    : 0;
  const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = Math.floor(remainingSec / 60);
  const ss = remainingSec % 60;

  return (
    <div className="fixed inset-0 bg-void-black flex flex-col items-center justify-center gap-8 px-6 select-none">
      {displayId && !code && !expiresAtDisplay && (
        <p className="text-gray-500 text-sm font-mono">
          Checking pairing status…
        </p>
      )}

      {code && (
        <>
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-[0.4em] text-gray-500 mb-4">
              PropPulse Display Wall
            </p>
            <div className="font-orbitron text-white text-7xl sm:text-8xl tracking-[0.4em] pl-[0.4em]">
              {code}
            </div>
          </div>

          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt={`QR code to claim this display at ${window.location.origin}/pair?code=${code}`}
              className="w-[220px] h-[220px] rounded-lg bg-white p-2"
            />
          )}

          <p className="text-gray-400 text-base font-mono text-center max-w-md">
            On your phone, sign in to PropPulse and enter this code at{" "}
            <span className="text-gray-200">
              {window.location.origin}/pair
            </span>
          </p>

          {expiresAtDisplay && (
            <p className="text-plasma-orange/80 font-mono text-sm tracking-wide">
              Expires in {mm}:{ss.toString().padStart(2, "0")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

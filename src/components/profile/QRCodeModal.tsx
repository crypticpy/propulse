/**
 * QRCodeModal - Displays a QR code linking to the operator's QRZ.com profile.
 *
 * Generates a QR code data URL on mount / prop change via the `qrcode` package.
 * Handles loading, error, and success states gracefully.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { DetailModal } from "@/components/ui/DetailModal";

export interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  callsign: string;
  grid?: string;
}

export function QRCodeModal({
  isOpen,
  onClose,
  callsign,
  grid,
}: QRCodeModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !callsign) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDataUrl(null);

    const qrzUrl = `https://www.qrz.com/db/${encodeURIComponent(callsign)}`;

    QRCode.toDataURL(qrzUrl, {
      errorCorrectionLevel: "H",
      color: { dark: "#f97316", light: "#0a0a0f" },
      width: 256,
      margin: 2,
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to generate QR code",
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, callsign]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Station QR Code"
      subtitle="Share your QRZ.com profile"
      size="md"
    >
      <div className="flex flex-col items-center gap-4 py-4">
        {/* QR Code area */}
        {loading && (
          <div className="w-[256px] h-[256px] rounded-lg bg-panel/30 border border-white/5 animate-pulse" />
        )}

        {error && (
          <div className="w-[256px] h-[256px] rounded-lg bg-panel/30 border border-white/5 flex items-center justify-center p-4">
            <p className="text-sm text-alert-red text-center">{error}</p>
          </div>
        )}

        {dataUrl && !loading && !error && (
          <img
            src={dataUrl}
            alt={`QR code for ${callsign}`}
            width={256}
            height={256}
            className="rounded-lg border border-white/5"
          />
        )}

        {/* Callsign */}
        <p className="text-2xl font-mono font-bold text-plasma-orange">
          {callsign}
        </p>

        {/* Grid locator */}
        {grid && <p className="text-sm font-mono text-gray-400">{grid}</p>}

        {/* Description */}
        <p className="text-sm text-gray-400 text-center">
          Scan to look up on QRZ.com
        </p>

        {/* Close button */}
        <button
          onClick={onClose}
          className="mt-2 px-6 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          Close
        </button>
      </div>
    </DetailModal>
  );
}

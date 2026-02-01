/**
 * QRCodeDisplay - QR code generator for share codes
 */

import { useState, useEffect } from "react";
import QRCode from "qrcode";

export interface QRCodeDisplayProps {
  code: string;
  stationCallsign: string;
  size?: number;
}

export function QRCodeDisplay({
  code,
  stationCallsign,
  size = 200,
}: QRCodeDisplayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateQR = async () => {
      try {
        const deepLink = `propulse://guest?code=${code}&station=${stationCallsign}`;
        const dataUrl = await QRCode.toDataURL(deepLink, {
          width: size,
          margin: 2,
          color: { dark: "#FFFFFF", light: "#00000000" },
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(dataUrl);
        setError(null);
      } catch {
        setError("Failed to generate QR code");
        setQrDataUrl(null);
      }
    };
    generateQR();
  }, [code, stationCallsign, size]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-alert-red/10 border border-alert-red/30 rounded-xl">
        <p className="text-alert-red text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="p-4 bg-white rounded-xl">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR code for ${code}`}
            width={size}
            height={size}
          />
        ) : (
          <div
            style={{ width: size, height: size }}
            className="animate-pulse bg-gray-200 rounded"
          />
        )}
      </div>
      <p className="mt-3 font-mono text-2xl font-bold text-plasma-orange tracking-widest">
        {code}
      </p>
    </div>
  );
}

export default QRCodeDisplay;

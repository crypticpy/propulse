import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import QRCode from "qrcode";

/**
 * KioskQr - small always-on QR code in the wall display's corner linking
 * the current view, so a viewer can pull the same page up on their phone.
 */
export function KioskQr() {
  const location = useLocation();
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${window.location.origin}${location.pathname}`;
    QRCode.toDataURL(url, {
      width: 128,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch(() => {
        // QR is decorative — never let it break the kiosk
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (!dataUrl) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[515] opacity-50 pointer-events-none select-none">
      <img
        src={dataUrl}
        alt="Scan to open this view on your phone"
        className="w-16 h-16 rounded"
      />
    </div>
  );
}

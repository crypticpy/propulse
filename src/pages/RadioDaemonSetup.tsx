import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui";

type Platform = "windows" | "macos" | "linux";

const LS_PLATFORM_KEY = "propulse-radio-setup-platform";

function detectPlatform(): Platform {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const plat = typeof navigator !== "undefined" ? navigator.platform : "";
  const s = `${ua} ${plat}`.toLowerCase();
  if (s.includes("win")) return "windows";
  if (s.includes("mac")) return "macos";
  return "linux";
}

function platformLabel(p: Platform): string {
  switch (p) {
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
  }
}

function CommandBlock({ children }: { children: string }) {
  return (
    <pre className="text-xs md:text-sm bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto text-gray-100 font-mono">
      {children}
    </pre>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-white/10 border border-white/10 text-gray-200 flex items-center justify-center text-sm font-semibold">
          {n}
        </div>
        <div className="text-sm font-semibold text-gray-100">{title}</div>
      </div>
      <div className="text-sm text-gray-300 leading-relaxed pl-9">{children}</div>
    </div>
  );
}

export function RadioDaemonSetup() {
  const [platform, setPlatform] = useState<Platform>(() => {
    try {
      const saved = localStorage.getItem(LS_PLATFORM_KEY) as Platform | null;
      if (saved === "windows" || saved === "macos" || saved === "linux") return saved;
    } catch {
      // ignore
    }
    return detectPlatform();
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_PLATFORM_KEY, platform);
    } catch {
      // ignore
    }
  }, [platform]);

  const binaryName = useMemo(() => {
    if (platform === "windows") return "propulse-daemon-x86_64-pc-windows-msvc.exe";
    if (platform === "macos") return "propulse-daemon-macos-universal";
    return "propulse-daemon-x86_64-unknown-linux-gnu";
  }, [platform]);

  const configPath = useMemo(() => {
    if (platform === "windows") return "%APPDATA%\\propulse\\daemon.toml";
    return "~/.propulse/daemon.toml";
  }, [platform]);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Radio Setup (Daemon + SDRconnect)</h2>
          <p className="text-sm text-gray-500">
            A simple guide to get Propulse talking to your radio hardware (or SDRconnect) with the
            Propulse Radio Daemon.
          </p>
        </div>
        <Link
          to="/sdr"
          className="px-3 py-2 rounded-md bg-white/5 border border-white/10 text-gray-200 text-sm hover:bg-white/10"
        >
          Back to SDR Console
        </Link>
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-100">Pick your platform</div>
            <div className="text-xs text-gray-500">
              We’ll show the exact steps for {platformLabel(platform)}.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(["windows", "macos", "linux"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`px-3 py-2 rounded-md text-sm border transition-colors ${
                  platform === p
                    ? "bg-cosmic-cyan/15 border-cosmic-cyan/30 text-cosmic-cyan"
                    : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
                }`}
              >
                {platformLabel(p)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold text-gray-100">Quick picture</div>
          <ul className="mt-2 text-sm text-gray-300 space-y-1 list-disc pl-5">
            <li>
              The <span className="text-gray-100 font-semibold">daemon</span> runs on a computer on
              your network (often the one connected to your radio).
            </li>
            <li>
              Propulse connects to the daemon at{" "}
              <span className="text-gray-100 font-mono">ws://127.0.0.1:9867</span> (same machine) or
              a LAN IP (different device).
            </li>
            <li>
              For <span className="text-gray-100 font-semibold">SDRconnect</span>, the daemon can
              pull IQ from your Windows SDRconnect machine over the LAN and stream FFT/audio to
              Propulse.
            </li>
          </ul>
        </div>
      </Card>

      <Card className="p-4 space-y-5">
        <div className="text-sm font-semibold text-gray-100">Install and run the daemon</div>

        <Step n={1} title="Download the daemon (recommended)">
          <div className="space-y-2">
            <div>
              Go to{" "}
              <a
                className="text-cosmic-cyan hover:underline"
                href="https://github.com/crypticpy/propulse/releases"
                target="_blank"
                rel="noreferrer"
              >
                Propulse GitHub Releases
              </a>{" "}
              and download:{" "}
              <span className="text-gray-100 font-mono">{binaryName}</span>
            </div>
            <div className="text-xs text-gray-500">
              Tip: If you’re on Linux ARM (Raspberry Pi), you probably want{" "}
              <span className="text-gray-300 font-mono">propulse-daemon-aarch64-unknown-linux-gnu</span>.
            </div>
          </div>
        </Step>

        <Step n={2} title="Start it once (it will create a config file)">
          <div className="space-y-2">
            {platform === "windows" ? (
              <>
                <div>Open PowerShell in the folder where you downloaded the file, then run:</div>
                <CommandBlock>{`./${binaryName}`}</CommandBlock>
              </>
            ) : (
              <>
                <div>Open Terminal in the folder where you downloaded the file, then run:</div>
                <CommandBlock>{`chmod +x ./${binaryName}\n./${binaryName}`}</CommandBlock>
              </>
            )}
            <div>
              The config file location (you can edit it later):{" "}
              <span className="text-gray-100 font-mono">{configPath}</span>
            </div>
          </div>
        </Step>

        <Step n={3} title="Make sure Propulse can reach it">
          <div className="space-y-2">
            <div>
              If Propulse is running on the <span className="text-gray-100">same computer</span> as
              the daemon, you’re done — use the default daemon URL:
            </div>
            <CommandBlock>{`ws://127.0.0.1:9867`}</CommandBlock>
            <div>
              If Propulse is on a <span className="text-gray-100">different device</span> (tablet,
              laptop, another PC), edit the config and set:
            </div>
            <CommandBlock>{`[server]\nbind = "0.0.0.0"\nport = 9867`}</CommandBlock>
            <div className="text-xs text-gray-500">
              You may need to allow port 9867 through your firewall.
            </div>
          </div>
        </Step>
      </Card>

      <Card className="p-4 space-y-5">
        <div className="text-sm font-semibold text-gray-100">Connect SDRconnect (LAN)</div>
        <div className="text-sm text-gray-300 leading-relaxed">
          If SDRconnect is running on a Windows machine on your network, add an SDRconnect radio to
          your daemon config. You’ll need the SDRconnect WebSocket URL (IP + port) and either a{" "}
          <span className="text-gray-100">device id</span> or{" "}
          <span className="text-gray-100">serial</span>.
        </div>

        <Step n={1} title="Add this to your daemon config">
          <CommandBlock>{`[radio.sdrconnect]\nenabled = true\n\n[[radio.sdrconnect.radios]]\nname = "SDRconnect (LAN)"\nurl = "ws://192.168.1.50:5000"\ndevice_id = 0\nsample_rate = 2048000\nformat = "s16le"\n# gain = 20\n# ppm = 0\n# squelch = 0`}</CommandBlock>
          <div className="text-xs text-gray-500">
            The port in the example (<span className="text-gray-300 font-mono">5000</span>) is just
            a placeholder — use whatever SDRconnect provides.
          </div>
        </Step>

        <Step n={2} title="Restart the daemon">
          <div>
            Stop the daemon and start it again. Then open Propulse →{" "}
            <span className="text-gray-100">SDR Console</span> →{" "}
            <span className="text-gray-100">Change Daemon</span> and pick your SDRconnect radio.
          </div>
        </Step>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="text-sm font-semibold text-gray-100">
          If you’re using Propulse on the public website (HTTPS)
        </div>
        <div className="text-sm text-gray-300 leading-relaxed">
          Browsers usually block{" "}
          <span className="text-gray-100 font-mono">ws://</span> connections from an{" "}
          <span className="text-gray-100">https://</span> page. If you open Propulse at{" "}
          <span className="text-gray-100 font-mono">https://propulse.vercel.app</span> (or any HTTPS
          host), install the Chrome bridge extension to connect to your local/LAN daemon.
        </div>
        <Step n={1} title="Install the Chrome extension (unpacked)">
          <div className="space-y-2">
            <div className="text-sm text-gray-300">
              First, download the Propulse source code (ZIP) from{" "}
              <a
                className="text-cosmic-cyan hover:underline"
                href="https://github.com/crypticpy/propulse"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              .
            </div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                Open <span className="text-gray-100 font-mono">chrome://extensions</span>
              </li>
              <li>Enable Developer mode</li>
              <li>Click “Load unpacked”</li>
              <li>
                Select the folder{" "}
                <span className="text-gray-100 font-mono">
                  extensions/propulse-daemon-bridge
                </span>{" "}
                from the Propulse folder you downloaded
              </li>
            </ol>
          </div>
        </Step>
        <div className="text-xs text-gray-500">
          Once installed, Propulse will automatically use the extension when you connect to a{" "}
          <span className="text-gray-300 font-mono">ws://</span> daemon URL from an HTTPS page.
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-100">Troubleshooting</div>
        <ul className="text-sm text-gray-300 space-y-2 list-disc pl-5">
          <li>
            <span className="text-gray-100 font-semibold">“Offline” in SDR Console</span>: confirm
            the daemon is running and the URL is correct. If on LAN, check firewall +{" "}
            <span className="text-gray-100 font-mono">server.bind = "0.0.0.0"</span>.
          </li>
          <li>
            <span className="text-gray-100 font-semibold">HTTPS mixed content error</span>: install
            the Chrome bridge extension (above), or run Propulse locally on{" "}
            <span className="text-gray-100 font-mono">http://localhost</span>.
          </li>
          <li>
            <span className="text-gray-100 font-semibold">No SDRconnect audio/FFT</span>: verify
            the SDRconnect URL + device id/serial, then restart the daemon.
          </li>
        </ul>
      </Card>
    </div>
  );
}

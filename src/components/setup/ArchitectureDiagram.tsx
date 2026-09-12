/**
 * Shared three-tier architecture diagram (browser → bridge → Hamlib/DX
 * Cluster/WSJT-X → radio), previously duplicated as BridgeInfoPage's
 * `ArchitectureDiagram` and SetupGuidePage's `SetupArchitectureDiagram`
 * (#1097). The default treatment follows BridgeInfoPage's version: it is
 * the taller layout with a "Transceiver" subtitle under "Your Radio", and
 * BridgeInfoPage is the page that also renders live connection state next
 * to it. SetupGuidePage's version was a purely cosmetic 40px-shorter
 * variant with no radio subtitle; the one thing it carried that this one
 * did not was the WSJT-X port in its "UDP 2237" subtitle, which is kept
 * here because it is the number a reader has to type into WSJT-X. Nothing
 * else differed, so there are no page-specific props beyond `connected`.
 */
export function ArchitectureDiagram({ connected }: { connected: boolean }) {
  const lineColor = connected
    ? "rgba(255,255,255,0.25)"
    : "rgba(255,255,255,0.08)";
  const lineStroke = connected ? undefined : "4 4";
  const dotColor = connected ? "#00ff88" : "transparent";

  return (
    <div className="overflow-x-auto" role="region" aria-label="Bridge architecture (scroll horizontally)" tabIndex={0}>
    <svg
      style={{ minWidth: 710 }}
      viewBox="0 0 710 350"
      className="w-full h-auto"
      role="img"
      aria-label="ProPulse Bridge architecture diagram showing browser connected to bridge server, which interfaces with Hamlib, DX Cluster, and WSJT-X"
    >
      <defs>
        {/* Glass box fill */}
        <linearGradient id="setup-arch-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
        <linearGradient
          id="setup-arch-glass-orange"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor="rgba(255,107,53,0.08)" />
          <stop offset="100%" stopColor="rgba(255,107,53,0.02)" />
        </linearGradient>
        <linearGradient id="setup-arch-glass-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,255,136,0.06)" />
          <stop offset="100%" stopColor="rgba(0,255,136,0.02)" />
        </linearGradient>
        {/* Animated dot along path */}
        {connected && (
          <circle id="setup-arch-travel-dot" r="3" fill={dotColor}>
            <style>{`
              @media (prefers-reduced-motion: no-preference) {
                .setup-arch-travel-dot {
                  offset-distance: 0%;
                  animation: setup-arch-dot-travel 3s linear infinite;
                }
                @keyframes setup-arch-dot-travel {
                  0% { offset-distance: 0%; }
                  100% { offset-distance: 100%; }
                }
              }
            `}</style>
          </circle>
        )}
      </defs>

      {/* Propulse Browser box */}
      <rect
        x="40"
        y="60"
        width="180"
        height="80"
        rx="12"
        fill="url(#setup-arch-glass-orange)"
        stroke="rgba(255,107,53,0.25)"
        strokeWidth="1"
      />
      <text
        x="130"
        y="93"
        textAnchor="middle"
        className="fill-plasma-orange text-[13px] font-semibold"
        fontFamily="Orbitron, sans-serif"
      >
        Propulse
      </text>
      <text
        x="130"
        y="115"
        textAnchor="middle"
        className="fill-su-muted text-xs"
      >
        (Browser)
      </text>

      {/* Bridge Server box */}
      <rect
        x="400"
        y="60"
        width="180"
        height="80"
        rx="12"
        fill="url(#setup-arch-glass-green)"
        stroke="rgba(0,255,136,0.25)"
        strokeWidth="1"
      />
      <text
        x="490"
        y="93"
        textAnchor="middle"
        className="fill-signal-green text-[13px] font-semibold"
        fontFamily="Orbitron, sans-serif"
      >
        Bridge Server
      </text>
      <text
        x="490"
        y="115"
        textAnchor="middle"
        className="fill-su-muted text-xs"
      >
        localhost:9867
      </text>

      {/* WebSocket connection line */}
      <line
        x1="220"
        y1="100"
        x2="400"
        y2="100"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeDasharray={lineStroke}
      />
      <text
        x="310"
        y="88"
        textAnchor="middle"
        className="fill-su-muted text-xs font-mono"
      >
        WebSocket
      </text>
      {/* Arrow heads */}
      <polygon points="395,96 405,100 395,104" fill={lineColor} />
      <polygon points="225,96 215,100 225,104" fill={lineColor} />
      {/* Traveling dot on main connection */}
      {connected && (
        <circle
          r="3"
          fill={dotColor}
          className="setup-arch-travel-dot"
          style={{ offsetPath: "path('M 220 100 L 400 100')" }}
        />
      )}

      {/* Vertical line from Bridge down */}
      <line
        x1="490"
        y1="140"
        x2="490"
        y2="180"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeDasharray={lineStroke}
      />

      {/* Three branch lines */}
      <line
        x1="490"
        y1="180"
        x2="350"
        y2="180"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="490"
        y1="180"
        x2="490"
        y2="200"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="490"
        y1="180"
        x2="630"
        y2="180"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />

      <line
        x1="350"
        y1="180"
        x2="350"
        y2="200"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="630"
        y1="180"
        x2="630"
        y2="200"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />

      {/* Hamlib box */}
      <rect
        x="290"
        y="200"
        width="120"
        height="60"
        rx="8"
        fill="url(#setup-arch-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="350"
        y="225"
        textAnchor="middle"
        className="fill-su-text text-xs font-semibold"
      >
        Hamlib
      </text>
      <text
        x="350"
        y="242"
        textAnchor="middle"
        className="fill-su-muted text-xs"
      >
        rigctld
      </text>

      {/* DX Cluster box */}
      <rect
        x="430"
        y="200"
        width="120"
        height="60"
        rx="8"
        fill="url(#setup-arch-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="490"
        y="225"
        textAnchor="middle"
        className="fill-su-text text-xs font-semibold"
      >
        DX Cluster
      </text>
      <text
        x="490"
        y="242"
        textAnchor="middle"
        className="fill-su-muted text-xs"
      >
        Telnet
      </text>

      {/* WSJT-X box */}
      <rect
        x="570"
        y="200"
        width="120"
        height="60"
        rx="8"
        fill="url(#setup-arch-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="630"
        y="225"
        textAnchor="middle"
        className="fill-su-text text-xs font-semibold"
      >
        WSJT-X
      </text>
      <text
        x="630"
        y="242"
        textAnchor="middle"
        className="fill-su-muted text-xs"
      >
        UDP 2237
      </text>

      {/* Line from Hamlib to Radio */}
      <line
        x1="350"
        y1="260"
        x2="350"
        y2="290"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <polygon points="346,285 350,295 354,285" fill={lineColor} />

      {/* Your Radio box */}
      <rect
        x="290"
        y="290"
        width="120"
        height="50"
        rx="8"
        fill="url(#setup-arch-glass-orange)"
        stroke="rgba(255,107,53,0.2)"
        strokeWidth="1"
      />
      <text
        x="350"
        y="312"
        textAnchor="middle"
        className="fill-plasma-orange text-xs font-semibold"
      >
        Your Radio
      </text>
      <text
        x="350"
        y="328"
        textAnchor="middle"
        className="fill-su-muted text-xs"
      >
        Transceiver
      </text>
    </svg>
    </div>
  );
}

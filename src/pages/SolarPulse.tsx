import { Link } from "react-router-dom";

export function SolarPulse() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-panel sticky top-0 z-50 px-8 py-5">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-4xl animate-pulse-glow">
              ☀️
            </Link>
            <div>
              <h1 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
                SOLAR PULSE
              </h1>
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Real-time solar conditions
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg text-signal-green font-semibold">
              {new Date().toISOString().slice(11, 19)} UTC
            </div>
            <div className="text-xs text-gray-500">Live data updates</div>
          </div>
        </div>
      </header>

      {/* Main content - placeholder until components are built */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="glass-card p-8 text-center">
          <p className="text-gray-400">Solar dashboard components loading...</p>
          <p className="text-sm text-gray-500 mt-2">
            Building: Primary Metrics, Band Conditions, K-Index Chart, Flare
            Probability
          </p>
        </div>
      </main>
    </div>
  );
}

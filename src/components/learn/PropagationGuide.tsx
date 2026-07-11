import { useState } from "react";
import { Card } from "@/components/ui";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-white/10 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left hover:bg-white/5 transition-colors rounded-lg px-2 -mx-2"
      >
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <span
          className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </span>
      </button>
      {isOpen && <div className="pb-4 space-y-4">{children}</div>}
    </div>
  );
}

function KeyTakeaway({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-plasma-orange/10 border border-plasma-orange/30 rounded-lg p-4 my-4">
      <div className="flex items-start gap-3">
        <span className="text-plasma-orange text-lg">*</span>
        <div className="text-sm text-gray-200">{children}</div>
      </div>
    </div>
  );
}

function IonosphereLayerDiagram() {
  return (
    <div className="bg-cosmic-dark/50 rounded-lg p-4 my-4">
      <div className="relative h-64 border-l-2 border-white/20">
        {/* Altitude scale */}
        <div className="absolute -left-12 top-0 text-xs text-gray-500">
          500km
        </div>
        <div className="absolute -left-12 top-1/4 text-xs text-gray-500">
          300km
        </div>
        <div className="absolute -left-12 top-1/2 text-xs text-gray-500">
          150km
        </div>
        <div className="absolute -left-12 top-3/4 text-xs text-gray-500">
          90km
        </div>
        <div className="absolute -left-12 bottom-0 text-xs text-gray-500">
          50km
        </div>

        {/* F2 Layer */}
        <div className="absolute left-4 top-[5%] right-4 h-[20%] bg-cosmic-cyan/20 border border-cosmic-cyan/40 rounded flex items-center justify-center">
          <span className="text-cosmic-cyan font-semibold text-sm">
            F2 Layer (200-500km)
          </span>
        </div>

        {/* F1 Layer */}
        <div className="absolute left-4 top-[28%] right-4 h-[15%] bg-aurora-purple/20 border border-aurora-purple/40 rounded flex items-center justify-center">
          <span className="text-aurora-purple font-semibold text-sm">
            F1 Layer (150-200km)
          </span>
        </div>

        {/* E Layer */}
        <div className="absolute left-4 top-[48%] right-4 h-[15%] bg-signal-green/20 border border-signal-green/40 rounded flex items-center justify-center">
          <span className="text-signal-green font-semibold text-sm">
            E Layer (90-150km)
          </span>
        </div>

        {/* D Layer */}
        <div className="absolute left-4 top-[72%] right-4 h-[15%] bg-caution-amber/20 border border-caution-amber/40 rounded flex items-center justify-center">
          <span className="text-caution-amber font-semibold text-sm">
            D Layer (50-90km)
          </span>
        </div>

        {/* Earth surface indicator */}
        <div className="absolute left-4 bottom-0 right-4 h-1 bg-white/30 rounded" />
      </div>
      <p className="text-xs text-gray-500 mt-2 text-center">
        Ionospheric layers and their approximate altitudes
      </p>
    </div>
  );
}

function PropagationPathDiagram() {
  return (
    <div className="bg-cosmic-dark/50 rounded-lg p-4 my-4">
      <svg viewBox="0 0 400 150" className="w-full h-auto">
        {/* Earth curve */}
        <ellipse
          cx="200"
          cy="200"
          rx="180"
          ry="180"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="2"
        />

        {/* Ionosphere arc */}
        <ellipse
          cx="200"
          cy="200"
          rx="230"
          ry="230"
          fill="none"
          stroke="rgba(0,255,170,0.3)"
          strokeWidth="20"
          strokeDasharray="0 180 400"
        />

        {/* Ground wave */}
        <path
          d="M 40 130 Q 90 125 140 130"
          fill="none"
          stroke="#FFB347"
          strokeWidth="2"
        />
        <text x="60" y="145" fill="#FFB347" fontSize="10">
          Ground Wave
        </text>

        {/* Sky wave - single hop */}
        <path
          d="M 150 130 Q 200 40 250 130"
          fill="none"
          stroke="#00FFAA"
          strokeWidth="2"
        />
        <text x="175" y="30" fill="#00FFAA" fontSize="10">
          Sky Wave
        </text>

        {/* Skip zone */}
        <line
          x1="140"
          y1="130"
          x2="150"
          y2="130"
          stroke="#FF4455"
          strokeWidth="2"
          strokeDasharray="3"
        />
        <text x="135" y="145" fill="#FF4455" fontSize="8">
          Skip Zone
        </text>

        {/* Multi-hop */}
        <path
          d="M 260 130 Q 290 60 320 130 Q 350 60 380 130"
          fill="none"
          stroke="#00D4FF"
          strokeWidth="2"
        />
        <text x="310" y="50" fill="#00D4FF" fontSize="10">
          Multi-hop
        </text>

        {/* Transmitter */}
        <rect x="35" y="125" width="10" height="15" fill="#FFB347" />
        <line
          x1="40"
          y1="110"
          x2="40"
          y2="125"
          stroke="#FFB347"
          strokeWidth="2"
        />
      </svg>
      <p className="text-xs text-gray-500 mt-2 text-center">
        Ground wave, sky wave, and multi-hop propagation paths
      </p>
    </div>
  );
}

/**
 * PropagationGuide - Educational content about HF propagation
 */
export function PropagationGuide() {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-gray-300 mb-6">
          Understanding how radio waves travel is key to making successful
          contacts. This guide explains the fundamentals of HF propagation in
          beginner-friendly terms.
        </p>

        <Section title="1. The Ionosphere" defaultOpen>
          <p className="text-gray-300">
            The ionosphere is a region of Earth's upper atmosphere, from about
            50 to 500 kilometers altitude, where solar radiation ionizes gas
            molecules. This creates layers of charged particles that can bend
            (refract) radio waves back toward Earth, enabling long-distance
            communication.
          </p>

          <IonosphereLayerDiagram />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-caution-amber/10 border border-caution-amber/30 rounded-lg p-3">
              <h4 className="font-semibold text-caution-amber mb-1">
                D Layer (50-90 km)
              </h4>
              <p className="text-sm text-gray-300">
                Present only during daytime. Absorbs rather than reflects
                signals, especially on lower frequencies (160m, 80m). This is
                why these bands work better at night.
              </p>
            </div>
            <div className="bg-signal-green/10 border border-signal-green/30 rounded-lg p-3">
              <h4 className="font-semibold text-signal-green mb-1">
                E Layer (90-150 km)
              </h4>
              <p className="text-sm text-gray-300">
                Can support regional "short skip" propagation. Sporadic E (Es)
                events can create excellent propagation on 10m, 6m, and even
                VHF.
              </p>
            </div>
            <div className="bg-aurora-purple/10 border border-aurora-purple/30 rounded-lg p-3">
              <h4 className="font-semibold text-aurora-purple mb-1">
                F1 Layer (150-200 km)
              </h4>
              <p className="text-sm text-gray-300">
                Present during daytime, merges with F2 at night. Contributes to
                daytime propagation on higher HF bands.
              </p>
            </div>
            <div className="bg-cosmic-cyan/10 border border-cosmic-cyan/30 rounded-lg p-3">
              <h4 className="font-semibold text-cosmic-cyan mb-1">
                F2 Layer (200-500 km)
              </h4>
              <p className="text-sm text-gray-300">
                The primary layer for long-distance HF communication. Present
                day and night, though weaker at night. Responsible for most
                worldwide DX contacts.
              </p>
            </div>
          </div>

          <KeyTakeaway>
            The F2 layer is your best friend for DX. It's the highest layer and
            bends signals back to Earth over the greatest distances.
          </KeyTakeaway>
        </Section>

        <Section title="2. How Radio Waves Travel">
          <p className="text-gray-300">
            Radio signals reach distant stations through different propagation
            modes, each with its own characteristics and limitations.
          </p>

          <PropagationPathDiagram />

          <div className="space-y-4 mt-4">
            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="font-semibold text-plasma-orange mb-2">
                Ground Wave
              </h4>
              <p className="text-sm text-gray-300">
                Signals that follow Earth's surface. Reliable but limited range
                (typically under 100 miles on HF). Works best at lower
                frequencies. Used for local communication.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="font-semibold text-signal-green mb-2">
                Sky Wave (Single Hop)
              </h4>
              <p className="text-sm text-gray-300">
                Signals refracted by the ionosphere back to Earth. Can cover
                500-2500 miles per hop depending on frequency and ionospheric
                conditions. This is the primary mode for DX.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="font-semibold text-cosmic-cyan mb-2">Multi-Hop</h4>
              <p className="text-sm text-gray-300">
                Signals bouncing between ionosphere and Earth multiple times.
                Enables worldwide communication. Each hop loses some signal
                strength but can span the globe.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="font-semibold text-alert-red mb-2">Skip Zone</h4>
              <p className="text-sm text-gray-300">
                The area too far for ground wave but too close for sky wave.
                Stations in your skip zone won't hear you. Skip zone size varies
                with frequency—higher frequencies have larger skip zones.
              </p>
            </div>
          </div>

          <KeyTakeaway>
            On 20 meters, you might not hear stations 200 miles away (in your
            skip zone) but could easily contact someone 3000 miles distant. This
            is normal!
          </KeyTakeaway>
        </Section>

        <Section title="3. Solar Influence">
          <p className="text-gray-300">
            The sun drives ionospheric conditions. Solar radiation creates the
            ionosphere, and solar activity determines how well it supports radio
            propagation.
          </p>

          <div className="bg-white/5 rounded-lg p-4 my-4">
            <h4 className="font-semibold text-plasma-orange mb-3">
              Key Solar Indicators
            </h4>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="bg-plasma-orange/20 text-plasma-orange px-2 py-1 rounded text-xs font-mono">
                  SFI
                </span>
                <div>
                  <p className="text-white font-medium">Solar Flux Index</p>
                  <p className="text-sm text-gray-400">
                    Measures solar radio emissions. Higher = more ionization =
                    better propagation. Values: 65-80 (poor), 80-120 (fair),
                    120-180 (good), 180+ (excellent).
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-signal-green/20 text-signal-green px-2 py-1 rounded text-xs font-mono">
                  SSN
                </span>
                <div>
                  <p className="text-white font-medium">Sunspot Number</p>
                  <p className="text-sm text-gray-400">
                    Count of visible spots on the sun. Correlates with SFI.
                    Higher numbers during solar maximum mean better conditions
                    on higher bands.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-cosmic-cyan/20 text-cosmic-cyan px-2 py-1 rounded text-xs font-mono">
                  MUF
                </span>
                <div>
                  <p className="text-white font-medium">
                    Maximum Usable Frequency
                  </p>
                  <p className="text-sm text-gray-400">
                    The highest frequency that will be refracted back to Earth.
                    Frequencies above the MUF pass through to space. MUF varies
                    by path and time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-aurora-purple/10 border border-aurora-purple/30 rounded-lg p-4">
            <h4 className="font-semibold text-aurora-purple mb-2">
              The 11-Year Solar Cycle
            </h4>
            <p className="text-sm text-gray-300">
              Solar activity follows an approximately 11-year cycle. During
              solar maximum, expect excellent propagation on 10m, 12m, and 15m.
              During solar minimum, lower bands (40m, 80m, 160m) become more
              important. We're currently in Solar Cycle 25, heading toward
              maximum.
            </p>
          </div>

          <KeyTakeaway>
            Check the Solar Flux Index (SFI) on Propulse before operating. When
            SFI is above 150, 10 meters can be amazing. When it's below 80,
            stick to 20m and lower.
          </KeyTakeaway>
        </Section>

        <Section title="4. The K-Index and Geomagnetic Activity">
          <p className="text-gray-300">
            While solar radiation helps propagation, geomagnetic disturbances
            hurt it. The K-Index measures geomagnetic activity on a scale of
            0-9.
          </p>

          <div className="grid grid-cols-5 gap-1 my-4">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
              <div
                key={k}
                className={`p-2 rounded text-center text-sm font-mono ${
                  k <= 2
                    ? "bg-signal-green/20 text-signal-green"
                    : k <= 4
                      ? "bg-caution-amber/20 text-caution-amber"
                      : "bg-alert-red/20 text-alert-red"
                }`}
              >
                K{k}
              </div>
            ))}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-signal-green"></span>
              <span className="text-gray-300">
                K0-K2: Quiet conditions, excellent for DX
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-caution-amber"></span>
              <span className="text-gray-300">
                K3-K4: Unsettled, some degradation possible
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-alert-red"></span>
              <span className="text-gray-300">
                K5+: Storm conditions, polar paths disrupted
              </span>
            </div>
          </div>

          <div className="bg-alert-red/10 border border-alert-red/30 rounded-lg p-4 mt-4">
            <h4 className="font-semibold text-alert-red mb-2">
              Geomagnetic Storms
            </h4>
            <p className="text-sm text-gray-300">
              When K-Index reaches 5 or higher, a geomagnetic storm is in
              progress. These storms can cause radio blackouts, especially on
              paths passing near the poles (like US to Europe or US to Japan via
              the short path). During storms, try paths that avoid the auroral
              zone.
            </p>
          </div>

          <KeyTakeaway>
            Plan DX sessions when K-Index is 2 or lower. If you're working polar
            paths (like US to Scandinavia), even K3 can cause problems.
          </KeyTakeaway>
        </Section>

        <Section title="5. Day vs. Night Propagation">
          <p className="text-gray-300">
            Propagation changes dramatically between day and night because the
            sun controls ionization levels.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
            <div className="bg-plasma-orange/10 border border-plasma-orange/30 rounded-lg p-4">
              <h4 className="font-semibold text-plasma-orange mb-2 flex items-center gap-2">
                <span>Daytime</span>
              </h4>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>- D layer absorbs low frequencies</li>
                <li>- Higher bands (10m-20m) work best</li>
                <li>- Shorter skip distances</li>
                <li>- Stronger signals, less fading</li>
                <li>- Best for: 10m, 12m, 15m, 17m, 20m</li>
              </ul>
            </div>
            <div className="bg-cosmic-cyan/10 border border-cosmic-cyan/30 rounded-lg p-4">
              <h4 className="font-semibold text-cosmic-cyan mb-2 flex items-center gap-2">
                <span>Nighttime</span>
              </h4>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>- D layer disappears</li>
                <li>- Lower bands (40m-160m) open up</li>
                <li>- Longer skip distances</li>
                <li>- More fading, atmospheric noise</li>
                <li>- Best for: 30m, 40m, 80m, 160m</li>
              </ul>
            </div>
          </div>

          <div className="bg-aurora-purple/10 border border-aurora-purple/30 rounded-lg p-4">
            <h4 className="font-semibold text-aurora-purple mb-2">
              The Gray Line Advantage
            </h4>
            <p className="text-sm text-gray-300">
              The gray line is the twilight zone between day and night.
              Propagation along this line can be exceptional because the D layer
              is weak (less absorption) while the F layer is still ionized. Many
              DX records are set during gray line openings.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Tip: Use Propulse's PropSphere map to see the current gray line
              position.
            </p>
          </div>

          <KeyTakeaway>
            Think "high bands during day, low bands at night." The transition
            periods (sunrise and sunset) often offer the best DX opportunities
            on all bands.
          </KeyTakeaway>
        </Section>
      </Card>
    </div>
  );
}

export default PropagationGuide;

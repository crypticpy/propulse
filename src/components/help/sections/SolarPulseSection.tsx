import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpDataTable } from "@/components/help/HelpDataTable";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function SolarPulseSection() {
  return (
    <div className="space-y-6">
      {/* Overview — no accordion */}
      <p className="text-sm leading-relaxed text-gray-300">
        Solar Pulse is your mission control for space weather. It displays
        real-time data from NOAA's Space Weather Prediction Center (SWPC),
        including geomagnetic scales, solar flare monitoring, solar wind
        measurements, and propagation forecasts. While the Dashboard gives you a
        quick "go/no-go" for operating, Solar Pulse lets you dig into the
        underlying physics to understand <em>why</em> conditions are the way
        they are and <em>where</em> they're headed.
      </p>

      {/* NOAA Space Weather Scales */}
      <HelpAccordion
        id="noaa-scales"
        title="NOAA Space Weather Scales"
        summary="R (Radio), S (Radiation), and G (Geomagnetic) severity scales from NOAA"
      >
        <div className="space-y-5 text-sm text-gray-300 leading-relaxed">
          {/* R-Scale */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              R-Scale (Radio Blackouts)
            </h4>
            <p>
              The R-Scale rates radio blackout events caused by solar X-ray
              flares, ranging from R0 (no event) through R5 (extreme). These
              events affect the sunlit hemisphere of Earth by dramatically
              increasing D-layer ionization, which absorbs HF radio waves.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>R1-R2 (Minor/Moderate):</strong> HF degradation on the
                sunlit side, particularly on lower HF frequencies. Navigation
                signals (GPS) may see minor degradation. Most amateur contacts
                still possible on higher bands.
              </li>
              <li>
                <strong>R3 (Strong):</strong> Wide-area HF blackout lasting
                approximately 1 hour. Expect no usable HF propagation on the
                sunlit hemisphere during peak absorption.
              </li>
              <li>
                <strong>R4-R5 (Severe/Extreme):</strong> Complete HF blackout
                lasting 1-4+ hours on the entire sunlit hemisphere. Even strong
                commercial signals are disrupted.
              </li>
            </ul>
            <HelpCallout type="note">
              R-scale events follow solar flares and affect the sunlit
              hemisphere within 8 minutes (the speed of light). If you are
              operating on the nightside of Earth, you may be unaffected.
            </HelpCallout>
          </div>

          {/* S-Scale */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              S-Scale (Solar Radiation Storms)
            </h4>
            <p>
              The S-Scale rates solar radiation storms caused by energetic
              proton events, ranging from S0 (none) through S5 (extreme). These
              events are produced when coronal mass ejections (CMEs) or large
              flares accelerate protons to very high energies.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>S1-S2 (Minor/Moderate):</strong> Minor polar cap
                absorption (PCA). HF slightly degraded at polar latitudes but
                mid-latitude paths are largely unaffected.
              </li>
              <li>
                <strong>S3+ (Strong and above):</strong> Significant polar HF
                blackout. Transpolar routes become unusable. Satellite anomalies
                may occur. At S4-S5, even mid-latitude HF can be impacted.
              </li>
            </ul>
            <HelpCallout type="note">
              Radiation storms primarily affect polar and transpolar HF paths.
              If your propagation path avoids the polar regions, you may see
              minimal impact from S1-S2 events.
            </HelpCallout>
          </div>

          {/* G-Scale */}
          <div>
            <h4 className="text-white font-semibold mb-1.5">
              G-Scale (Geomagnetic Storms)
            </h4>
            <p>
              The G-Scale rates geomagnetic storms from G0 (quiet) through G5
              (extreme). These are caused by disturbances in the solar wind
              (usually from CMEs or coronal hole high-speed streams) interacting
              with Earth's magnetosphere.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>G1-G2 (Minor/Moderate):</strong> HF propagation may be
                intermittent, especially on high-latitude and transpolar paths.
                Aurora visible at higher latitudes. K-Index 5-6.
              </li>
              <li>
                <strong>G3 (Strong):</strong> HF intermittent on many paths.
                Aurora visible at mid-latitudes. GPS accuracy degraded. K-Index
                7.
              </li>
              <li>
                <strong>G4-G5 (Severe/Extreme):</strong> HF blackout likely on
                most bands. Widespread aurora (possibly visible from low
                latitudes). Power grid effects possible. K-Index 8-9.
              </li>
            </ul>
            <HelpCallout type="tip">
              G1-G2 storms can actually enhance low-band (80 m, 160 m)
              propagation while degrading high bands. The disturbed ionosphere
              increases D-layer absorption at high frequencies but can create
              favorable reflection conditions for low-frequency signals,
              especially after sunset.
            </HelpCallout>
          </div>
        </div>
      </HelpAccordion>

      {/* GOES X-Ray Flare Monitor */}
      <HelpAccordion
        id="xray-flares"
        title="GOES X-Ray Flare Monitor"
        summary="Real-time solar flare classification from the GOES satellite"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The X-ray flux monitor displays real-time solar flare data from
            NOAA's GOES satellite. Solar flares are sudden, intense bursts of
            electromagnetic radiation from the Sun's surface that directly
            impact HF propagation by increasing ionization in the D-layer.
          </p>

          <p>
            Flares are classified on a logarithmic scale based on peak X-ray
            flux measured in the 1-8 Angstrom band:
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>A / B class:</strong> Background solar activity. No impact
              on HF propagation.
            </li>
            <li>
              <strong>C class:</strong> Minor flare. Brief HF degradation
              possible on the sunlit hemisphere, typically lasting a few minutes
              to tens of minutes.
            </li>
            <li>
              <strong>M class:</strong> Moderate flare. Causes an HF blackout on
              the sunlit side lasting 10-60 minutes. R1-R2 on the NOAA scale.
            </li>
            <li>
              <strong>X class:</strong> Major flare. Severe HF blackout on the
              sunlit hemisphere lasting 1 or more hours. R3+ on the NOAA scale.
            </li>
          </ul>

          <p>
            The panel shows both the <strong>current</strong> flare class (what
            is happening right now) and the <strong>max</strong> class (the peak
            of the most recent flare event), along with begin and peak
            timestamps.
          </p>

          <HelpCallout type="warning">
            An X-class flare can cause an immediate HF blackout on the sunlit
            hemisphere. If you see X-class activity, expect disrupted
            propagation for 1-4 hours. The blackout begins within 8 minutes of
            the flare (speed of light) and peaks with the flare's X-ray peak.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Solar Wind */}
      <HelpAccordion
        id="solar-wind"
        title="Solar Wind"
        summary="Real-time solar wind speed, density, and magnetic field measurements"
      >
        <div className="space-y-5 text-sm text-gray-300 leading-relaxed">
          <p>
            The Solar Wind panel shows 5-minute resolution measurements from
            spacecraft at the L1 Lagrange point (approximately 1.5 million km
            upstream of Earth). These readings tell you what the solar wind is
            doing right <em>now</em> and what Earth's magnetosphere will
            experience within the next 15-60 minutes.
          </p>

          {/* Speed */}
          <div>
            <h4 className="text-white font-semibold mb-1">Speed (km/s)</h4>
            <p>The bulk velocity of the solar wind plasma stream.</p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-1.5">
              <li>
                <strong>300-500 km/s:</strong> Normal — Background solar wind.
                No significant geomagnetic impact.
              </li>
              <li>
                <strong>500-700 km/s:</strong> Elevated — Often from coronal
                hole high-speed streams (CH HSS). Can produce G1-G2 conditions
                if combined with southward Bz.
              </li>
              <li>
                <strong>&gt; 700 km/s:</strong> Extreme — Usually from a CME
                arrival. High potential for G3+ geomagnetic storm conditions.
              </li>
            </ul>
          </div>

          {/* Density */}
          <div>
            <h4 className="text-white font-semibold mb-1">
              Density (particles/cc)
            </h4>
            <p>
              The number of protons per cubic centimeter in the solar wind.
              Dense solar wind carries more energy into Earth's magnetosphere.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-1.5">
              <li>
                <strong>1-10 p/cc:</strong> Typical — Normal background levels.
              </li>
              <li>
                <strong>&gt; 15 p/cc:</strong> High — A density spike often
                precedes a CME shock front arrival. When combined with high
                speed and southward Bz, a geomagnetic storm is likely.
              </li>
            </ul>
          </div>

          {/* Bt */}
          <div>
            <h4 className="text-white font-semibold mb-1">
              Bt (Total IMF, nT)
            </h4>
            <p>
              The total magnitude of the Interplanetary Magnetic Field. Higher
              values mean a stronger magnetic field is arriving at Earth, which
              increases the potential for geomagnetic coupling regardless of
              orientation.
            </p>
          </div>

          {/* Bz */}
          <div>
            <h4 className="text-white font-semibold mb-1">
              Bz (Z-Component, nT)
            </h4>
            <p>
              The north-south component of the IMF. This is{" "}
              <strong>the single most important parameter</strong> for
              predicting HF propagation disruptions from solar wind.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-1.5">
              <li>
                <strong>Positive (northward):</strong> Shields the magnetosphere
                from solar wind energy. HF propagation is protected.
              </li>
              <li>
                <strong>Negative (southward):</strong> Opens Earth's
                magnetosphere to solar wind energy, causing geomagnetic
                disturbance and degrading HF conditions. The more negative, the
                worse.
              </li>
            </ul>
            <HelpCallout type="tip">
              Watch Bz more than any other solar wind parameter. Sustained
              southward Bz (&lt; -5 nT) is the number one predictor of
              geomagnetic storms. If Bz drops below -10 nT and stays there,
              expect K-Index to rise to storm levels within 1-3 hours.
            </HelpCallout>
          </div>
        </div>
      </HelpAccordion>

      {/* Live SWPC Maps */}
      <HelpAccordion
        id="swpc-maps"
        title="Live SWPC Maps"
        summary="Real-time absorption, aurora, and solar imagery from NOAA"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            The Live Maps section displays imagery sourced directly from NOAA
            SWPC, updated every minute. Click any map to enlarge it; animated
            maps (D-RAP Global and Aurora) include playback controls to review
            the last 24 hours of activity.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">D-RAP Global HF</h4>
            <p>
              The D-Region Absorption Prediction (D-RAP) shows real-time HF
              absorption worldwide. It maps the highest frequency affected by
              D-layer absorption at each point on the globe.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-1.5">
              <li>
                <span className="text-green-400 font-medium">Green areas:</span>{" "}
                Low absorption — good propagation conditions.
              </li>
              <li>
                <span className="text-yellow-400 font-medium">
                  Yellow/orange areas:
                </span>{" "}
                Moderate absorption — some HF frequencies blocked.
              </li>
              <li>
                <span className="text-red-400 font-medium">Red areas:</span>{" "}
                High absorption — HF is degraded or blacked out in this region.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              D-RAP by Frequency
            </h4>
            <p>
              Frequency-specific D-RAP maps filtered for 20 MHz (useful for 15 m
              / 17 m band operations) and 10 MHz (useful for 30 m / 40 m band
              operations). These show whether absorption at your specific
              operating frequency is a concern along your path.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Aurora Oval (Northern Hemisphere)
            </h4>
            <p>
              Shows the predicted probability of visible aurora, which expands
              equatorward during geomagnetic storms. The aurora zone is
              important for two reasons:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-1.5">
              <li>
                <strong>HF absorption:</strong> Where aurora is active, HF
                signals passing through the auroral zone are absorbed by
                enhanced D-layer ionization. Paths crossing the aurora oval will
                be degraded or blocked.
              </li>
              <li>
                <strong>VHF scatter:</strong> The auroral boundary creates
                opportunities for VHF scatter propagation on 6 m and 2 m. If you
                are within range of the aurora zone, try pointing your beam
                north.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Solar Synoptic Map
            </h4>
            <p>
              Shows the magnetic field polarity map of the Sun's surface,
              including active regions (sunspots) and coronal holes. Coronal
              holes are sources of high-speed solar wind streams that can
              produce recurrent geomagnetic disturbances with a roughly 27-day
              period as the Sun rotates.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* Charts */}
      <HelpAccordion
        id="charts"
        title="Charts"
        summary="Time-series charts for K-Index, A-Index, Solar Flux, and IMF Bz"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Solar Pulse includes four interactive charts that let you see how
            conditions have evolved over time. Click any chart to expand it to
            full size with additional detail.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">
              K-Index (24 hours)
            </h4>
            <p>
              A bar chart showing geomagnetic activity over the last 24 hours.
              Look for trends: a series of rising bars indicates a developing
              storm, while falling bars suggest recovery. Each bar is
              color-coded by severity level.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">A-Index</h4>
            <p>
              The A-Index is derived from K-Index values and provides a daily
              geomagnetic summary. This chart smooths out the minute-to-minute
              K-Index variations and shows the broader trend in geomagnetic
              activity.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Solar Flux (30 days)
            </h4>
            <p>
              A line chart of the Solar Flux Index over the last 30 days. This
              chart reveals two important patterns:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-1.5">
              <li>
                <strong>Solar cycle trend:</strong> The overall level indicates
                where we are in the 11-year solar cycle.
              </li>
              <li>
                <strong>27-day recurrence:</strong> Active regions on the Sun
                rotate with a ~27-day period. If you see a peak, you can expect
                a similar peak roughly 27 days later as the same active region
                faces Earth again.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">IMF Bz (1 hour)</h4>
            <p>
              Real-time Z-component of the Interplanetary Magnetic Field over
              the last hour. Watch for sustained southward (negative) dips.
              Brief fluctuations are normal, but sustained negative Bz (&lt; -5
              nT for 30+ minutes) is a reliable predictor of imminent
              geomagnetic storm conditions.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* Flare Probabilities */}
      <HelpAccordion
        id="flare-probabilities"
        title="Flare Probabilities"
        summary="Next-day forecast probabilities for solar flare and proton events"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            This panel shows NOAA's next-day probability forecast for solar
            events. These forecasts are issued every 6 hours based on analysis
            of active regions on the Sun's surface.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>C-class probability:</strong> C-flares are common and
              produce brief, minor HF degradation. Probabilities above 50%
              almost always result in at least one C-flare.
            </li>
            <li>
              <strong>M-class probability:</strong> M-flares cause moderate HF
              blackouts (10-60 minutes on the sunlit side). When M-class
              probability exceeds 30%, plan for potential interruptions during
              daytime operating.
            </li>
            <li>
              <strong>X-class probability:</strong> X-flares are rare but cause
              severe HF blackouts lasting hours. Even a 10% X-class probability
              is noteworthy. Above 30% warrants serious attention and
              contingency planning for contests or DXpeditions.
            </li>
            <li>
              <strong>Proton event probability:</strong> Energetic proton events
              cause polar cap absorption, primarily affecting polar and
              transpolar HF paths. High probability means polar routes (e.g., US
              to Asia over the pole) may be disrupted.
            </li>
          </ul>

          <HelpCallout type="note">
            Flare probability forecasts become less accurate for rare events (M
            and X class). A 50% C-class probability is very reliable, but a 30%
            X-class probability carries more uncertainty. Still, high X-class
            probability means dangerous active regions are present on the Sun.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Band Conditions Matrix */}
      <HelpAccordion
        id="band-matrix"
        title="Band Conditions Matrix"
        summary="Current propagation status for every HF band from 160 m to 10 m"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Band Conditions Matrix shows the current status for each HF
            amateur band (160 m through 10 m). Status is computed from a
            combination of the K-Index, Solar Flux Index, time of day, and
            propagation path characteristics.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Excellent:</strong> Strong, reliable propagation. All
              modes (SSB, CW, digital) should work well. Good time for DX
              hunting or contesting on this band.
            </li>
            <li>
              <strong>Good:</strong> Reliable propagation for most paths. SSB
              and CW work well. Digital modes like FT8 will have an easy time.
            </li>
            <li>
              <strong>Fair:</strong> Marginal conditions. Digital modes (FT8,
              FT4) are recommended over SSB. CW may still produce contacts with
              patience. Shorter paths are more likely to work than long DX.
            </li>
            <li>
              <strong>Poor:</strong> Weak and unreliable propagation. Only
              digital modes may produce contacts, and even those may be spotty.
              Focus on bands showing better conditions.
            </li>
            <li>
              <strong>Closed:</strong> No F-layer propagation expected on this
              band under current conditions. Try a lower band, or wait for
              conditions to improve.
            </li>
          </ul>
        </div>
      </HelpAccordion>

      {/* Interpreting Conditions */}
      <HelpAccordion
        id="interpreting"
        title="Interpreting Conditions"
        summary="Practical guide for translating solar data into operating decisions"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Understanding the raw numbers is important, but what matters most is
            translating them into operating decisions. Here are the key
            scenarios you will encounter:
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Best HF Conditions
            </h4>
            <p>
              Low Kp (0-2), high SFI (&gt; 100), Bz northward or near zero. This
              is the ideal scenario for HF operating. High bands will be open
              during daylight, low bands will be open at night, and signal
              strengths will be strong and stable. If you see these conditions
              during a weekend, get on the air.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Good Low-Band Conditions
            </h4>
            <p>
              Quiet nights (Kp 0-1), moderate SFI, after local sunset. Low bands
              (80 m, 160 m) come alive after dark when D-layer absorption fades.
              The quieter the geomagnetic field, the more stable the ionosphere
              and the better your low-band DX will be. Winter evenings with long
              darkness paths are prime time.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Storm Recovery</h4>
            <p>
              After a G2+ geomagnetic storm, the ionosphere often "snaps back"
              with enhanced propagation for several hours as the F-layer
              re-stabilizes. This post-storm recovery phase can produce
              unusually strong signals and unexpected band openings.
            </p>
            <HelpCallout type="tip">
              The best DX often happens in the first 24 hours after a
              geomagnetic storm subsides. If you see K-Index dropping from 5+
              back to 2-3, get on the high bands immediately — propagation may
              be enhanced as the ionosphere recovers.
            </HelpCallout>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">27-Day Recurrence</h4>
            <p>
              Solar features (active regions and coronal holes) rotate with the
              Sun on an approximately 27-day period. This means that good or bad
              conditions tend to repeat on a roughly monthly cycle. If you
              experience excellent propagation this week, mark your calendar for
              27 days from now — the same active region may produce similar
              conditions on its next rotation.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* Data Sources */}
      <HelpAccordion
        id="data-sources-solar"
        title="Data Sources"
        summary="Complete list of all data endpoints used on the Solar Pulse page"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Solar Pulse combines data from two categories of sources: direct
            SWPC endpoints (fetched client-side for real-time ops data) and
            proxied endpoints (routed through Vercel Edge Functions for CORS
            compliance and caching).
          </p>

          <HelpDataTable
            sources={[
              {
                name: "NOAA Scales",
                source: "SWPC Direct",
                endpoint: "noaa-scales.json",
                refresh: "5 min",
              },
              {
                name: "GOES X-Ray Flares",
                source: "SWPC Direct",
                endpoint: "goes/primary/xray-flares-latest",
                refresh: "1 min",
              },
              {
                name: "Solar Wind Mag",
                source: "SWPC Direct",
                endpoint: "solar-wind/mag-5-minute.json",
                refresh: "1 min",
              },
              {
                name: "Solar Wind Plasma",
                source: "SWPC Direct",
                endpoint: "solar-wind/plasma-5-minute.json",
                refresh: "1 min",
              },
              {
                name: "SWPC Alerts",
                source: "SWPC Direct",
                endpoint: "alerts.json",
                refresh: "1 min",
              },
              {
                name: "K-Index",
                source: "Proxied",
                endpoint: "/api/solar/k-index",
                refresh: "1 min",
                cache: "15 min",
              },
              {
                name: "Solar Flux",
                source: "Proxied",
                endpoint: "/api/solar/flux",
                refresh: "4 hrs",
                cache: "4 hrs",
              },
              {
                name: "Sunspots",
                source: "Proxied",
                endpoint: "/api/solar/sunspots",
                refresh: "6 hrs",
                cache: "24 hrs",
              },
              {
                name: "Magnetometer",
                source: "Proxied",
                endpoint: "/api/solar/magnetometer",
                refresh: "1 min",
                cache: "5 min",
              },
              {
                name: "Probabilities",
                source: "Proxied",
                endpoint: "/api/solar/probabilities",
                refresh: "6 hrs",
                cache: "12 hrs",
              },
            ]}
          />

          <HelpCallout type="note">
            Direct SWPC endpoints do not go through the Propulse proxy and have
            no server-side caching. They are fetched with "no-store" cache
            policy to ensure the most current data. Proxied endpoints use Vercel
            edge caching for performance and CORS compliance.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <HelpFAQ
        items={[
          {
            question: "What does Bz mean for my QSOs?",
            answer:
              "Bz is the north-south component of the interplanetary magnetic field. When Bz goes southward (negative), energy from the solar wind couples into Earth's magnetosphere, causing geomagnetic disturbances that degrade HF propagation. Sustained Bz below -5 nT typically leads to K-Index increases within 1-3 hours. Think of it as an early warning system: if Bz drops below -5 nT, start planning for deteriorating conditions. If it recovers to northward (positive), the magnetosphere will stabilize and HF conditions will improve.",
          },
          {
            question: "How accurate are flare probabilities?",
            answer:
              "NOAA's flare probabilities are based on solar active region analysis and have reasonable accuracy for next-day forecasts. C-class probabilities above 50% usually produce at least one C-flare. M and X probabilities are harder to predict, but greater than 30% warrants attention. The forecasts are most useful as a planning tool — if M-class probability is high, schedule SSB ragchews for evening when you're on the nightside, and save daytime for digital modes that can tolerate brief interruptions.",
          },
          {
            question: "Why does K=5 kill HF?",
            answer:
              "K-Index 5 indicates a G1 geomagnetic storm. The disturbed magnetosphere causes the ionosphere to become irregular and absorptive in two ways: D-layer absorption increases dramatically (blocking HF signals that would normally pass through), and the F-layer becomes unstable with unpredictable electron density gradients (causing signals to scatter rather than reflect cleanly). Low bands (80 m, 160 m) can sometimes benefit from storm-enhanced propagation because the disturbance creates unusual ionospheric structures that enhance low-frequency reflection. But high bands (10 m through 20 m) are typically degraded or closed because they depend on stable F-layer conditions.",
          },
        ]}
      />
    </div>
  );
}

import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function SolarPulseSection() {
  return <div className="space-y-6 text-sm leading-relaxed text-gray-300">
    <p>Solar Pulse is your space-weather briefing before a session. Start with current HF concerns, inspect what changed, then open a path or plan a session. The briefing describes global context; it does not decide whether a particular contact is possible.</p>
    <HelpCallout type="note">Data freshness and weather severity are separate. “Data current” means the product is within its freshness window, even during a major storm. Delayed evidence qualifies the briefing; unavailable evidence never becomes zero or an all-clear.</HelpCallout>
    <HelpAccordion id="solar-briefing" title="Read the HF briefing" summary="Current impacts, background conditions, and what to watch">
      <p>The briefing considers observed or estimated Kp, solar flux, IMF Bz, long-channel X-ray flux, official NOAA R/S/G scales, and recent bulletins. Radio-blackout, radiation-storm, and geomagnetic impacts appear separately, ahead of otherwise supportive background conditions.</p>
      <p className="mt-3">Open “Why this briefing?” for supporting context and “Sources &amp; times” for product identities, observation times, and missing inputs. X-ray activity and an official scale can differ because their snapshots update at different times; both remain visible.</p>
      <p className="mt-3">Southward Bz at L1 is an upstream condition to watch. A single sample does not prove a geomagnetic storm at Earth. No fixed confidence percentage or global best-band recommendation is inferred from these inputs.</p>
    </HelpAccordion>
    <HelpAccordion id="solar-readings" title="Understand the readings" summary="Kp, SFI, Bz, and X-ray flux">
      <p>Kp represents three-hour planetary intervals. Observed, estimated, and official predicted records have distinct chart styles. SFI is the measured 10.7 cm flux, a proxy for ionization; it is not a path forecast. Bz describes magnetic orientation in the solar wind. GOES X-ray flux uses the exact 0.1–0.8 nm channel and is displayed on a logarithmic history chart.</p>
      <p className="mt-3">Solar flux, geomagnetic disturbance, illumination, frequency, antennas, noise, and both endpoints matter to a contact. Use PropSphere or DX Wizard to inspect the path.</p>
    </HelpAccordion>
    <HelpAccordion id="solar-trends" title="What changed and what is predicted" summary="Comparison windows, gaps, and the official outlook">
      <p>Change summaries compare chronological, comparable records and show both times. They exclude predicted Kp from measured changes and avoid comparing unrelated solar-flux schedules. “Not enough comparable history” means there is no supported comparison, not that conditions were flat.</p>
      <p className="mt-3">Chart gaps remain disconnected. Tap a chart or use its inspection slider and arrow keys to read a record. “Show values” opens the full accessible table. Narrow screens can scroll the labeled plot without scrolling the whole page sideways.</p>
      <p className="mt-3">The official outlook keeps issue time separate from the dates and intervals being predicted. One-day flare probabilities remain provider forecasts of solar events, not chances of completing a QSO. Planetary A appears only as an official prediction, never as a pseudo-current conversion from Kp.</p>
    </HelpAccordion>
    <HelpAccordion id="solar-impacts" title="Impacts and bulletins" summary="Geography matters; recent does not necessarily mean active">
      <p>Flare-related absorption affects sunlit HF paths. Radiation storms can affect polar paths. Geomagnetic effects depend on latitude and path. D-RAP is a modeled absorption product; its highest affected frequency anywhere on Earth is not your local tuning recommendation. The aurora product covers the Northern Hemisphere and does not establish HF workability.</p>
      <p className="mt-3">Recent NOAA bulletins can include watches, warnings, alerts, summaries, and ended events. Open the full message to inspect validity, updates, and cancellation. A successful empty response is distinct from an unavailable feed. NASA DONKI CME analyses are not guaranteed Earth-arrival forecasts.</p>
    </HelpAccordion>
    <HelpAccordion id="solar-operating" title="Continue operating" summary="Station, target, mode, and planning time">
      <p>“Inspect a path,” “Find a band for a target,” and “Plan a session” reuse your active station and selected map target. Missing context can be added in the destination. Navigation does not tune the radio or reset your map projection and layers.</p>
      <p className="mt-3">“Plan this day” opens that UTC day at 12:00 in Band Planner. Its path projection uses current solar inputs for the selected date; it is separate from the official NOAA outlook. Unsupported operating modes are explicitly mapped to the path engine's modeled mode.</p>
    </HelpAccordion>
    <HelpFAQ items={[
      { question: "Why do old values sometimes remain visible?", answer: "A failed refresh retains the last validated data only until the product's hard usability limit. Its age and delayed status remain visible; after that limit the value becomes unavailable." },
      { question: "Why are fewer panels open on my phone?", answer: "A first mobile visit loads six essential feeds. Charts, details, forecasts, and imagery load when revealed. Mobile and desktop remember their own section choices; desktop preferences do not silently start expensive mobile work." },
      { question: "What does Refresh include?", answer: "Refresh updates the structured feeds for visible sections and reports partial failures. Images manage their own updates. Source-specific timestamps remain visible even when different products update at different cadences." },
      { question: "Can I make Solar Pulse easier to read on a large display?", answer: "Use the application's Text Size preference. Solar Pulse respects that setting and keeps scrolling available rather than assuming screen resolution determines viewing distance." },
    ]} />
  </div>;
}

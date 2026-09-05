import { Link } from "react-router-dom";
import { HelpAccordion } from "@/components/help/HelpAccordion";

export function DashboardSection() {
  return <div className="space-y-6 text-sm leading-relaxed text-gray-300">
    <p>Home is your quick look at current band activity, solar conditions, and your station. Recent reports lead the page; the HF briefing explains the global space-weather context. Reported impacts appear ahead of activity. You can use Home before signing in.</p>
    <HelpAccordion id="home-activity" title="On the bands now" summary="Recent reports, with a clear scope and time window">
      <p>The band tiles count deduplicated reception and cluster observations in the last 20 minutes, scoped to your Home location’s continent when available. The bars compare those same counts. Mode counts describe CW, digital, phone, or unknown reports.</p>
      <p className="mt-3">Zero reports does not establish that a band is closed. Missing or delayed updates withhold current counts. “Snapshot” is when the server assembled the aggregate; cached delivery does not renew its age. Reports show reception or spotting, not guaranteed two-way contacts.</p>
      <p className="mt-3">Select a band to explore nearby reports. That explorer uses the Home location and your saved range and time filters, so its counts differ from regional totals. Select a reported station there to target it in PropSphere. Public activity stays hidden when your operating policy excludes public spotting.</p>
    </HelpAccordion>
    <HelpAccordion id="home-briefing" title="Solar context and refresh" summary="The same source-aware interpretation as Solar Pulse">
      <p>The briefing reconciles six solar products and keeps current impacts separate from background conditions. Current, Stale, Partial, Error, and Unavailable describe source state. A cleared notification list does not establish quiet conditions.</p>
      <p className="mt-3">The top-right refresh checks current solar sources and official forecasts. Activity updates every minute; the log and optional widgets use their own controls. Delayed sources retry automatically. Open Forecast detail, sources &amp; times for provenance, or <Link to="/solar" className="text-cyan-200 underline">Solar Pulse</Link> for forecasts, history, and imagery.</p>
    </HelpAccordion>
    <HelpAccordion id="home-advanced" title="Location and Advanced dashboard" summary="Local context and a separate modeled outlook">
      <p>Choose a 4- or 6-character grid without an account, or follow your saved station when signed in. Weather and daylight use this Home location; solar conditions remain global. Home’s location selection does not change your station setup.</p>
      <p className="mt-3">Advanced dashboard expands the current mode report and a 12-hour path forecast. Enter a target grid and inspect mode, power, antenna, and noise assumptions. Forecast inputs identify NOAA predictions or current values held constant. Estimates are withheld when current solar inputs are unavailable; the labels are model guidance, not probabilities of a contact.</p>
    </HelpAccordion>
    <HelpAccordion id="home-station" title="Your station and next session" summary="Use the setup you have already configured">
      <p>The setup selector uses My Shack's active rig/antenna chain and its linked location. Mode and band follow your existing operating selection. Check a path and Plan a session carry the active mode and a map target when one exists; destination tools ask for missing inputs. These links do not tune a radio.</p>
      <p className="mt-3">The daylight curve covers the current UTC day at the displayed QTH. Amber shows the Sun’s altitude and a soft gray marker shows now; it does not predict a complete path. Recent-contact totals and the seven-day trend also use UTC days. An existing contest session has a resume link; a contact history alone is not a live session.</p>
    </HelpAccordion>
    <HelpAccordion id="home-favorites" title="Optional widgets" summary="Keep the quick look focused and pin what you follow">
      <p>Open “Show more information panels” to browse sky, clocks, local conditions, DXpeditions, contest details, and radio news. Favorites are saved separately for desktop/tablet and phone. Use Add to Home or Remove from Home on each panel. Saved panels remain visible on phone too; View opens a preview without pinning. Personal panels require sign-in.</p>
    </HelpAccordion>
  </div>;
}

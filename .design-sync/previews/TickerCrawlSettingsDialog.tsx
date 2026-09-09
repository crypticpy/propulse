import { TickerCrawlSettingsDialog } from "propulse";

// Renders open, using feedStore's default seeded feed sources and default
// crawl preferences (ARRL News etc.) -- no store hacks needed since these
// are the store's own defaults, not empty state.
export function Default() {
  return (
    <TickerCrawlSettingsDialog
      open
      onClose={() => {}}
      onConfigureNews={() => {}}
    />
  );
}

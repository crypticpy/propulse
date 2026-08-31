import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TICKER_CRAWL_PREFERENCES,
  useFeedStore,
} from "@/stores/feedStore";
import { TickerCrawlSettingsDialog } from "./TickerCrawlSettingsDialog";

describe("TickerCrawlSettingsDialog", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [
        {
          id: "arrl",
          url: "https://www.arrl.org/news/rss",
          label: "ARRL News",
          crawlEnabled: true,
          crawlMaxAgeHours: 24,
        },
      ],
      activeFeedId: "arrl",
      crawlPreferences: { ...DEFAULT_TICKER_CRAWL_PREFERENCES },
    });
  });

  it("updates per-feed freshness and independent alert thresholds", () => {
    render(<TickerCrawlSettingsDialog open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("ARRL News headline age"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByLabelText("Space weather break-in"), {
      target: { value: "CRITICAL" },
    });
    fireEvent.change(screen.getByLabelText("NWS break-in"), {
      target: { value: "Extreme" },
    });
    fireEvent.click(screen.getByRole("switch"));

    expect(useFeedStore.getState().feeds[0].crawlMaxAgeHours).toBe(6);
    expect(useFeedStore.getState().crawlPreferences).toMatchObject({
      solarThreshold: "CRITICAL",
      weatherThreshold: "Extreme",
      breakInToneEnabled: false,
    });
  });
});

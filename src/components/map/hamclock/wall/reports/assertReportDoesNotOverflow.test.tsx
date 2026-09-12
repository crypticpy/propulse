import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REPORT_BODY_SLOT_PX,
  assertEveryTabDoesNotOverflow,
  assertReportDoesNotOverflow,
  installReportLayoutStub,
} from "./assertReportDoesNotOverflow";
import { HamClockTabs } from "../controls/HamClockTabs";
import { EmcommReport } from "./EmcommReport";

const rimMocks = vi.hoisted(() => ({
  rim: vi.fn(),
  alerts: vi.fn(),
}));

vi.mock("@/hooks/useRIM", () => ({ useRIM: rimMocks.rim }));
vi.mock("@/hooks/useWeatherAlerts", () => ({
  useWeatherAlerts: rimMocks.alerts,
}));

function Fixture({ overflowHeight }: { overflowHeight: string }) {
  return (
    <div role="dialog">
      <div className="hcr-body">
        <div className="hcr-box" data-overflow-height={overflowHeight}>
          box
        </div>
      </div>
    </div>
  );
}

describe("assertReportDoesNotOverflow (#250 S6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses a both-zeros pass when jsdom has not been stubbed", () => {
    render(
      <div role="dialog">
        <div className="hcr-body">
          <div className="hcr-box">box</div>
        </div>
      </div>,
    );
    expect(() =>
      assertReportDoesNotOverflow(screen.getByRole("dialog"), "Fixture"),
    ).toThrow(/Fixture: \.hcr-body has no layout/);
  });

  it("fails when a box's assigned content is taller than the body slot", () => {
    const restore = installReportLayoutStub();
    try {
      render(<Fixture overflowHeight={String(REPORT_BODY_SLOT_PX + 80)} />);
      expect(() =>
        assertReportDoesNotOverflow(screen.getByRole("dialog"), "Fixture"),
      ).toThrow(/Fixture: \.hcr-body overflows/);
    } finally {
      restore();
    }
  });

  it("fails a named box when flex: 0 0 auto is reverted (boxes shrink)", () => {
    const restore = installReportLayoutStub({ boxesShrink: true });
    try {
      render(<Fixture overflowHeight="200" />);
      expect(() =>
        assertReportDoesNotOverflow(screen.getByRole("dialog"), "Fixture"),
      ).toThrow(
        /Fixture: \.hcr-box\[0\] overflows \(200px content > 48px slot\)/,
      );
    } finally {
      restore();
    }
  });

  it("passes a fitting fixture under the stub", () => {
    const restore = installReportLayoutStub();
    try {
      render(<Fixture overflowHeight="120" />);
      expect(() =>
        assertReportDoesNotOverflow(screen.getByRole("dialog"), "Fixture"),
      ).not.toThrow();
    } finally {
      restore();
    }
  });
});

describe("EmcommReport S6 overflow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not clip the idle report body", () => {
    rimMocks.rim.mockReturnValue({ rimResult: null, isLoading: false });
    rimMocks.alerts.mockReturnValue({
      alerts: [],
      isLoading: false,
      error: null,
    });
    const restore = installReportLayoutStub();
    try {
      render(<EmcommReport open onClose={() => {}} />);
      assertReportDoesNotOverflow(screen.getByRole("dialog"), "Emcomm");
    } finally {
      restore();
    }
  });

  it("does not clip the scored report body or boxes", () => {
    rimMocks.rim.mockReturnValue({
      isLoading: false,
      rimResult: {
        regionId: "tx",
        composite: 71,
        hfBand: {
          value: 42,
          label: "HF Bands",
          trend: "down",
          dataAvailable: true,
        },
        vhfUhf: {
          value: 88,
          label: "VHF/UHF",
          trend: "stable",
          dataAvailable: true,
        },
        infraRisk: {
          value: 90,
          label: "Infrastructure",
          trend: "up",
          dataAvailable: true,
        },
        emcommReadiness: {
          value: 78,
          label: "EmComm",
          trend: "stable",
          dataAvailable: true,
        },
        updatedAt: 0,
      },
    });
    rimMocks.alerts.mockReturnValue({
      alerts: [],
      isLoading: false,
      error: null,
    });
    const restore = installReportLayoutStub();
    try {
      render(<EmcommReport open onClose={() => {}} />);
      assertReportDoesNotOverflow(screen.getByRole("dialog"), "Emcomm");
    } finally {
      restore();
    }
  });
});

function TabbedFixture({
  firstHeight,
  secondHeight,
}: {
  firstHeight: string;
  secondHeight: string;
}) {
  return (
    <div role="dialog">
      <div className="hcr-body">
        <HamClockTabs
          label="Fixture"
          tabs={[
            {
              id: "one",
              label: "ONE",
              content: (
                <div className="hcr-box" data-overflow-height={firstHeight}>
                  one
                </div>
              ),
            },
            {
              id: "two",
              label: "TWO",
              content: (
                <div className="hcr-box" data-overflow-height={secondHeight}>
                  two
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

describe("tab panels are measured, not skipped (#880 review)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("counts the mounted tab panel's content against the body slot", () => {
    const restore = installReportLayoutStub();
    try {
      render(
        <TabbedFixture
          firstHeight={String(REPORT_BODY_SLOT_PX + 120)}
          secondHeight="120"
        />,
      );
      // Before the panel was measured this passed on the fixed flex
      // remainder alone, which made every tabbed report's assertion vacuous.
      expect(() =>
        assertReportDoesNotOverflow(screen.getByRole("dialog"), "Fixture"),
      ).toThrow(/Fixture: \.hcr-body overflows/);
    } finally {
      restore();
    }
  });

  it("checks a tab that is not mounted until it is selected", async () => {
    const user = userEvent.setup();
    render(
      <TabbedFixture
        firstHeight="120"
        secondHeight={String(REPORT_BODY_SLOT_PX + 120)}
      />,
    );
    await expect(
      assertEveryTabDoesNotOverflow(
        screen.getByRole("dialog"),
        "Fixture",
        user,
      ),
    ).rejects.toThrow(/Fixture · TWO: \.hcr-body overflows/);
  });

  it("lets a flexible fill slot shrink instead of reporting false clipping", () => {
    const restore = installReportLayoutStub();
    try {
      render(
        <div role="dialog">
          <div className="hcr-body">
            <div className="hcr-box" data-overflow-height="200">
              fixed
            </div>
            <div className="hcr-cols hcr-cols--fill">
              <div
                className="hcr-box"
                data-overflow-height={String(REPORT_BODY_SLOT_PX * 2)}
              >
                chart column
              </div>
            </div>
          </div>
        </div>,
      );
      expect(() =>
        assertReportDoesNotOverflow(screen.getByRole("dialog"), "Fixture"),
      ).not.toThrow();
    } finally {
      restore();
    }
  });
});

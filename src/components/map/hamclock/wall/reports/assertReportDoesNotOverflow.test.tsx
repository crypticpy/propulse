import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REPORT_BODY_SLOT_PX,
  assertReportDoesNotOverflow,
  installReportLayoutStub,
} from "./assertReportDoesNotOverflow";
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
      ).toThrow(/Fixture: \.hcr-box\[0\] overflows \(200px content > 48px slot\)/);
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
    rimMocks.alerts.mockReturnValue({ alerts: [], isLoading: false, error: null });
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
    rimMocks.alerts.mockReturnValue({ alerts: [], isLoading: false, error: null });
    const restore = installReportLayoutStub();
    try {
      render(<EmcommReport open onClose={() => {}} />);
      assertReportDoesNotOverflow(screen.getByRole("dialog"), "Emcomm");
    } finally {
      restore();
    }
  });
});

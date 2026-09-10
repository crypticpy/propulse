import { describe, expect, it } from "vitest";

import { useProfileStore } from "@/stores/profileStore";

const migrate = useProfileStore.persist.getOptions().migrate;
if (!migrate) throw new Error("profileStore has no migrate");

describe("profileStore migrate v13", () => {
  it("resets billing fields on an untagged (pre-v13) store", () => {
    const out = migrate(
      {
        callsign: "W1AW",
        subscriptionTier: "pro",
        subscriptionStatus: "active",
        subscriptionPeriodEnd: "2099-01-01T00:00:00.000Z",
      },
      12,
    ) as Record<string, unknown>;
    expect(out.billingUserId).toBeNull();
    expect(out.subscriptionTier).toBe("free");
    expect(out.subscriptionStatus).toBe("inactive");
    expect(out.subscriptionPeriodEnd).toBeNull();
    expect(out.callsign).toBe("W1AW");
  });

  it("keeps billing on a store that already carries an owner tag", () => {
    const out = migrate(
      {
        billingUserId: "user-a",
        subscriptionTier: "pro",
        subscriptionStatus: "active",
        subscriptionPeriodEnd: "2099-01-01T00:00:00.000Z",
      },
      13,
    ) as Record<string, unknown>;
    expect(out.billingUserId).toBe("user-a");
    expect(out.subscriptionTier).toBe("pro");
  });
});

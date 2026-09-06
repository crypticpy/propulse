import { describe, expect, it } from "vitest";
import { publishedProfileSchema } from "@/lib/station/workbench/contracts";
import { createHfFixture, FIXTURE_DATE, FIXTURE_OWNER } from "@/lib/station/workbench/fixtures";
import {
  PUBLICATION_POLICY_TRUST_BOUNDARY,
  evaluatePublicationPolicy,
  publicationAccessContextSchema,
  publicationPolicySourceSchema,
  type PublicationAccessContext,
  type PublicationPolicySource,
} from "@/lib/station/workbench/publication";

const FRIEND = "fixture-friend";
const VISITOR = "fixture-visitor";
const WRONG = "fixture-wrong-account";
const PRIVATE_URL = "https://private.example/owner/private-photo.jpg";
const LEAKS = [
  "PRIVATE-SERIAL", "Private workshop notes", "private-receipt", "private-photo", PRIVATE_URL,
  "Synthetic exact location", "purchase-secret", "wiring-secret", "RECOVERY-ENVELOPE",
  "receipt.pdf", "main-coax", "CAT and audio",
];

function source(overrides: Partial<PublicationPolicySource> = {}): PublicationPolicySource {
  const archive = createHfFixture();
  archive.inventory[0].privateMetadata = {
    serialNumber: "PRIVATE-SERIAL",
    purchaseDate: "2020-01-01",
    purchaseLocation: "purchase-secret",
    wiringConfiguration: "CAT and audio",
    notes: "Private workshop notes",
    receiptMediaIds: ["private-receipt"],
    imageIds: ["private-photo"],
    maintenanceNotes: "Do not publish",
    manualNotes: "Owner manual",
    primaryImageId: "private-photo",
    galleryImageIds: ["private-photo"],
    legacyPhotoUrls: [PRIVATE_URL],
  };
  archive.inventory[0].legacy = [{
    kind: "radio", sourceId: "legacy-radio", sourceVersion: 1,
    payload: { serialNumber: "PRIVATE-SERIAL", receipt: "receipt.pdf", secret: "RECOVERY-ENVELOPE" },
  }];
  archive.locations[0].coordinates = { latitude: 0, longitude: 0 };
  archive.locations[0].privateNotes = "Synthetic exact location";
  archive.locations[0].grid = "EN50xx";
  archive.revisions[0].location = structuredClone(archive.locations[0]);
  archive.revisions[0].notes = "Raw wiring and operator notes";
  return {
    publication: {
      id: "showcase", ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r1",
      audience: "visitor", publicationVersion: 1, reviewedAt: FIXTURE_DATE,
    },
    displayName: "Test operator",
    biography: "Enjoys portable operating",
    featuredSetup: { title: "Home HF", description: "A small station", instanceIds: ["radio", "antenna"] },
    modules: [
      { id: "identity", kind: "identity", title: "Operator", text: "Callsign on file" },
      { id: "station", kind: "station", title: "Station", text: "Featured HF setup" },
      { id: "activity", kind: "activity", title: "Activity", text: "Recent operating" },
      { id: "projects", kind: "projects", title: "Projects", text: "Needs a W15 section mapping" },
    ],
    sectionVisibility: { stats: "public", awards: "friends", equipment: "friends", activity: "friends", location: "public" },
    locationDisclosure: { precision: "square", disclosedGrid: "EM18xx" },
    intendedMediaAssetIds: ["shack-cover"],
    pinnedEquipment: structuredClone(archive.inventory),
    pinnedLocation: structuredClone(archive.locations[0]),
    recoveryEnvelopes: structuredClone(archive.inventory[0].legacy),
    ...overrides,
  };
}

function access(overrides: Partial<PublicationAccessContext> = {}): PublicationAccessContext {
  return {
    verifiedAccountId: FRIEND,
    friendship: { state: "current" },
    publicationPresent: true,
    publicationVersion: 1,
    mediaGrants: [{ assetId: "shack-cover", derivativeId: "cover-derivative", audience: "visitor", status: "current" }],
    ...overrides,
  };
}

function leakHaystack(value: unknown): string {
  return JSON.stringify(value);
}

function expectNoLeaks(value: unknown, extra: string[] = []): void {
  const text = leakHaystack(value);
  for (const token of [...LEAKS, ...extra]) {
    expect(text).not.toContain(token);
  }
  expect(text).not.toContain("latitude");
  expect(text).not.toContain("longitude");
  expect(text).not.toContain("privateMetadata");
  expect(text).not.toContain(PRIVATE_URL);
}

describe("publication policy trust boundary", () => {
  it("describes a policy component rather than a secured endpoint", () => {
    expect(PUBLICATION_POLICY_TRUST_BOUNDARY).toMatchObject({
      kind: "policy-component", notASecuredEndpoint: true, accessContextMustBeServerResolved: true,
      clientAudienceIsNotAuthorization: true,
    });
    expect(publicationAccessContextSchema.safeParse({
      ...access(), claimedAudience: "owner", claimedOwnerId: FIXTURE_OWNER,
    }).success).toBe(false);
  });
});

describe("evaluatePublicationPolicy", () => {
  it.each(["visitor", "friend", "owner"] as const)("rejects contradictory %s media grants in every order", (audience) => {
    const permutations = [
      ["current", "revoked"], ["revoked", "current"],
      ["current", "absent"], ["absent", "current"],
      ["current", "revoked", "absent"], ["current", "absent", "revoked"],
      ["revoked", "current", "absent"], ["revoked", "absent", "current"],
      ["absent", "current", "revoked"], ["absent", "revoked", "current"],
    ] as const;
    for (const statuses of permutations) {
      const context = access({
        verifiedAccountId: FIXTURE_OWNER,
        ownerPreviewAs: audience,
        mediaGrants: statuses.map((status) => ({ assetId: "shack-cover", derivativeId: "conflicted-derivative", audience, status })),
      });
      const before = structuredClone(context);
      expect(publicationAccessContextSchema.safeParse(context).success).toBe(false);
      const result = evaluatePublicationPolicy(source(), context);
      expect(result).toEqual({ ok: false, code: "invalid-input", message: "Malformed publication policy input" });
      expectNoLeaks(result, ["conflicted-derivative", "shack-cover"]);
      expect(context).toEqual(before);
    }
  });

  it("keeps repeated identical grants and distinct grant identities usable", () => {
    const current = { assetId: "shack-cover", derivativeId: "current-derivative", audience: "friend" as const, status: "current" as const };
    const grants: PublicationAccessContext["mediaGrants"] = [
      current, { ...current },
      { ...current, audience: "visitor", status: "revoked" },
      { ...current, derivativeId: "previous-derivative", status: "revoked" },
      { ...current, assetId: "other-asset", status: "absent" },
    ];
    for (const mediaGrants of [grants, [...grants].reverse()]) {
      expect(publicationAccessContextSchema.safeParse(access({ mediaGrants })).success).toBe(true);
      const result = evaluatePublicationPolicy(source(), access({ mediaGrants }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.projection.publicMediaIds).toEqual(["current-derivative"]);
    }
  });

  it.each([
    ["identity", "identity"], ["station", "equipment"], ["activity", "activity"],
  ] as const)("rejects contradictory section mappings for %s modules", (kind, fixedSection) => {
    const sections = ["identity", "stats", "awards", "equipment", "activity", "location"] as const;
    for (const section of sections.filter((value) => value !== fixedSection)) {
      const input = source({
        sectionVisibility: { equipment: "private", activity: "private", stats: "public", awards: "public", location: "public" },
        modules: [{ id: "conflicting-module", kind, section, title: "PRIVATE-MODULE-TITLE", text: "PRIVATE-MODULE-TEXT" }],
      });
      expect(publicationPolicySourceSchema.safeParse(input).success).toBe(false);
      const result = evaluatePublicationPolicy(input, access({ verifiedAccountId: null, friendship: { state: "absent" } }));
      expect(result).toEqual({ ok: false, code: "invalid-input", message: "Malformed publication policy input" });
      expectNoLeaks(result, ["PRIVATE-MODULE-TITLE", "PRIVATE-MODULE-TEXT", "conflicting-module"]);
    }
  });

  it("accepts matching fixed sections while enforcing their visibility", () => {
    const input = source({
      sectionVisibility: { equipment: "private", activity: "friends" },
      modules: [
        { id: "identity", kind: "identity", section: "identity", title: "Operator", text: "Public identity" },
        { id: "station", kind: "station", section: "equipment", title: "Station", text: "Private station" },
        { id: "activity", kind: "activity", section: "activity", title: "Activity", text: "Friends activity" },
      ],
    });
    const visitor = evaluatePublicationPolicy(input, access({ verifiedAccountId: null, friendship: { state: "absent" } }));
    const friend = evaluatePublicationPolicy(input, access());
    expect(visitor.ok && friend.ok).toBe(true);
    if (!visitor.ok || !friend.ok) return;
    expect(visitor.projection.modules.map((module) => module.id)).toEqual(["identity"]);
    expect(friend.projection.modules.map((module) => module.id)).toEqual(["identity", "activity"]);
  });

  it.each(["projects", "qsl", "interests"] as const)("preserves explicit section mapping and default withholding for %s", (kind) => {
    const input = source({
      sectionVisibility: { awards: "friends" },
      modules: [
        { id: "unmapped", kind, title: "Unmapped", text: "Not implicitly public" },
        { id: "mapped", kind, section: "awards", title: "Mapped", text: "Approved friends module" },
      ],
    });
    const friend = evaluatePublicationPolicy(input, access());
    const visitor = evaluatePublicationPolicy(input, access({ verifiedAccountId: null, friendship: { state: "absent" } }));
    expect(friend.ok && visitor.ok).toBe(true);
    if (!friend.ok || !visitor.ok) return;
    expect(friend.projection.modules.map((module) => module.id)).toEqual(["mapped"]);
    expect(visitor.projection.modules).toEqual([]);
  });

  it("projects a friend allowlist without spreading inventory, location or recovery envelopes", () => {
    const result = evaluatePublicationPolicy(source(), access());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.viewerKind).toBe("friend");
    expect(publishedProfileSchema.safeParse(result.projection).success).toBe(true);
    expect(result.projection).toMatchObject({
      audience: "friend", displayName: "Test operator", regionLabel: "EM18",
      featuredSetup: { title: "Home HF", equipmentLabels: ["My HF transceiver", "Home-built dipole"] },
      publicMediaIds: ["cover-derivative"],
    });
    expect(result.projection.modules.map((module) => module.id)).toEqual(["identity", "station", "activity"]);
    expect(result.lineage).toEqual({
      sourceId: "showcase", setupId: "home-hf", revisionId: "home-r1", publicationVersion: 1,
    });
    expectNoLeaks(result.projection, ["EN50", "home-hf"]);
    expect(JSON.stringify(result.projection)).not.toContain("setupId");
    expect(JSON.stringify(result.projection)).not.toContain("revisionId");
    expect(JSON.stringify(result.projection)).not.toContain("home-r1");
  });

  it("keeps lineage on the trusted result only and freezes outputs", () => {
    const result = evaluatePublicationPolicy(source(), access());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.projection)).toBe(true);
    expect(Object.isFrozen(result.lineage)).toBe(true);
    expect(() => {
      (result.projection as { displayName: string }).displayName = "mutated";
    }).toThrow();
  });

  it("does not mutate caller source or access objects", () => {
    const input = source();
    const context = access();
    const beforeSource = structuredClone(input);
    const beforeAccess = structuredClone(context);
    evaluatePublicationPolicy(input, context);
    input.displayName = "Changed later";
    input.pinnedEquipment[0].privateMetadata.serialNumber = "LATER";
    input.pinnedLocation!.coordinates = { latitude: 12, longitude: 34 };
    context.verifiedAccountId = WRONG;
    context.mediaGrants.push({ assetId: "later", derivativeId: "later", audience: "visitor", status: "current" });
    expect(input.pinnedEquipment[0].privateMetadata.serialNumber).toBe("LATER");
    const again = evaluatePublicationPolicy(beforeSource, beforeAccess);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.projection.displayName).toBe("Test operator");
    expect(again.projection.publicMediaIds).toEqual(["cover-derivative"]);
    expect(beforeSource).toEqual(source());
  });

  it("uses the same public shape for an explicit owner visitor preview", () => {
    const visitor = evaluatePublicationPolicy(source(), access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }));
    const ownerAsVisitor = evaluatePublicationPolicy(
      source(),
      access({ verifiedAccountId: FIXTURE_OWNER, friendship: { state: "absent" }, ownerPreviewAs: "visitor" }),
    );
    expect(visitor.ok && ownerAsVisitor.ok).toBe(true);
    if (!visitor.ok || !ownerAsVisitor.ok) return;
    expect(ownerAsVisitor.viewerKind).toBe("owner");
    expect(ownerAsVisitor.projection.audience).toBe("visitor");
    expect(ownerAsVisitor.projection.featuredSetup).toBeNull();
    expect(ownerAsVisitor.projection.modules.map((module) => module.id)).toEqual(["identity"]);
    expect(ownerAsVisitor.projection.publicMediaIds).toEqual(visitor.projection.publicMediaIds);
    expect(ownerAsVisitor.projection.regionLabel).toBe(visitor.projection.regionLabel);
    expect(visitor.projection.featuredSetup).toBeNull();
    expectNoLeaks(ownerAsVisitor.projection, ["EN50", "home-r1", "home-hf"]);
  });

  it("keeps the owner's default projection as owner, including friends-visible sections", () => {
    const owner = evaluatePublicationPolicy(
      source(),
      access({ verifiedAccountId: FIXTURE_OWNER, friendship: { state: "absent" } }),
    );
    const visitor = evaluatePublicationPolicy(source(), access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }));
    expect(owner.ok && visitor.ok).toBe(true);
    if (!owner.ok || !visitor.ok) return;
    expect(owner.viewerKind).toBe("owner");
    expect(owner.projection.audience).toBe("owner");
    expect(owner.projection.featuredSetup?.equipmentLabels).toEqual(["My HF transceiver", "Home-built dipole"]);
    expect(visitor.projection.featuredSetup).toBeNull();
    expectNoLeaks(owner.projection, ["EN50", "home-r1"]);
  });

  it("includes friend-only featured summaries only for friend-shaped projections", () => {
    const friend = evaluatePublicationPolicy(source(), access());
    const visitor = evaluatePublicationPolicy(source(), access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }));
    const signedOut = evaluatePublicationPolicy(source(), access({ verifiedAccountId: null, friendship: { state: "absent" } }));
    expect(friend.ok && visitor.ok && signedOut.ok).toBe(true);
    if (!friend.ok || !visitor.ok || !signedOut.ok) return;
    expect(friend.projection.featuredSetup?.equipmentLabels).toEqual(["My HF transceiver", "Home-built dipole"]);
    expect(visitor.viewerKind).toBe("visitor");
    expect(signedOut.viewerKind).toBe("signed-out");
    expect(visitor.projection.audience).toBe("visitor");
    expect(signedOut.projection.audience).toBe("visitor");
    expect(visitor.projection.featuredSetup).toBeNull();
    expect(signedOut.projection.featuredSetup).toBeNull();
  });

  it("withholds sections when visibility is missing instead of defaulting to public", () => {
    const result = evaluatePublicationPolicy(
      source({ sectionVisibility: {}, locationDisclosure: { precision: "hidden" } }),
      access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projection.featuredSetup).toBeNull();
    expect(result.projection.regionLabel).toBeNull();
    expect(result.projection.modules.map((module) => module.id)).toEqual(["identity"]);
    expectNoLeaks(result.projection, ["EM18", "EN50"]);
  });

  it("applies Maidenhead field/square/subsquare precision and never derives public location from private coordinates", () => {
    const field = evaluatePublicationPolicy(
      source({ locationDisclosure: { precision: "field", disclosedGrid: "EM18xx" } }),
      access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }),
    );
    const square = evaluatePublicationPolicy(source(), access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }));
    const subsquare = evaluatePublicationPolicy(
      source({ locationDisclosure: { precision: "subsquare", disclosedGrid: "em18xx" } }),
      access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }),
    );
    const hidden = evaluatePublicationPolicy(
      source({ locationDisclosure: { precision: "hidden" } }),
      access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }),
    );
    expect(field.ok && square.ok && subsquare.ok && hidden.ok).toBe(true);
    if (!field.ok || !square.ok || !subsquare.ok || !hidden.ok) return;
    expect(field.projection.regionLabel).toBe("EM");
    expect(square.projection.regionLabel).toBe("EM18");
    expect(subsquare.projection.regionLabel).toBe("EM18XX");
    expect(hidden.projection.regionLabel).toBeNull();
    expectNoLeaks(field.projection, ["EN50"]);
    expect(JSON.stringify(field)).not.toMatch(/"latitude":0|"longitude":0/);
  });

  it.each([
    ["absent", { state: "absent" as const }],
    ["pending", { state: "pending" as const }],
    ["revoked", { state: "revoked" as const }],
  ])("treats %s friendship as visitor, not friend", (_name, friendship) => {
    const result = evaluatePublicationPolicy(source(), access({ verifiedAccountId: FRIEND, friendship }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.viewerKind).toBe("visitor");
    expect(result.projection.featuredSetup).toBeNull();
    expect(result.projection.modules.map((module) => module.id)).toEqual(["identity"]);
  });

  it("denies a friends-only publication to visitors and signed-out viewers", () => {
    const published = source({ publication: { ...source().publication, audience: "friend" } });
    const visitor = evaluatePublicationPolicy(published, access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }));
    const signedOut = evaluatePublicationPolicy(published, access({ verifiedAccountId: null, friendship: { state: "absent" } }));
    const pending = evaluatePublicationPolicy(published, access({ friendship: { state: "pending" } }));
    const friend = evaluatePublicationPolicy(published, access());
    expect(visitor).toMatchObject({ ok: false, code: "forbidden" });
    expect(signedOut).toMatchObject({ ok: false, code: "forbidden" });
    expect(pending).toMatchObject({ ok: false, code: "forbidden" });
    expect(friend.ok).toBe(true);
    expectNoLeaks(visitor);
    expectNoLeaks(signedOut);
  });

  it("denies missing publication and version mismatch without leaking private fields", () => {
    const missing = evaluatePublicationPolicy(source(), access({ publicationPresent: false, publicationVersion: null }));
    const stale = evaluatePublicationPolicy(source(), access({ publicationVersion: 2 }));
    expect(missing).toMatchObject({ ok: false, code: "unpublished" });
    expect(stale).toMatchObject({ ok: false, code: "forbidden" });
    expectNoLeaks(missing);
    expectNoLeaks(stale);
  });

  it("rejects URL-shaped media grants instead of copying private original URLs into the projection", () => {
    const result = evaluatePublicationPolicy(
      source(),
      access({
        mediaGrants: [{ assetId: "shack-cover", derivativeId: PRIVATE_URL, audience: "visitor", status: "current" }],
      }),
    );
    expect(result).toMatchObject({ ok: false, code: "invalid-input" });
    expectNoLeaks(result);
  });

  it("omits revoked or absent media grants and never emits private original URLs", () => {
    const result = evaluatePublicationPolicy(
      source({ intendedMediaAssetIds: ["shack-cover", "private-photo"] }),
      access({
        mediaGrants: [
          { assetId: "shack-cover", derivativeId: "old-cover-url", audience: "visitor", status: "revoked" },
          { assetId: "private-photo", derivativeId: "owner-only-derivative", audience: "owner", status: "current" },
          { assetId: "missing-grant", derivativeId: "unused", audience: "visitor", status: "absent" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projection.publicMediaIds).toEqual([]);
    expectNoLeaks(result.projection);
    expect(JSON.stringify(result.projection)).not.toContain("revoked");
    expect(JSON.stringify(result.projection)).not.toContain("old-cover-url");
    expect(JSON.stringify(result.projection)).not.toContain("owner-only-derivative");
  });

  it("keeps visitor media limited to visitor grants even when a friend grant exists", () => {
    const grants: PublicationAccessContext["mediaGrants"] = [
      { assetId: "shack-cover", derivativeId: "friend-only-derivative", audience: "friend", status: "current" },
    ];
    const friend = evaluatePublicationPolicy(source(), access({ mediaGrants: grants }));
    const visitor = evaluatePublicationPolicy(
      source(),
      access({ verifiedAccountId: VISITOR, friendship: { state: "absent" }, mediaGrants: grants }),
    );
    expect(friend.ok && visitor.ok).toBe(true);
    if (!friend.ok || !visitor.ok) return;
    expect(friend.projection.publicMediaIds).toEqual(["friend-only-derivative"]);
    expect(visitor.projection.publicMediaIds).toEqual([]);
  });

  it("selects the highest allowed grant audience independently of grant order and de-duplicates derivative IDs", () => {
    const visitorFirst: PublicationAccessContext["mediaGrants"] = [
      { assetId: "shack-cover", derivativeId: "visitor-derivative", audience: "visitor", status: "current" },
      { assetId: "shack-cover", derivativeId: "friend-only-derivative", audience: "friend", status: "current" },
      { assetId: "extra-cover", derivativeId: "friend-only-derivative", audience: "friend", status: "current" },
    ];
    const friendFirst = [visitorFirst[1], visitorFirst[0], visitorFirst[2]];
    const withVisitorFirst = evaluatePublicationPolicy(
      source({ intendedMediaAssetIds: ["shack-cover", "extra-cover"] }),
      access({ mediaGrants: visitorFirst }),
    );
    const withFriendFirst = evaluatePublicationPolicy(
      source({ intendedMediaAssetIds: ["shack-cover", "extra-cover"] }),
      access({ mediaGrants: friendFirst }),
    );
    const visitor = evaluatePublicationPolicy(
      source({ intendedMediaAssetIds: ["shack-cover", "extra-cover"] }),
      access({ verifiedAccountId: VISITOR, friendship: { state: "absent" }, mediaGrants: visitorFirst }),
    );
    expect(withVisitorFirst.ok && withFriendFirst.ok && visitor.ok).toBe(true);
    if (!withVisitorFirst.ok || !withFriendFirst.ok || !visitor.ok) return;
    expect(withVisitorFirst.projection.publicMediaIds).toEqual(["friend-only-derivative"]);
    expect(withFriendFirst.projection.publicMediaIds).toEqual(["friend-only-derivative"]);
    expect(visitor.projection.publicMediaIds).toEqual(["visitor-derivative"]);
  });

  it("rejects wrong-account owner preview claims and extra client audience fields", () => {
    const preview = evaluatePublicationPolicy(source(), access({ ownerPreviewAs: "owner" }));
    const extras = evaluatePublicationPolicy(source(), { ...access(), claimedAudience: "owner" } as unknown);
    expect(preview).toMatchObject({ ok: false, code: "invalid-input", message: "Malformed publication policy input" });
    expect(extras).toMatchObject({ ok: false, code: "invalid-input" });
    expectNoLeaks(preview);
    expectNoLeaks(extras);
  });

  it.each([
    ["malformed grid", { locationDisclosure: { precision: "field" as const, disclosedGrid: "ZZ99" } }],
    ["too-short disclosed grid", { locationDisclosure: { precision: "square" as const, disclosedGrid: "EM" } }],
    ["hidden disclosure with a grid", { locationDisclosure: { precision: "hidden" as const, disclosedGrid: "EM18" } }],
    ["unknown featured instance", { featuredSetup: { title: "Home HF", description: "A small station", instanceIds: ["missing-radio"] } }],
    ["foreign equipment owner", { pinnedEquipment: source().pinnedEquipment.map((item) => ({ ...item, ownerId: WRONG })) }],
  ])("rejects %s without copying private values into the error", (_name, override) => {
    const result = evaluatePublicationPolicy(source(override), access());
    expect(result).toMatchObject({ ok: false, code: "invalid-input", message: "Malformed publication policy input" });
    expectNoLeaks(result);
    expect(JSON.stringify(result)).not.toContain("ZZ99");
  });

  it("accepts valid zero coordinates as private input and still withholds them", () => {
    const input = source();
    expect(input.pinnedLocation?.coordinates).toEqual({ latitude: 0, longitude: 0 });
    const result = evaluatePublicationPolicy(input, access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projection.regionLabel).toBe("EM18");
    expect(JSON.stringify(result.projection)).not.toMatch(/"lat(?:itude)?"/);
    expect(JSON.stringify(result)).not.toMatch(/"latitude":0/);
  });

  it("changes featured and module output when section visibility changes", () => {
    const friendsEquipment = evaluatePublicationPolicy(source(), access());
    const publicEquipment = evaluatePublicationPolicy(
      source({ sectionVisibility: { ...source().sectionVisibility, equipment: "public", activity: "private" } }),
      access({ verifiedAccountId: VISITOR, friendship: { state: "absent" } }),
    );
    expect(friendsEquipment.ok && publicEquipment.ok).toBe(true);
    if (!friendsEquipment.ok || !publicEquipment.ok) return;
    expect(friendsEquipment.projection.featuredSetup).not.toBeNull();
    expect(publicEquipment.projection.featuredSetup?.title).toBe("Home HF");
    expect(publicEquipment.projection.modules.map((module) => module.id)).toEqual(["identity", "station"]);
  });

  it("lets the owner preview a friends-only publication as a visitor only when a visitor would be admitted", () => {
    const published = source({ publication: { ...source().publication, audience: "friend" } });
    const preview = evaluatePublicationPolicy(
      published,
      access({ verifiedAccountId: FIXTURE_OWNER, friendship: { state: "absent" }, ownerPreviewAs: "visitor" }),
    );
    const ownerDefault = evaluatePublicationPolicy(
      published,
      access({ verifiedAccountId: FIXTURE_OWNER, friendship: { state: "absent" } }),
    );
    expect(preview).toMatchObject({ ok: false, code: "forbidden" });
    expect(ownerDefault.ok).toBe(true);
    if (!ownerDefault.ok) return;
    expect(ownerDefault.projection.audience).toBe("owner");
    expect(ownerDefault.projection.featuredSetup).not.toBeNull();
    expectNoLeaks(preview);
    expectNoLeaks(ownerDefault.projection, ["home-r1"]);
  });

  it("rejects inventory spreads into featured selection", () => {
    const featured = source().featuredSetup;
    const result = evaluatePublicationPolicy(
      { ...source(), featuredSetup: { ...featured, serialNumber: "PRIVATE-SERIAL" } } as unknown,
      access(),
    );
    expect(result).toMatchObject({ ok: false, code: "invalid-input" });
    expectNoLeaks(result);
  });
});

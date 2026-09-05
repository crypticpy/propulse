/** Pure W05 publication policy. Callers own identity, friendship, grants and delivery. */
import { z } from "zod";
import {
  equipmentInstanceSchema, legacyRecordSchema, locationSchema, publicationSourceSchema, publishedProfileSchema,
  type DeepReadonly,
} from "@/lib/station/workbench/contracts";

const id = z.string().trim().min(1);
const friendshipState = z.enum(["absent", "pending", "revoked", "current"]);
const publicationAudience = z.enum(["owner", "visitor", "friend"]);
const sectionLevel = z.enum(["public", "friends", "private"]);
const gridPrecision = z.enum(["hidden", "field", "square", "extended"]);
const moduleKind = z.enum(["identity", "interests", "station", "activity", "projects", "qsl"]);
const moduleSection = z.enum(["identity", "stats", "awards", "equipment", "activity", "location"]);
const GRID = /^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2})?)?$/i;
const PRECISION_LENGTH = { hidden: 0, field: 4, square: 6, extended: 8 } as const;
const INVALID_INPUT = "Malformed publication policy input";

export const PUBLICATION_POLICY_TRUST_BOUNDARY = {
  kind: "policy-component" as const,
  notASecuredEndpoint: true,
  accessContextMustBeServerResolved: true,
  clientAudienceIsNotAuthorization: true,
} as const;

export const publicationAccessContextSchema = z.object({
  verifiedAccountId: id.nullable(),
  friendship: z.object({ state: friendshipState }).strict(),
  publicationPresent: z.boolean(),
  publicationVersion: z.number().int().positive().nullable(),
  mediaGrants: z.array(z.object({
    assetId: id, derivativeId: id, audience: publicationAudience, status: z.enum(["current", "revoked", "absent"]),
  }).strict()),
  ownerPreviewAs: publicationAudience.optional(),
}).strict();

export const publicationPolicySourceSchema = z.object({
  publication: publicationSourceSchema,
  displayName: id,
  biography: z.string(),
  featuredSetup: z.object({ title: id, description: z.string(), instanceIds: z.array(id) }).strict().nullable(),
  modules: z.array(z.object({ id, kind: moduleKind, title: id, text: z.string(), section: moduleSection.optional() }).strict()),
  sectionVisibility: z.object({
    stats: sectionLevel.optional(), awards: sectionLevel.optional(), equipment: sectionLevel.optional(),
    activity: sectionLevel.optional(), location: sectionLevel.optional(),
  }).strict(),
  locationDisclosure: z.object({ precision: gridPrecision, disclosedGrid: z.string().optional() }).strict(),
  intendedMediaAssetIds: z.array(id),
  pinnedEquipment: z.array(equipmentInstanceSchema),
  pinnedLocation: locationSchema.nullable(),
  recoveryEnvelopes: z.array(legacyRecordSchema),
}).strict();

export type PublicationAccessContext = z.infer<typeof publicationAccessContextSchema>;
export type PublicationPolicySource = z.infer<typeof publicationPolicySourceSchema>;
export type PublicationViewerKind = "owner" | "friend" | "visitor" | "signed-out";
export type PublishedProfileProjection = z.infer<typeof publishedProfileSchema>;
export type PublicationPolicyDenialCode = "invalid-input" | "unpublished" | "forbidden";
export type PublicationPolicyLineage = {
  sourceId: string;
  setupId: string;
  revisionId: string;
  publicationVersion: number;
};
export type PublicationPolicyResult = DeepReadonly<{
  ok: true;
  viewerKind: PublicationViewerKind;
  projection: PublishedProfileProjection;
  lineage: PublicationPolicyLineage;
} | {
  ok: false;
  code: PublicationPolicyDenialCode;
  message: string;
}>;

class PolicyInputError extends Error {
  constructor() {
    super(INVALID_INPUT);
    this.name = "PolicyInputError";
  }
}

function immutable<T>(value: T): DeepReadonly<T> {
  const copy: T = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy as DeepReadonly<T>;
}

function deny(code: PublicationPolicyDenialCode, message: string): DeepReadonly<Extract<PublicationPolicyResult, { ok: false }>> {
  return immutable({ ok: false, code, message });
}

function parseOrInvalid<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new PolicyInputError();
  return parsed.data;
}

function viewerKind(ownerId: string, access: PublicationAccessContext): PublicationViewerKind {
  if (access.verifiedAccountId === ownerId) return "owner";
  if (access.verifiedAccountId === null) return "signed-out";
  if (access.friendship.state === "current") return "friend";
  return "visitor";
}

function projectionAudience(
  viewer: PublicationViewerKind,
  publicationAudienceValue: "owner" | "friend" | "visitor",
  previewAs: "owner" | "friend" | "visitor" | undefined,
): "owner" | "friend" | "visitor" {
  if (viewer === "owner") return previewAs ?? publicationAudienceValue;
  if (viewer === "friend") return "friend";
  return "visitor";
}

function publicationAllows(viewer: PublicationViewerKind, audience: "owner" | "friend" | "visitor"): boolean {
  if (audience === "visitor") return true;
  if (audience === "friend") return viewer === "owner" || viewer === "friend";
  return viewer === "owner";
}

function sectionVisible(
  level: "public" | "friends" | "private" | undefined,
  audience: "owner" | "friend" | "visitor",
): boolean {
  if (level === undefined || level === "private") return false;
  if (level === "public") return true;
  return audience === "friend" || audience === "owner";
}

function moduleSectionFor(kind: z.infer<typeof moduleKind>, explicit?: z.infer<typeof moduleSection>): z.infer<typeof moduleSection> | null {
  if (explicit) return explicit;
  if (kind === "identity") return "identity";
  if (kind === "station") return "equipment";
  if (kind === "activity") return "activity";
  return null;
}

function normalizeDisclosedGrid(disclosure: PublicationPolicySource["locationDisclosure"]): string | null {
  if (disclosure.precision === "hidden") {
    if (disclosure.disclosedGrid !== undefined) throw new PolicyInputError();
    return null;
  }
  const raw = disclosure.disclosedGrid;
  if (raw === undefined || !GRID.test(raw)) throw new PolicyInputError();
  const grid = raw.toUpperCase();
  const needed = PRECISION_LENGTH[disclosure.precision];
  if (grid.length < needed) throw new PolicyInputError();
  return grid.slice(0, needed);
}

function equipmentLabel(item: { id: string; label: string }): string {
  return item.label;
}

function featuredSummary(
  featured: PublicationPolicySource["featuredSetup"],
  equipment: readonly { id: string; label: string }[],
): PublishedProfileProjection["featuredSetup"] {
  if (!featured) return null;
  const labels = featured.instanceIds.map((instanceId) => {
    const item = equipment.find((entry) => entry.id === instanceId);
    if (!item) throw new PolicyInputError();
    return equipmentLabel(item);
  });
  return { title: featured.title, equipmentLabels: labels, description: featured.description };
}

function mediaDerivatives(
  intendedIds: string[],
  grants: PublicationAccessContext["mediaGrants"],
  audience: "owner" | "friend" | "visitor",
): string[] {
  const allowed = new Set<"owner" | "friend" | "visitor">(
    audience === "visitor" ? ["visitor"] : audience === "friend" ? ["visitor", "friend"] : ["visitor", "friend", "owner"],
  );
  const byAsset = new Map<string, string>();
  grants.forEach((grant) => {
    if (grant.status !== "current" || !allowed.has(grant.audience)) return;
    if (!byAsset.has(grant.assetId)) byAsset.set(grant.assetId, grant.derivativeId);
  });
  return intendedIds.flatMap((assetId) => {
    const derivativeId = byAsset.get(assetId);
    return derivativeId ? [derivativeId] : [];
  });
}

function outputAudience(
  viewer: PublicationViewerKind,
  previewAs: "owner" | "friend" | "visitor" | undefined,
): "owner" | "friend" | "visitor" {
  if (viewer === "owner") return previewAs ?? "owner";
  if (viewer === "friend") return "friend";
  return "visitor";
}

/**
 * Allowlisted projector from pinned publication source and server-resolved access context.
 * Not a secured endpoint: the caller must verify account identity, friendship, publication
 * presence/version and media grants before invoking this function.
 */
export function evaluatePublicationPolicy(sourceInput: unknown, accessInput: unknown): PublicationPolicyResult {
  try {
    const source = parseOrInvalid(publicationPolicySourceSchema, sourceInput);
    const access = parseOrInvalid(publicationAccessContextSchema, accessInput);
    if (access.ownerPreviewAs !== undefined && access.verifiedAccountId !== source.publication.ownerId) {
      throw new PolicyInputError();
    }
    if (source.pinnedEquipment.some((item) => item.ownerId !== source.publication.ownerId)) throw new PolicyInputError();
    if (source.pinnedLocation && source.pinnedLocation.ownerId !== source.publication.ownerId) throw new PolicyInputError();
    const disclosedGrid = normalizeDisclosedGrid(source.locationDisclosure);
    if (source.pinnedLocation?.coordinates) {
      const { latitude, longitude } = source.pinnedLocation.coordinates;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new PolicyInputError();
    }
    if (source.featuredSetup) featuredSummary(source.featuredSetup, source.pinnedEquipment);

    if (!access.publicationPresent || access.publicationVersion === null) {
      return deny("unpublished", "No current publication is available");
    }
    if (access.publicationVersion !== source.publication.publicationVersion) {
      return deny("forbidden", "Publication version does not match the resolved grant");
    }

    const viewer = viewerKind(source.publication.ownerId, access);
    const previewAudience = viewer === "owner" ? access.ownerPreviewAs : undefined;
    const accessAudience = previewAudience ?? viewer;
    if (!publicationAllows(accessAudience, source.publication.audience)) {
      return deny("forbidden", "Publication is not available to this audience");
    }

    const shapeAudience = projectionAudience(viewer, source.publication.audience, access.ownerPreviewAs);
    const publicGrid = sectionVisible(source.sectionVisibility.location, shapeAudience) ? disclosedGrid : null;
    const equipmentVisible = sectionVisible(source.sectionVisibility.equipment, shapeAudience);
    const modules = source.modules.filter((module) => {
      const section = moduleSectionFor(module.kind, module.section);
      if (section === null) return false;
      if (section === "identity") return true;
      return sectionVisible(source.sectionVisibility[section], shapeAudience);
    }).map((module) => ({ id: module.id, kind: module.kind, title: module.title, text: module.text }));

    const projection = publishedProfileSchema.parse({
      id: source.publication.id,
      ownerId: source.publication.ownerId,
      publicationVersion: source.publication.publicationVersion,
      audience: outputAudience(viewer, access.ownerPreviewAs),
      displayName: source.displayName,
      biography: source.biography,
      featuredSetup: equipmentVisible ? featuredSummary(source.featuredSetup, source.pinnedEquipment) : null,
      regionLabel: publicGrid,
      publicMediaIds: mediaDerivatives(source.intendedMediaAssetIds, access.mediaGrants, shapeAudience),
      modules,
    });

    return immutable({
      ok: true,
      viewerKind: viewer,
      projection,
      lineage: {
        sourceId: source.publication.id,
        setupId: source.publication.setupId,
        revisionId: source.publication.revisionId,
        publicationVersion: source.publication.publicationVersion,
      },
    });
  } catch (error) {
    if (error instanceof PolicyInputError || error instanceof z.ZodError) {
      return deny("invalid-input", INVALID_INPUT);
    }
    throw error;
  }
}

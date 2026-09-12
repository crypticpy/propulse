/** Read-only typed inventory and Used in view-model adapters. No persistence or writer cutover. */
import { getRadioById } from "@/lib/data/radios";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type {
  InlineComponent,
  UserAccessory,
  UserAntenna,
  UserFeedline,
} from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import {
  parseWorkbenchArchive,
  workbenchArchiveSchema,
  type DeepReadonly,
  type EquipmentInstance,
  type Evidence,
  type Quantity,
  type SetupRevision,
  type WorkbenchArchive,
} from "@/lib/station/workbench/contracts";
import {
  findEquipmentUsage,
  type EquipmentUsage,
} from "@/lib/station/workbench/equipment/services";
import {
  mapLegacyEquipment,
  mapLegacyRadioModel,
  type LegacyEquipmentKind,
} from "@/lib/station/workbench/equipment/legacyAdapters";
import type { EquipmentKind } from "@/lib/station/workbench/equipment/types";

const LEGACY_SOURCE_VERSION = 0;
const unknownQuantity = (reason: string): Quantity => ({ state: "unknown", reason });

export interface LegacyInventorySnapshot {
  radios: UserRadio[];
  customRadios?: RadioEquipment[];
  antennas: UserAntenna[];
  feedlines: UserFeedline[];
  accessories: UserAccessory[];
  inlineComponents: InlineComponent[];
  stationChains: StationChain[];
  activeChainId: string | null;
}

export interface TypedInventoryItem {
  id: string;
  kind: EquipmentKind;
  label: string;
  lifecycle: EquipmentInstance["lifecycle"];
  /** Setups whose current draft includes this instance. */
  currentSetupIds: readonly string[];
  /** Present in inventory but not referenced by any setup draft. */
  unwired: boolean;
}

export type UsedInReferenceRole =
  | "current-draft"
  | "pinned-revision"
  | "operating"
  | "experiment"
  | "publication";

export interface UsedInReference {
  role: UsedInReferenceRole;
  setupId: string;
  setupName: string;
  revisionId: string;
  referenceId: string;
  label: string;
  /** Active draft membership for a setup (distinct from pinned history). */
  isCurrentMembership: boolean;
  /** Retained revision, experiment arm, or publication snapshot. */
  isHistorical: boolean;
}

export interface EquipmentUsedInViewModel {
  instanceId: string;
  label: string;
  kind: EquipmentKind;
  references: readonly UsedInReference[];
  unwired: boolean;
  removeFromSetupHelp: string;
  deleteInventoryHelp: string;
}

const REMOVE_FROM_SETUP_HELP =
  "Remove from setup takes this item out of the setup you are editing now. Pinned revisions, experiments and publications keep their historical references.";
const DELETE_INVENTORY_HELP =
  "Delete or retire inventory removes the physical instance from My gear. Setups and pinned history may still reference it until you review each impact row above.";

function assertOwnerScope(ownerId: string): void {
  if (!ownerId.trim()) throw new Error("Typed inventory requires the owning account");
}

function mappedInstance(
  kind: LegacyEquipmentKind,
  raw: unknown,
  ownerId: string,
  capturedAt: string,
): EquipmentInstance | null {
  const sourceId = recordId(raw) ?? "unknown";
  const result = mapLegacyEquipment(kind, raw, {
    ownerId,
    sourceId,
    sourceVersion: LEGACY_SOURCE_VERSION,
    capturedAt,
  });
  if (result.status === "quarantined") return null;
  return result.value;
}

function recordId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || !("id" in raw)) return null;
  const id = (raw as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : null;
}

function collectChainEquipmentIds(chain: StationChain): Set<string> {
  const ids = new Set<string>();
  for (const node of chain.nodes) {
    if (node.type === "radio") ids.add(node.radioId);
    else if (node.type === "accessory") ids.add(node.accessoryId);
    else if (node.type === "antenna") ids.add(node.antennaId);
    else if (node.type === "feedline_run") {
      const run = chain.feedlineRuns.find((entry) => entry.id === node.feedlineRunId);
      if (run) {
        ids.add(run.feedlineId);
        run.inlineComponentIds.forEach((inlineId) => ids.add(inlineId));
      }
    }
  }
  chain.shackAccessoryIds.forEach((accessoryId) => ids.add(accessoryId));
  return ids;
}

function buildRevision(
  ownerId: string,
  setupId: string,
  revisionId: string,
  createdAt: string,
  membership: EquipmentInstance[],
  evidence: Evidence[],
  operatingPowerWatts: number,
): SetupRevision {
  const declared: Evidence = {
    id: `legacy-declared:${setupId}`,
    ownerId,
    kind: "declared",
    source: "Legacy shack projection (read-only impact view)",
    recordedAt: createdAt,
  };
  return {
    id: revisionId,
    ownerId,
    setupId,
    parentRevisionId: null,
    createdAt,
    equipment: membership.map((item) => structuredClone(item)),
    models: [],
    evidence: [declared, ...evidence.filter((entry) => entry.id !== declared.id)],
    location: null,
    connections: [],
    cableRuns: [],
    routes: [],
    settings: {
      frequencyHz: unknownQuantity("Legacy chain has no reviewed frequency"),
      requestedPowerWatts: operatingPowerWatts >= 0
        ? { state: "known", value: operatingPowerWatts, unit: "W", evidenceId: declared.id }
        : unknownQuantity("Legacy chain power not recorded"),
      mode: null,
    },
    notes: "",
  };
}

function buildLegacyArchiveCandidate(
  snapshot: LegacyInventorySnapshot,
  ownerId: string,
  capturedAt: string,
): WorkbenchArchive | null {
  assertOwnerScope(ownerId);
  const inventory: EquipmentInstance[] = [];
  const evidenceById = new Map<string, Evidence>();
  const ingest = (kind: LegacyEquipmentKind, raw: unknown) => {
    const item = mappedInstance(kind, raw, ownerId, capturedAt);
    if (!item || inventory.some((existing) => existing.id === item.id)) return;
    inventory.push(item);
    const result = mapLegacyEquipment(kind, raw, {
      ownerId,
      sourceId: item.id,
      sourceVersion: LEGACY_SOURCE_VERSION,
      capturedAt,
    });
    if (result.status !== "quarantined") {
      result.evidence.forEach((entry) => evidenceById.set(entry.id, entry));
    }
  };

  snapshot.radios.forEach((radio) => ingest("radio", radio));
  snapshot.antennas.forEach((antenna) => ingest("antenna", antenna));
  snapshot.feedlines.forEach((feedline) => ingest("feedline", feedline));
  snapshot.accessories.forEach((accessory) => ingest("accessory", accessory));
  snapshot.inlineComponents.forEach((inline) => ingest("inline", inline));

  const models: WorkbenchArchive["models"] = [];
  const modelIds = new Set<string>();
  for (const radio of snapshot.radios) {
    const custom = snapshot.customRadios?.find((entry) => entry.id === radio.equipmentId);
    const modelSource = custom ?? getRadioById(radio.equipmentId);
    if (!modelSource) {
      const index = inventory.findIndex((entry) => entry.id === radio.id);
      if (index >= 0) inventory[index] = { ...inventory[index], modelId: null };
      continue;
    }
    const mapped = mapLegacyRadioModel(modelSource, {
      ownerId,
      sourceId: radio.equipmentId,
      sourceVersion: LEGACY_SOURCE_VERSION,
      capturedAt,
      origin: custom ? "custom" : "catalog",
    });
    if (mapped.status !== "quarantined" && !models.some((entry) => entry.id === mapped.value.id)) {
      models.push(mapped.value);
      modelIds.add(mapped.value.id);
      mapped.evidence.forEach((entry) => evidenceById.set(entry.id, entry));
    } else {
      const index = inventory.findIndex((entry) => entry.id === radio.id);
      if (index >= 0) inventory[index] = { ...inventory[index], modelId: null };
    }
  }
  for (const item of inventory) {
    if (item.modelId !== null && !modelIds.has(item.modelId)) {
      item.modelId = null;
    }
  }

  const setups: WorkbenchArchive["setups"] = [];
  const revisions: SetupRevision[] = [];
  for (const chain of snapshot.stationChains) {
    const revisionId = `${chain.id}:draft`;
    const memberIds = collectChainEquipmentIds(chain);
    const membership = inventory.filter((item) => memberIds.has(item.id));
    const revision = buildRevision(
      ownerId,
      chain.id,
      revisionId,
      chain.createdAt,
      membership,
      [...evidenceById.values()],
      chain.operatingPowerWatts,
    );
    revisions.push(revision);
    setups.push({
      id: chain.id,
      ownerId,
      name: chain.name,
      locationId: chain.linkedLocationId ?? null,
      draftRevisionId: revisionId,
      archivedAt: null,
      legacy: [],
    });
  }

  // Legacy chains lack reviewed route topology; draft/revision references still surface impact.
  const operating = null;

  return {
    schemaVersion: 1,
    ownerId,
    models,
    inventory,
    evidence: [...evidenceById.values()],
    locations: [],
    setups,
    revisions,
    layouts: [],
    experiments: [],
    publications: [],
    operating,
  };
}

/** Map legacy shack rows into a validated read-only archive projection for impact lookup. */
export function projectLegacyInventoryArchive(
  snapshot: LegacyInventorySnapshot,
  ownerId: string,
  capturedAt: string,
): DeepReadonly<WorkbenchArchive> | null {
  const candidate = buildLegacyArchiveCandidate(snapshot, ownerId, capturedAt);
  if (!candidate) return null;
  const parsed = workbenchArchiveSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return parseWorkbenchArchive(parsed.data);
}

/** Test helper: expose projection validation diagnostics without leaking private fields. */
export function describeLegacyInventoryArchiveIssues(
  snapshot: LegacyInventorySnapshot,
  ownerId: string,
  capturedAt: string,
): string[] {
  const candidate = buildLegacyArchiveCandidate(snapshot, ownerId, capturedAt);
  if (!candidate) return ["Legacy inventory candidate could not be assembled"];
  const parsed = workbenchArchiveSchema.safeParse(candidate);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => issue.message);
}

function roleForUsage(usage: EquipmentUsage): UsedInReferenceRole {
  if (usage.kind === "draft") return "current-draft";
  if (usage.kind === "revision") return "pinned-revision";
  if (usage.kind === "operating") return "operating";
  if (usage.kind.startsWith("experiment")) return "experiment";
  return "publication";
}

function labelForUsage(usage: EquipmentUsage, setupName: string): string {
  switch (usage.kind) {
    case "draft":
      return `Current draft · ${setupName}`;
    case "revision":
      return `Pinned revision · ${setupName}`;
    case "operating":
      return `Using in ProPulse · ${setupName}`;
    case "experiment-baseline":
      return `Experiment baseline · ${setupName}`;
    case "experiment-candidate":
      return `Experiment candidate · ${setupName}`;
    case "publication":
      return `Published snapshot · ${setupName}`;
  }
}

function buildUsedInViewModel(
  archive: DeepReadonly<WorkbenchArchive>,
  ownerId: string,
  instanceId: string,
): EquipmentUsedInViewModel {
  assertOwnerScope(ownerId);
  const item = archive.inventory.find((entry) => entry.id === instanceId);
  if (!item) throw new Error(`Unknown equipment: ${instanceId}`);
  const setupNames = new Map(archive.setups.map((setup) => [setup.id, setup.name]));
  const usages = findEquipmentUsage(archive, instanceId, ownerId);
  const references: UsedInReference[] = usages.map((usage) => {
    const role = roleForUsage(usage);
    const setupName = setupNames.get(usage.setupId) ?? usage.setupId;
    return {
      role,
      setupId: usage.setupId,
      setupName,
      revisionId: usage.revisionId,
      referenceId: usage.referenceId,
      label: labelForUsage(usage, setupName),
      isCurrentMembership: usage.kind === "draft",
      isHistorical: usage.kind === "revision"
        || usage.kind.startsWith("experiment")
        || usage.kind === "publication",
    };
  });
  const currentSetupIds = [...new Set(
    references.filter((entry) => entry.isCurrentMembership).map((entry) => entry.setupId),
  )];
  const wiredInAnySetup = references.some((entry) => entry.isCurrentMembership || entry.role === "operating");
  return {
    instanceId,
    label: item.label,
    kind: item.kind,
    references,
    unwired: currentSetupIds.length === 0 && !wiredInAnySetup && references.length === 0,
    removeFromSetupHelp: REMOVE_FROM_SETUP_HELP,
    deleteInventoryHelp: DELETE_INVENTORY_HELP,
  };
}

/** Owner-scoped typed inventory over a declared archive (fixtures, future reader). */
export function queryTypedInventory(
  archive: DeepReadonly<WorkbenchArchive>,
  ownerId: string,
): DeepReadonly<TypedInventoryItem[]> {
  assertOwnerScope(ownerId);
  if (archive.ownerId !== ownerId) throw new Error("Typed inventory requires the owning account");
  const draftMembers = new Map<string, Set<string>>();
  for (const setup of archive.setups) {
    const revision = archive.revisions.find((entry) => entry.id === setup.draftRevisionId);
    if (!revision) continue;
    draftMembers.set(
      setup.id,
      new Set(revision.equipment.map((entry) => entry.id)),
    );
  }
  return archive.inventory.map((item) => {
    const currentSetupIds = [...draftMembers.entries()]
      .filter(([, members]) => members.has(item.id))
      .map(([setupId]) => setupId);
    return {
      id: item.id,
      kind: item.kind,
      label: item.label,
      lifecycle: item.lifecycle,
      currentSetupIds,
      unwired: currentSetupIds.length === 0,
    };
  }) as DeepReadonly<TypedInventoryItem[]>;
}

export function queryEquipmentUsedIn(
  archive: DeepReadonly<WorkbenchArchive>,
  ownerId: string,
  instanceId: string,
): DeepReadonly<EquipmentUsedInViewModel> {
  if (archive.ownerId !== ownerId) throw new Error("Equipment usage requires the owning account");
  return buildUsedInViewModel(archive, ownerId, instanceId);
}

/** Read-only impact lookup from the legacy shack writer without switching it. */
export function queryEquipmentUsedInFromLegacy(
  snapshot: LegacyInventorySnapshot,
  ownerId: string,
  instanceId: string,
  capturedAt: string,
): DeepReadonly<EquipmentUsedInViewModel> | null {
  assertOwnerScope(ownerId);
  const archive = projectLegacyInventoryArchive(snapshot, ownerId, capturedAt);
  if (!archive) return null;
  if (!archive.inventory.some((item) => item.id === instanceId)) {
    throw new Error(`Unknown equipment: ${instanceId}`);
  }
  return buildUsedInViewModel(archive, ownerId, instanceId);
}

export function collectLegacyInventorySnapshot(input: {
  radios: UserRadio[];
  customRadios?: RadioEquipment[];
  antennas: UserAntenna[];
  feedlines: UserFeedline[];
  accessories: UserAccessory[];
  inlineComponents: InlineComponent[];
  stationChains: StationChain[];
  activeChainId: string | null;
}): LegacyInventorySnapshot {
  return {
    radios: input.radios,
    customRadios: input.customRadios,
    antennas: input.antennas,
    feedlines: input.feedlines,
    accessories: input.accessories,
    inlineComponents: input.inlineComponents,
    stationChains: input.stationChains,
    activeChainId: input.activeChainId,
  };
}

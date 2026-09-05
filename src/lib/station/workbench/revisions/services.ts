/** Pure W03 proposals. W04 owns transactional persistence; W06 owns command/undo history. */
import { z } from "zod";
import {
  parseWorkbenchArchive, setupRevisionSchema, setupSchema,
  type DeepReadonly, type SetupRevision, type WorkbenchArchive,
} from "@/lib/station/workbench/contracts";

type Archive = DeepReadonly<WorkbenchArchive>;
type Setup = WorkbenchArchive["setups"][number];
export type RevisionContent = Omit<SetupRevision, "id" | "ownerId" | "setupId" | "parentRevisionId" | "createdAt" | "transition">;
export interface RevisionTransitionProposal {
  /** W04 must compare this head again atomically; clocks do not establish revision order. */
  expectedHead: { setupId: string; revisionId: string | null };
  setup: Setup;
  revision: SetupRevision;
}

const id = z.string().trim().min(1);
const instant = z.string().datetime({ offset: true });
const contentSchema = setupRevisionSchema.omit({ id: true, ownerId: true, setupId: true, parentRevisionId: true, createdAt: true, transition: true });
const setupInputSchema = z.object({ setupId: id, revisionId: id, name: id, createdAt: instant, content: contentSchema }).strict();
const revisionInputSchema = z.object({ setupId: id, revisionId: id, expectedHead: id, createdAt: instant, content: contentSchema }).strict();
const mappingSchema = z.preprocess((value, ctx) => {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "__proto__")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Reserved mapping key", fatal: true });
    return z.NEVER;
  }
  return value;
}, z.record(z.string().min(1), id));
const cloneInputSchema = z.object({
  sourceRevisionId: id, setupId: id, revisionId: id, name: id, createdAt: instant,
  idMap: z.object({ connections: mappingSchema, cableRuns: mappingSchema, routes: mappingSchema }).strict(),
}).strict();
const restoreInputSchema = z.object({ setupId: id, sourceRevisionId: id, revisionId: id, expectedHead: id, createdAt: instant }).strict();

function immutable<T>(input: T): DeepReadonly<T> {
  const value = structuredClone(input);
  const freeze = (item: unknown): void => {
    if (item && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(value);
  return value as DeepReadonly<T>;
}

function unusedRevision(archive: Archive, revisionId: string): void {
  if (archive.revisions.some((revision) => revision.id === revisionId)) throw new Error(`Revision already exists: ${revisionId}`);
}

function sourceRevision(archive: Archive, revisionId: string) {
  const revision = archive.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error(`Unknown source revision: ${revisionId}`);
  return revision;
}

function currentSetup(archive: Archive, setupId: string, expectedHead: string) {
  const setup = archive.setups.find((item) => item.id === setupId);
  if (!setup) throw new Error(`Unknown setup: ${setupId}`);
  if (setup.draftRevisionId !== expectedHead) throw new Error(`Stale setup head: ${setupId}`);
  return setup;
}

function proposal(archive: Archive, setup: Setup, revision: SetupRevision, expectedHead: string | null): DeepReadonly<RevisionTransitionProposal> {
  const next = parseWorkbenchArchive({
    ...archive,
    setups: expectedHead === null ? [...archive.setups, setup] : archive.setups.map((item) => item.id === setup.id ? setup : item),
    revisions: [...archive.revisions, revision],
  });
  const storedSetup = next.setups.find((item) => item.id === setup.id)!;
  return immutable({ expectedHead: { setupId: setup.id, revisionId: expectedHead }, setup: storedSetup, revision: next.revisions[next.revisions.length - 1] }) as DeepReadonly<RevisionTransitionProposal>;
}

/** Explicit content may embed resolveRevisionInputs output; missing settings/run evidence must be supplied too. */
export function prepareSetup(archiveInput: Archive, input: unknown): DeepReadonly<RevisionTransitionProposal> {
  const archive = parseWorkbenchArchive(archiveInput);
  const request = setupInputSchema.parse(input);
  if (archive.setups.some((setup) => setup.id === request.setupId)) throw new Error(`Setup already exists: ${request.setupId}`);
  unusedRevision(archive, request.revisionId);
  const setup = setupSchema.parse({
    id: request.setupId, ownerId: archive.ownerId, name: request.name, locationId: request.content.location?.id ?? null,
    draftRevisionId: request.revisionId, archivedAt: null, legacy: [],
  });
  const revision = setupRevisionSchema.parse({
    ...request.content, id: request.revisionId, ownerId: archive.ownerId, setupId: request.setupId,
    parentRevisionId: null, createdAt: request.createdAt, transition: { kind: "initial" },
  });
  return proposal(archive, setup, revision, null);
}

/** Preparing an edit appends a proposed snapshot; the reviewed operating selection remains untouched. */
export function prepareRevision(archiveInput: Archive, input: unknown): DeepReadonly<RevisionTransitionProposal> {
  const archive = parseWorkbenchArchive(archiveInput);
  const request = revisionInputSchema.parse(input);
  const setup = currentSetup(archive, request.setupId, request.expectedHead);
  unusedRevision(archive, request.revisionId);
  const revision = setupRevisionSchema.parse({
    ...request.content, id: request.revisionId, ownerId: archive.ownerId, setupId: setup.id,
    parentRevisionId: request.expectedHead, createdAt: request.createdAt, transition: { kind: "edit" },
  });
  return proposal(archive, setupSchema.parse({ ...setup, locationId: revision.location?.id ?? null, draftRevisionId: revision.id }), revision, request.expectedHead);
}

function checkMapping(sourceIds: readonly string[], mapping: Record<string, string>, label: string): void {
  const source = new Set(sourceIds);
  const targets = Object.values(mapping);
  if (Object.keys(mapping).length !== source.size || sourceIds.some((sourceId) => !Object.prototype.hasOwnProperty.call(mapping, sourceId))) {
    throw new Error(`Every ${label} requires an explicit ID mapping, with no extra keys`);
  }
  if (new Set(targets).size !== targets.length || targets.some((target) => source.has(target))) {
    throw new Error(`Cloned ${label} IDs must be distinct and new`);
  }
}

/** Clone the chosen pins, not today's inventory. Physical equipment/port/path IDs stay shared. */
export function prepareSetupClone(archiveInput: Archive, input: unknown): DeepReadonly<RevisionTransitionProposal> {
  const archive = parseWorkbenchArchive(archiveInput);
  const request = cloneInputSchema.parse(input);
  const source = sourceRevision(archive, request.sourceRevisionId);
  if (archive.setups.some((setup) => setup.id === request.setupId)) throw new Error(`Setup already exists: ${request.setupId}`);
  unusedRevision(archive, request.revisionId);
  const ids = request.idMap;
  checkMapping(source.connections.map((item) => item.id), ids.connections, "connection");
  checkMapping(source.cableRuns.map((item) => item.id), ids.cableRuns, "cable run");
  checkMapping(source.routes.map((item) => item.id), ids.routes, "route");
  const revision = setupRevisionSchema.parse({
    ...source, id: request.revisionId, setupId: request.setupId, parentRevisionId: null, createdAt: request.createdAt,
    transition: { kind: "clone", sourceRevisionId: source.id },
    connections: source.connections.map((connection) => ({ ...connection, id: ids.connections[connection.id], runId: connection.runId === null ? null : ids.cableRuns[connection.runId] })),
    cableRuns: source.cableRuns.map((run) => ({ ...run, id: ids.cableRuns[run.id], connections: run.connections.map((segment) => ({ ...segment, connectionId: ids.connections[segment.connectionId] })) })),
    routes: source.routes.map((route) => ({ ...route, id: ids.routes[route.id], hops: route.hops.map((hop) => hop.kind === "connection" ? { ...hop, connectionId: ids.connections[hop.connectionId] } : hop) })),
  });
  const setup = setupSchema.parse({
    id: request.setupId, ownerId: archive.ownerId, name: request.name, locationId: source.location?.id ?? null,
    draftRevisionId: request.revisionId, archivedAt: null, legacy: archive.setups.find((item) => item.id === source.setupId)!.legacy,
  });
  return proposal(archive, setup, revision, null);
}

/** Restore appends a new head from same-setup pins; it never rewinds or overwrites the source revision. */
export function prepareRevisionRestore(archiveInput: Archive, input: unknown): DeepReadonly<RevisionTransitionProposal> {
  const archive = parseWorkbenchArchive(archiveInput);
  const request = restoreInputSchema.parse(input);
  const setup = currentSetup(archive, request.setupId, request.expectedHead);
  const source = sourceRevision(archive, request.sourceRevisionId);
  if (source.setupId !== setup.id) throw new Error("Restore source must belong to the same setup");
  unusedRevision(archive, request.revisionId);
  const revision = setupRevisionSchema.parse({
    ...source, id: request.revisionId, parentRevisionId: request.expectedHead, createdAt: request.createdAt,
    transition: { kind: "restore", sourceRevisionId: source.id },
  });
  return proposal(archive, setupSchema.parse({ ...setup, locationId: source.location?.id ?? null, draftRevisionId: request.revisionId }), revision, request.expectedHead);
}

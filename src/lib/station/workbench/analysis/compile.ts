/** Pure W07 adapter: explicit selected RF route → existing station engine. No physics copy. */
import {
  computeStationChainPerformance,
  deriveStationFeatureEnvelope,
  type BandChainPerformance,
  type ChainPerformanceResult,
  type NodePerformance,
  type StationInventory,
} from "@/lib/station/stationChainEngine";
import {
  parseWorkbenchArchive,
  type DeepReadonly,
  type Endpoint,
  type EquipmentInstance,
  type EquipmentInternalPath,
  type EquipmentModel,
  type EquipmentPort,
  type Evidence,
  type Quantity,
  type RouteIntent,
  type SetupRevision,
  type WorkbenchArchive,
} from "@/lib/station/workbench/contracts";
import { routeCompileBandSchema, routeCompileModeSchema, routeCompileRequestSchema } from "@/lib/station/workbench/analysis/request";
import { canonicalEquipmentFactId } from "@/lib/station/workbench/equipment/registry";
import type { EquipmentFieldValue, EquipmentFields } from "@/lib/station/workbench/equipment/types";
import type { CatalogReceiverSelection, CatalogSource, ReceiverMetric } from "@/lib/station/workbench/equipment/services";
import { MAX_CHAIN_NODES, SIGNAL_PATH_CATEGORIES, type ChainNode, type StationChain } from "@/types/stationChain";
import { BAND_CENTER_FREQUENCIES } from "@/lib/data/feedlines";
import type {
  AccessoryCategory, ConnectorType, FeedlineCondition, FeedlineType, InlineComponent, InlineComponentType,
  UserAntenna, UserAntennaType, UserFeedline, UserAccessory,
} from "@/types/shack";
import type { AntennaType } from "@/lib/data/antennas";
import { ANTENNA_TYPE_TO_PATTERN, CONNECTOR_TYPE_LABELS } from "@/types/shack";
import type { RadioEquipment, RadioMode, RadioTier, UserRadio } from "@/types/radio";
import type {
  CompatibilityFinding, CompatibilityVerdict, CompiledCableRun, CompilationStatus, DocumentedLayer,
  ExclusiveSelection, HopCompatibility, IntegrationProposal, PathMember, ReportedQuantity,
  RouteCompilation, RouteCompileRequest,
} from "@/lib/station/workbench/analysis/types";

const METERS_PER_FOOT = 0.3048;
const VOLTS_TO_MICROVOLTS = 1e6;
const RECEIVER_METRICS = ["rmdr", "imdr3", "blockingGain", "sensitivity", "noiseFloorDbm", "phaseNoiseDbcHz", "ip3Dbm"] as const;
const REQUIRED_RECEIVER = ["rmdr", "imdr3", "blockingGain", "sensitivity"] as const;
const RADIO_MODES: readonly RadioMode[] = ["CW", "SSB", "AM", "FM", "FT8", "FT4", "RTTY", "PSK31", "JS8", "DATA"];
const RADIO_TIERS: readonly RadioTier[] = ["entry", "midrange", "highend", "flagship"];
const SHACK_CATEGORIES = new Set<AccessoryCategory>(["power_supply", "grounding", "rotator", "keyer", "audio_dsp"]);

type Archive = DeepReadonly<WorkbenchArchive>;
type Revision = DeepReadonly<SetupRevision>;
type Route = DeepReadonly<RouteIntent>;
type Item = DeepReadonly<EquipmentInstance>;
type Port = DeepReadonly<EquipmentPort>;
type Path = DeepReadonly<EquipmentInternalPath>;
type Model = DeepReadonly<EquipmentModel>;
type Connection = Revision["connections"][number];
type CableRun = Revision["cableRuns"][number];

export interface OrientedHop {
  hopIndex: number;
  kind: "connection" | "internal";
  reverse: boolean;
  connection?: DeepReadonly<Connection>;
  path?: Path;
  instance?: Item;
  from: Endpoint;
  to: Endpoint;
  signal: string;
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

function finding(
  verdict: CompatibilityVerdict,
  code: string,
  message: string,
  path: (string | number)[] = [],
  ids: Partial<Pick<CompatibilityFinding, "instanceId" | "portId" | "connectionId">> = {},
): CompatibilityFinding {
  return { verdict, code, message, path, ...ids };
}

function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  return a.instanceId === b.instanceId && a.portId === b.portId;
}

function endpointKey(point: Endpoint): string {
  return `${point.instanceId}:${point.portId}`;
}

function portAt(revision: Revision, point: Endpoint): Port | undefined {
  return revision.equipment.find((item) => item.id === point.instanceId)?.ports.find((port) => port.id === point.portId);
}

function modelOf(revision: Revision, item: Item): Model | undefined {
  return item.modelId === null ? undefined : revision.models.find((model) => model.id === item.modelId);
}

function collectFields(fields: DeepReadonly<EquipmentFields> | DeepReadonly<Record<string, Quantity>> | undefined): Record<string, EquipmentFieldValue | Quantity> {
  return { ...(fields ?? {}) } as Record<string, EquipmentFieldValue | Quantity>;
}

function lookupField(item: Item, model: Model | undefined, key: string): { value: EquipmentFieldValue | Quantity; provenance: ReportedQuantity["provenance"] } | undefined {
  const instanceFields = collectFields(item.fields);
  if (instanceFields[key]) return { value: instanceFields[key], provenance: "instance-field" };
  for (const [factKey, fact] of Object.entries(item.facts)) {
    if (canonicalEquipmentFactId(factKey, item.kind, fact.state === "known" ? fact.unit : undefined) === key) {
      return { value: fact, provenance: "instance-fact" };
    }
  }
  if (model?.fields?.[key]) return { value: model.fields[key] as EquipmentFieldValue, provenance: "model-field" };
  if (model) {
    for (const [specKey, spec] of Object.entries(model.specifications)) {
      if (canonicalEquipmentFactId(specKey, item.kind, spec.state === "known" ? spec.unit : undefined) === key) {
        return { value: spec, provenance: "model-specification" };
      }
    }
  }
  return undefined;
}

function knownNumber(item: Item, model: Model | undefined, key: string): number | undefined {
  const found = lookupField(item, model, key);
  if (found?.value.state === "known" && typeof found.value.value === "number") return found.value.value;
  return undefined;
}

function knownText(item: Item, model: Model | undefined, key: string): string | undefined {
  const found = lookupField(item, model, key);
  if (found?.value.state === "known" && typeof found.value.value === "string") return found.value.value;
  return undefined;
}

function knownConnector(item: Item, model: Model | undefined, key: string): ConnectorType | undefined {
  const value = knownText(item, model, key);
  return value !== undefined && Object.prototype.hasOwnProperty.call(CONNECTOR_TYPE_LABELS, value) ? value as ConnectorType : undefined;
}

function knownList(item: Item, model: Model | undefined, key: string): string[] | undefined {
  const found = lookupField(item, model, key);
  if (found?.value.state === "known" && Array.isArray(found.value.value)) return found.value.value;
  return undefined;
}

function knownBoolean(item: Item, model: Model | undefined, key: string): boolean | undefined {
  const found = lookupField(item, model, key);
  if (found?.value.state === "known" && typeof found.value.value === "boolean") return found.value.value;
  return undefined;
}

function knownMap(item: Item, model: Model | undefined, key: string): Record<string, number> | undefined {
  const found = lookupField(item, model, key);
  if (found?.value.state !== "known" || typeof found.value.value !== "object" || found.value.value === null || Array.isArray(found.value.value) || "min" in found.value.value) return undefined;
  return found.value.value as Record<string, number>;
}

function quantityFromLookup(item: Item, model: Model | undefined, key: string, fallbackReason: string): Quantity {
  const found = lookupField(item, model, key);
  if (!found) return { state: "unknown", reason: fallbackReason };
  if (found.value.state === "unknown") return found.value;
  if (typeof found.value.value === "number") {
    return { state: "known", value: found.value.value, unit: found.value.unit ?? "", evidenceId: found.value.evidenceId };
  }
  return { state: "unknown", reason: fallbackReason };
}

function resolvePinnedReceiver(revision: Revision, radio: Item, preferTested: boolean): CatalogReceiverSelection {
  const model = modelOf(revision, radio);
  const preference = radio.privateMetadata.specPreference;
  const requestedSource: CatalogSource = preference === "tested" || (preference !== "factory" && preferTested) ? "tested" : "factory";
  const hasGroup = (source: CatalogSource) => RECEIVER_METRICS.some((metric) =>
    model?.fields?.[`radio.${source === "tested" ? "testedSpecs" : "receiver"}.${metric}`]?.state === "known");
  const selectedSource = requestedSource === "tested" && hasGroup("tested") ? "tested" : hasGroup("factory") ? "factory" : "unknown";
  const evidenceIds = new Set<string>();
  const fields = Object.fromEntries(RECEIVER_METRICS.map((metric) => {
    const field = selectedSource === "unknown" ? undefined : model?.fields?.[`radio.${selectedSource === "tested" ? "testedSpecs" : "receiver"}.${metric}`];
    if (field?.state === "known") evidenceIds.add(field.evidenceId);
    return [metric, field ?? { state: "unknown", reason: `No ${selectedSource === "unknown" ? "catalog" : selectedSource} ${metric} recorded` }];
  })) as Record<ReceiverMetric, EquipmentFieldValue>;
  return {
    requestedSource, selectedSource,
    fallbackReason: selectedSource === requestedSource ? null : selectedSource === "unknown"
      ? "No requested or fallback catalog receiver group is available"
      : "Tested receiver group unavailable; using factory group",
    fields,
    evidence: revision.evidence.filter((entry) => evidenceIds.has(entry.id)) as Evidence[],
    modelCitations: revision.evidence.filter((entry) => entry.kind === "report" && model?.sourceReportIds?.includes(entry.id)) as Extract<Evidence, { kind: "report" }>[],
  };
}

function orientHop(revision: Revision, hop: Route["hops"][number], hopIndex: number): OrientedHop | CompatibilityFinding {
  const reverse = hop.reverse;
  if (hop.kind === "connection") {
    const connection = revision.connections.find((item) => item.id === hop.connectionId);
    if (!connection) return finding("contradicted", "missing-hop", `Route hop references a missing connection: ${hop.connectionId}`, ["hops", hopIndex], { connectionId: hop.connectionId });
    const from = reverse ? connection.to : connection.from;
    const to = reverse ? connection.from : connection.to;
    return { hopIndex, kind: "connection", reverse, connection, from, to, signal: connection.signal };
  }
  const instance = revision.equipment.find((item) => item.id === hop.instanceId);
  const path = instance?.internalPaths.find((item) => item.id === hop.internalPathId);
  if (!instance || !path) return finding("contradicted", "missing-hop", `Route hop references a missing internal path: ${hop.internalPathId}`, ["hops", hopIndex], { instanceId: hop.instanceId });
  const from = { instanceId: hop.instanceId, portId: reverse ? path.toPortId : path.fromPortId };
  const to = { instanceId: hop.instanceId, portId: reverse ? path.fromPortId : path.toPortId };
  return { hopIndex, kind: "internal", reverse, path, instance, from, to, signal: path.signal };
}

function walkRoute(revision: Revision, route: Route): { hops: OrientedHop[]; diagnostics: CompatibilityFinding[]; cycle: boolean } {
  const diagnostics: CompatibilityFinding[] = [];
  const hops: OrientedHop[] = [];
  const seen = new Set<string>();
  const seenInstances = new Set<string>();
  let previous: Endpoint | undefined;
  let cycle = false;
  route.hops.forEach((hop, hopIndex) => {
    const oriented = orientHop(revision, hop, hopIndex);
    if (!("from" in oriented)) { diagnostics.push(oriented); return; }
    if (oriented.signal !== "rf") diagnostics.push(finding("contradicted", "non-rf-hop", "Selected route includes a non-RF hop", ["hops", hopIndex], oriented.connection ? { connectionId: oriented.connection.id } : { instanceId: oriented.from.instanceId }));
    if (previous && !sameEndpoint(previous, oriented.from)) diagnostics.push(finding("contradicted", "disconnected-route", "Selected route hops are not continuous", ["hops", hopIndex]));
    if (seen.has(endpointKey(oriented.to))) cycle = true;
    if (seenInstances.has(oriented.to.instanceId) && oriented.from.instanceId !== oriented.to.instanceId) cycle = true;
    seen.add(endpointKey(oriented.from));
    seen.add(endpointKey(oriented.to));
    seenInstances.add(oriented.from.instanceId);
    seenInstances.add(oriented.to.instanceId);
    previous = oriented.to;
    hops.push(oriented);
  });
  return { hops, diagnostics, cycle };
}

/** Only documented connector-family aliases, never equipment-type defaults or gender inference. */
function normalizeConnectorFamily(family: string): ConnectorType | undefined {
  const key = family.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, ConnectorType> = {
    n: "n_type", type_n: "n_type", pl_259: "pl259", so239: "pl259", so_239: "pl259", uhf: "pl259",
    rp_sma: "sma_rp", reverse_polarity_sma: "sma_rp", "7_16_din": "din_7_16",
  };
  if (Object.prototype.hasOwnProperty.call(aliases, key)) return aliases[key];
  return Object.prototype.hasOwnProperty.call(CONNECTOR_TYPE_LABELS, key) ? key as ConnectorType : undefined;
}

function mateConnectors(a: Port["connector"], b: Port["connector"]): CompatibilityFinding {
  if (a.state === "unknown" || b.state === "unknown") {
    return finding("unknown", "unknown-connector", "Connected ports have an unknown connector family");
  }
  const familyA = normalizeConnectorFamily(a.family) ?? a.family;
  const familyB = normalizeConnectorFamily(b.family) ?? b.family;
  if (familyA !== familyB) return finding("contradicted", "connector-family-mismatch", `Connector families ${a.family} and ${b.family} do not match`);
  if (a.gender === "unknown" || b.gender === "unknown") return finding("unknown", "unknown-connector-gender", "Connected ports have an unknown connector gender");
  if (a.gender === "genderless" && b.gender === "genderless") return finding("compatible", "connector-compatible", "Genderless connectors of the same family mate");
  if ((a.gender === "male" && b.gender === "female") || (a.gender === "female" && b.gender === "male")) {
    return finding("compatible", "connector-compatible", "Opposite-gender connectors of the same family mate");
  }
  return finding("contradicted", "connector-gender-mismatch", `Connector genders ${a.gender} and ${b.gender} do not mate`);
}

function directionForPurpose(
  port: Port, role: "from" | "to", purpose: Route["purpose"], hopKind: OrientedHop["kind"],
): CompatibilityFinding {
  if (port.direction === "unknown") return finding("unknown", "unknown-direction", `Port ${port.label} has an unknown direction`, [], { portId: port.id });
  if (port.direction === "bidirectional") return finding("compatible", "direction-compatible", `Port ${port.label} is bidirectional`);
  const alongConnection = hopKind === "connection";
  // Hops already follow the selected signal flow, including receive reversals.
  const expectOutput = alongConnection ? role === "from" : role === "to";
  if (expectOutput && port.direction === "output") return finding("compatible", "direction-compatible", `Port ${port.label} faces the selected ${purpose} path`);
  if (!expectOutput && port.direction === "input") return finding("compatible", "direction-compatible", `Port ${port.label} faces the selected ${purpose} path`);
  return finding("contradicted", "direction-mismatch", `Port ${port.label} direction ${port.direction} contradicts ${purpose} ${hopKind} ${role} role`);
}

function roleForPath(port: Port, kind: OrientedHop["kind"], path?: Path): CompatibilityFinding {
  if (port.role === "unknown") return finding("unknown", "unknown-role", `Port ${port.label} has an unknown role`, [], { portId: port.id });
  if (kind === "internal" && path) {
    const isCommon = port.role === "switch-common";
    const isThrow = port.role === "switch-throw";
    if (path.exclusiveGroupId && (isCommon || isThrow || port.role === "through")) {
      return finding("compatible", "switch-role-compatible", `Port ${port.label} matches the selected switch path`);
    }
    if (port.role === "through" || port.role === "source" || port.role === "load") {
      return finding("compatible", "role-compatible", `Port ${port.label} can sit on an internal path`);
    }
  }
  if (port.role === "source" || port.role === "load" || port.role === "through") {
    return finding("compatible", "role-compatible", `Port ${port.label} role is recorded`);
  }
  return finding("compatible", "role-recorded", `Port ${port.label} role ${port.role} is recorded`);
}

function ratingNumber(port: Port, key: string): number | undefined {
  const rating = port.ratings[key];
  return rating?.state === "known" ? rating.value : undefined;
}

function evaluateRatings(
  from: Port, to: Port, frequencyHz: Quantity, path: (string | number)[],
): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  for (const port of [from, to]) {
    if (port.ratings["port.maxPower"]) {
      const maxPower = ratingNumber(port, "port.maxPower");
      if (maxPower === undefined) {
        findings.push(finding("unknown", "unknown-rating", `Port ${port.label} power rating is not a known value`, path, { portId: port.id }));
      }
    }
    const minRating = port.ratings["port.minFrequency"];
    const maxRating = port.ratings["port.maxFrequency"];
    const minHz = ratingNumber(port, "port.minFrequency");
    const maxHz = ratingNumber(port, "port.maxFrequency");
    if (frequencyHz.state !== "known") {
      findings.push(finding("unknown", "unknown-frequency", `Operating frequency is unknown; port ${port.label} frequency compatibility is not established`, path, { portId: port.id }));
    } else if ((minRating && minHz === undefined) || (maxRating && maxHz === undefined)) {
      findings.push(finding("unknown", "unknown-frequency-rating", `Port ${port.label} frequency rating is not a known value`, path, { portId: port.id }));
    } else if (minHz !== undefined && frequencyHz.value < minHz) {
      findings.push(finding("contradicted", "frequency-rating-exceeded", `Operating frequency is below port ${port.label} minimum`, path, { portId: port.id }));
    } else if (maxHz !== undefined && frequencyHz.value > maxHz) {
      findings.push(finding("contradicted", "frequency-rating-exceeded", `Operating frequency is above port ${port.label} maximum`, path, { portId: port.id }));
    } else if (minHz !== undefined || maxHz !== undefined) {
      findings.push(finding("compatible", "frequency-rating-ok", `Operating frequency is within port ${port.label} range`, path, { portId: port.id }));
    }
  }
  const fromZ = ratingNumber(from, "port.impedance");
  const toZ = ratingNumber(to, "port.impedance");
  if (from.ratings["port.impedance"]?.state === "unknown" || to.ratings["port.impedance"]?.state === "unknown") {
    findings.push(finding("unknown", "unknown-impedance", "A connected port impedance is unknown", path));
  } else if (fromZ !== undefined && toZ !== undefined && fromZ !== toZ) {
    findings.push(finding("contradicted", "impedance-mismatch", `Connected impedances ${fromZ} ohm and ${toZ} ohm disagree`, path));
  } else if (fromZ !== undefined && toZ !== undefined) {
    findings.push(finding("compatible", "impedance-ok", "Connected port impedances match", path));
  }
  return findings;
}

function evaluateFilterPassband(item: Item, model: Model | undefined, frequency: Quantity, path: (string | number)[]): CompatibilityFinding[] {
  const recorded = lookupField(item, model, "accessory.passband");
  if (!recorded) return [];
  const value = recorded.value.state === "known" ? recorded.value.value : undefined;
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)
    || !("min" in value) || !("max" in value) || typeof value.min !== "number" || typeof value.max !== "number") {
    return [finding("unknown", "unknown-filter-frequency-range", `Filter ${item.label} has an explicitly unknown passband`, path, { instanceId: item.id })];
  }
  if (frequency.state === "unknown") return [finding("unknown", "unknown-filter-frequency", `Operating frequency is unknown for filter ${item.label}`, path, { instanceId: item.id })];
  const supported = frequency.value >= value.min && frequency.value <= value.max;
  return [finding(supported ? "compatible" : "contradicted", supported ? "filter-frequency-in-passband" : "filter-frequency-outside-passband",
    `Frequency ${frequency.value} Hz ${supported ? "is inside" : "is outside"} filter ${item.label} passband ${value.min}–${value.max} Hz`, path, { instanceId: item.id })];
}

function aggregate(findings: CompatibilityFinding[]): CompatibilityVerdict {
  if (findings.some((item) => item.verdict === "contradicted")) return "contradicted";
  if (findings.some((item) => item.verdict === "unknown")) return "unknown";
  return "compatible";
}

function evaluateHop(
  hop: OrientedHop, purpose: Route["purpose"], frequencyHz: Quantity, revision: Revision,
): HopCompatibility {
  const findings: CompatibilityFinding[] = [];
  const fromPort = portAt(revision, hop.from);
  const toPort = portAt(revision, hop.to);
  const path = ["hops", hop.hopIndex];
  if (!fromPort || !toPort) {
    findings.push(finding("contradicted", "missing-port", "Route hop is missing a port", path));
    return { hopIndex: hop.hopIndex, verdict: "contradicted", findings };
  }
  if (fromPort.signal === "unknown" || toPort.signal === "unknown" || hop.signal === "unknown") {
    findings.push(finding("unknown", "unknown-signal", "A hop signal class is unknown", path, { instanceId: hop.from.instanceId, portId: fromPort.id }));
  } else if (fromPort.signal !== hop.signal || toPort.signal !== hop.signal) {
    findings.push(finding("contradicted", "signal-mismatch", `Port signals ${fromPort.signal}/${toPort.signal} contradict hop signal ${hop.signal}`, path));
  } else if (hop.signal !== "rf") {
    findings.push(finding("contradicted", "non-rf-hop", "Selected route hop is not RF", path));
  } else {
    findings.push(finding("compatible", "signal-compatible", "Hop signal class is RF on both ports", path));
  }
  findings.push(directionForPurpose(fromPort, "from", purpose, hop.kind));
  findings.push(directionForPurpose(toPort, "to", purpose, hop.kind));
  findings.push(roleForPath(fromPort, hop.kind, hop.path));
  findings.push(roleForPath(toPort, hop.kind, hop.path));
  if (hop.kind === "internal" && hop.instance?.kind === "accessory") {
    const model = modelOf(revision, hop.instance);
    if (accessoryCategory(hop.instance, model) === "filter") findings.push(...evaluateFilterPassband(hop.instance, model, frequencyHz, path));
  }
  if (hop.kind === "connection") {
    const binding = hop.connection?.connectorInterface;
    if (binding?.kind === "cable") {
      const run = revision.cableRuns.find((item) => item.id === hop.connection?.runId);
      const cable = revision.equipment.find((item) => item.id === run?.baseCableInstanceId);
      const cableFrom = cable?.ports.find((port) => port.id === (hop.reverse ? binding.toPortId : binding.fromPortId));
      const cableTo = cable?.ports.find((port) => port.id === (hop.reverse ? binding.fromPortId : binding.toPortId));
      if (!cableFrom || !cableTo) {
        findings.push(finding("unknown", "unknown-cable-termination", "Explicit cable termination ports are unavailable", path));
      } else {
        for (const [equipmentPort, cablePort] of [[fromPort, cableFrom], [toPort, cableTo]]) {
          findings.push({ ...mateConnectors(equipmentPort.connector, cablePort.connector), path, portId: cablePort.id, instanceId: cable!.id, connectionId: hop.connection?.id });
          findings.push(...evaluateRatings(equipmentPort, cablePort, frequencyHz, path));
        }
        const cablePath = cable!.internalPaths.find((item) => item.id === binding.internalPathId);
        if ([cableFrom.signal, cableTo.signal, cablePath?.signal].some((signal) => signal !== "rf")) {
          findings.push(finding("unknown", "unknown-cable-signal", "Bound cable ports and internal path must explicitly support RF", path, { instanceId: cable!.id }));
        }
        // Bound cable internals are not ordinary route hops, so the archive's
        // route branch check cannot see extra paths sharing these terminations.
        // An explicitly selected exclusive group represents one choice, matching
        // the normal route semantics; independent RF paths remain branches.
        const alternatives = cable!.internalPaths.filter((candidate) => candidate.id !== binding.internalPathId
          && [candidate.fromPortId, candidate.toPortId].some((id) => id === cableFrom.id || id === cableTo.id)
          && !(cablePath?.exclusiveGroupId && candidate.exclusiveGroupId === cablePath.exclusiveGroupId));
        if (alternatives.some((candidate) => candidate.signal === "rf")) {
          findings.push(finding("contradicted", "branched-cable-internals", "Bound cable termination has an additional non-exclusive RF path that the engine cannot represent", path, { instanceId: cable!.id }));
        } else if (alternatives.some((candidate) => candidate.signal === "unknown")) {
          findings.push(finding("unknown", "unknown-cable-branch", "An additional cable path sharing a bound termination has an unknown signal; an RF branch cannot be excluded", path, { instanceId: cable!.id }));
        }
        findings.push(roleForPath(cableFrom, "internal", cablePath));
        findings.push(roleForPath(cableTo, "internal", cablePath));
        findings.push(directionForPurpose(cableFrom, "from", purpose, "internal"));
        findings.push(directionForPurpose(cableTo, "to", purpose, "internal"));
        findings.push(...evaluateRatings(cableFrom, cableTo, frequencyHz, path));
      }
    } else if (binding?.kind === "direct" || !hop.connection?.runId) {
      findings.push({ ...mateConnectors(fromPort.connector, toPort.connector), path, instanceId: hop.from.instanceId, connectionId: hop.connection?.id });
    } else {
      findings.push(finding("unknown", "unknown-cable-termination", "Cable-run connection has no explicit direct interface or bound cable termination ports", path, { connectionId: hop.connection.id }));
    }
  }
  // Cable-bound equipment ports do not mate with one another; their actual
  // equipment/cable joints were evaluated above. Unbound run edges stay unknown.
  if (hop.kind !== "connection" || hop.connection?.connectorInterface?.kind === "direct" || !hop.connection?.runId) {
    findings.push(...evaluateRatings(fromPort, toPort, frequencyHz, path));
  }
  return { hopIndex: hop.hopIndex, verdict: aggregate(findings), findings };
}

function exclusiveSelections(hops: OrientedHop[]): { selections: ExclusiveSelection[]; conflict: boolean } {
  const selections: ExclusiveSelection[] = [];
  const used = new Set<string>();
  let conflict = false;
  hops.forEach((hop) => {
    if (hop.kind !== "internal" || !hop.path?.exclusiveGroupId || !hop.instance) return;
    const key = `${hop.instance.id}:${hop.path.exclusiveGroupId}`;
    if (used.has(key)) conflict = true;
    used.add(key);
    const common = hop.instance.ports.find((port) => port.role === "switch-common" && (port.id === hop.from.portId || port.id === hop.to.portId))
      ?? hop.instance.ports.find((port) => port.role === "switch-common");
    const throwPort = hop.instance.ports.find((port) => port.role === "switch-throw" && (port.id === hop.from.portId || port.id === hop.to.portId));
    selections.push({
      instanceId: hop.instance.id,
      groupId: hop.path.exclusiveGroupId,
      selectedPathId: hop.path.id,
      commonPortId: common?.id ?? hop.from.portId,
      throwPortId: throwPort?.id ?? hop.to.portId,
    });
  });
  return { selections, conflict };
}

function emissionHops(radioId: string, hops: OrientedHop[]): OrientedHop[] {
  return hops[0] && hops[0].from.instanceId !== radioId
    ? [...hops].reverse().map((hop) => ({ ...hop, reverse: !hop.reverse, from: hop.to, to: hop.from }))
    : hops;
}

function chainNodePerformance(
  chain: StationChain, band: BandChainPerformance, instanceId: string,
): { performance: NodePerformance | undefined; inlineWithoutStage: boolean } {
  for (let index = 0; index < chain.nodes.length; index++) {
    const node = chain.nodes[index];
    const performance = band.nodes[index];
    if (!performance) continue;
    if (node.type === "radio" && node.radioId === instanceId) return { performance, inlineWithoutStage: false };
    if (node.type === "antenna" && node.antennaId === instanceId) return { performance, inlineWithoutStage: false };
    if (node.type === "accessory" && node.accessoryId === instanceId) return { performance, inlineWithoutStage: false };
    if (node.type === "feedline_run") {
      const run = chain.feedlineRuns.find((item) => item.id === node.feedlineRunId);
      if (run?.feedlineId === instanceId) return { performance, inlineWithoutStage: false };
      if (run?.inlineComponentIds.includes(instanceId)) return { performance: undefined, inlineWithoutStage: true };
    }
  }
  return { performance: undefined, inlineWithoutStage: false };
}

function hopPortPower(
  hop: OrientedHop, side: "from" | "to", fromNode: NodePerformance | undefined, toNode: NodePerformance | undefined,
): number | undefined {
  if (hop.kind === "internal") {
    const node = fromNode ?? toNode;
    if (!node) return undefined;
    return side === "from" ? node.inputPowerWatts : node.outputPowerWatts;
  }
  return side === "from" ? fromNode?.outputPowerWatts : toNode?.inputPowerWatts;
}

function evaluateEnginePowerRatings(
  hops: OrientedHop[], chain: StationChain, engine: ChainPerformanceResult, revision: Revision,
): CompatibilityFinding[] {
  const radio = hops.flatMap((hop) => [hop.from, hop.to]).map((point) => revision.equipment.find((item) => item.id === point.instanceId)).find((item) => item?.kind === "radio");
  if (!radio) return [];
  const oriented = emissionHops(radio.id, hops);
  const findings: CompatibilityFinding[] = [];
  engine.bands.forEach((band) => {
    oriented.forEach((hop) => {
      const fromPort = portAt(revision, hop.from);
      const toPort = portAt(revision, hop.to);
      if (!fromPort || !toPort) return;
      const binding = hop.connection?.connectorInterface;
      if (binding?.kind === "cable") {
        const run = revision.cableRuns.find((item) => item.id === hop.connection?.runId)!;
        const cable = revision.equipment.find((item) => item.id === run.baseCableInstanceId)!;
        const sameOrientation = hop.from.instanceId === hop.connection!.from.instanceId && hop.from.portId === hop.connection!.from.portId;
        const stage = chainNodePerformance(chain, band, cable.id).performance;
        for (const [id, side] of [[sameOrientation ? binding.fromPortId : binding.toPortId, "input"], [sameOrientation ? binding.toPortId : binding.fromPortId, "output"]] as const) {
          const port = cable.ports.find((item) => item.id === id)!;
          const maximum = ratingNumber(port, "port.maxPower");
          if (maximum === undefined) continue;
          const path = ["hops", hop.hopIndex, "engine", band.band];
          const power = side === "input" ? stage?.inputPowerWatts : stage?.outputPowerWatts;
          if (run.inlineItems.length || power === undefined || !Number.isFinite(power)) {
            findings.push(finding("unknown", "unknown-hop-power", "Engine feedline stage does not isolate this bound cable termination's power", path, { instanceId: cable.id, portId: port.id }));
          } else {
            findings.push(finding(power > maximum ? "contradicted" : "compatible", power > maximum ? "power-rating-exceeded" : "power-rating-ok", `Modeled ${power} W at cable port ${port.label} on ${band.band} compared with maximum ${maximum} W`, path, { instanceId: cable.id, portId: port.id }));
          }
        }
      }
      const fromLookup = chainNodePerformance(chain, band, hop.from.instanceId);
      const toLookup = chainNodePerformance(chain, band, hop.to.instanceId);
      if (hop.kind === "internal" && hop.instance?.kind === "accessory") {
        const model = modelOf(revision, hop.instance);
        const category = accessoryCategory(hop.instance, model);
        const maximum = knownNumber(hop.instance, model, "accessory.maxPowerWatts");
        // Amplifiers use a maximum OUTPUT cap in the engine. Passive RF gear
        // instead must tolerate the modeled power arriving at its input.
        if (category !== "amplifier" && maximum !== undefined) {
          const power = fromLookup.performance?.inputPowerWatts;
          const path = ["hops", hop.hopIndex, "engine", band.band];
          if (power === undefined || !Number.isFinite(power)) {
            findings.push(finding("unknown", "unknown-accessory-input-power", `Modeled input power is unavailable for ${hop.instance.label}; its ${maximum} W maximum cannot be verified`, path, { instanceId: hop.instance.id }));
          } else {
            findings.push(finding(power > maximum ? "contradicted" : "compatible", power > maximum ? "accessory-power-rating-exceeded" : "accessory-power-rating-ok",
              `Modeled ${power} W arriving at ${hop.instance.label} on ${band.band} compared with its ${maximum} W maximum`, path, { instanceId: hop.instance.id }));
          }
        }
      }
      ([["from", fromPort, fromLookup, hop.from.instanceId], ["to", toPort, toLookup, hop.to.instanceId]] as const).forEach(([side, port, lookup, instanceId]) => {
        const maxPower = ratingNumber(port, "port.maxPower");
        if (maxPower === undefined) return;
        const path = ["hops", hop.hopIndex, "engine", band.band];
        if (lookup.inlineWithoutStage) {
          findings.push(finding("unknown", "unknown-hop-power", `stationChainEngine does not expose stage power inside a feedline run; inline port ${port.label} on ${band.band} is not compared to requested power`, path, { portId: port.id, instanceId }));
          return;
        }
        const power = hopPortPower(hop, side, fromLookup.performance, toLookup.performance);
        if (power === undefined || !Number.isFinite(power)) {
          findings.push(finding("unknown", "unknown-hop-power", `Modeled hop power is unavailable for port ${port.label} on ${band.band}`, path, { portId: port.id, instanceId }));
          return;
        }
        if (power > maxPower) {
          findings.push(finding("contradicted", "power-rating-exceeded", `Modeled ${power} W at port ${port.label} on ${band.band} exceeds rating ${maxPower} W`, path, { portId: port.id, instanceId }));
        } else {
          findings.push(finding("compatible", "power-rating-ok", `Modeled hop power on ${band.band} is within port ${port.label} rating`, path, { portId: port.id, instanceId }));
        }
      });
    });
  });
  return findings;
}

function accessoryCategory(item: Item, model: Model | undefined): AccessoryCategory | undefined {
  const value = knownText(item, model, "accessory.category");
  return value as AccessoryCategory | undefined;
}

function compileChain(
  revision: Revision, route: Route, hops: OrientedHop[], requestedBands: readonly string[],
): {
  chain: StationChain | null;
  members: PathMember[];
  cableRuns: CompiledCableRun[];
  limits: CompatibilityFinding[];
  missing: CompatibilityFinding[];
  proposals: IntegrationProposal[];
  inventory: StationInventory | null;
} {
  const limits: CompatibilityFinding[] = [];
  const missing: CompatibilityFinding[] = [];
  const proposals: IntegrationProposal[] = [];
  const members: PathMember[] = [];
  const pathIds = new Set<string>();
  hops.forEach((hop) => {
    pathIds.add(hop.from.instanceId);
    pathIds.add(hop.to.instanceId);
  });
  revision.equipment.forEach((item) => {
    const onPath = pathIds.has(item.id);
    const wired = revision.connections.some((connection) => connection.from.instanceId === item.id || connection.to.instanceId === item.id);
    members.push({
      instanceId: item.id,
      role: onPath ? "rf-path" : wired ? "documented-layer" : "unwired-member",
    });
  });
  const radios = hops.flatMap((hop) => [hop.from, hop.to].map((point) => revision.equipment.find((item) => item.id === point.instanceId)).filter((item): item is Item => item?.kind === "radio"));
  const antennas = hops.flatMap((hop) => [hop.from, hop.to].map((point) => revision.equipment.find((item) => item.id === point.instanceId)).filter((item): item is Item => item?.kind === "antenna"));
  const uniqueRadios = [...new Map(radios.map((item) => [item.id, item])).values()];
  const uniqueAntennas = [...new Map(antennas.map((item) => [item.id, item])).values()];
  if (uniqueRadios.length !== 1 || uniqueAntennas.length !== 1) {
    missing.push(finding("unknown", "ambiguous-terminals", "Selected route does not identify exactly one radio and one antenna; none were inferred", ["routes"]));
    return { chain: null, members, cableRuns: [], limits, missing, proposals, inventory: null };
  }
  const radio = uniqueRadios[0];
  const antenna = uniqueAntennas[0];
  const emission = emissionHops(radio.id, hops);
  const nodes: ChainNode[] = [{ type: "radio", radioId: radio.id }];
  const feedlineRuns: StationChain["feedlineRuns"] = [];
  const usedRuns = new Set<string>();
  const rejectedRuns = new Set<string>();
  const emittedRunDirections = new Map<string, boolean>();
  const compiledRuns: CompiledCableRun[] = [];
  const accessories: UserAccessory[] = [];
  const inlines: InlineComponent[] = [];
  const feedlines: UserFeedline[] = [];

  const emitRun = (run: DeepReadonly<CableRun>, reverse: boolean, emissionIndex: number) => {
    if (rejectedRuns.has(run.id)) return;
    if (usedRuns.has(run.id)) {
      if (emittedRunDirections.get(run.id) !== reverse) limits.push(finding("contradicted", "inconsistent-run-direction", `Selected route changes direction within cable run ${run.label}`, ["cableRuns"]));
      return;
    }
    const storedHops: Route["hops"][number][] = [];
    run.connections.forEach((segment, index) => {
      storedHops.push({ kind: "connection", connectionId: segment.connectionId, reverse: segment.reverse });
      const inline = run.inlineItems[index];
      if (inline) storedHops.push({ kind: "internal", instanceId: inline.instanceId, internalPathId: inline.internalPathId, reverse: inline.reverse });
    });
    const requiredHops = reverse ? storedHops.reverse().map((hop) => ({ ...hop, reverse: !hop.reverse })) : storedHops;
    const complete = requiredHops.every((required, offset) => {
      const selected = emission[emissionIndex + offset];
      return selected?.kind === required.kind && selected.reverse === required.reverse
        && (required.kind === "connection" ? selected.connection?.id === required.connectionId
          : selected.instance?.id === required.instanceId && selected.path?.id === required.internalPathId);
    });
    if (!complete) {
      rejectedRuns.add(run.id);
      limits.push(finding("contradicted", "incomplete-run-selection", `Cable run ${run.label} requires every connection and internal hop in matching contiguous order; unused cable and inline losses will not be emitted`, ["cableRuns"]));
      return;
    }
    usedRuns.add(run.id);
    emittedRunDirections.set(run.id, reverse);
    const inlineItems = reverse ? [...run.inlineItems].reverse() : run.inlineItems;
    compiledRuns.push({
      id: run.id, baseCableInstanceId: run.baseCableInstanceId, lengthMeters: run.lengthMeters,
      inlineInstanceIds: inlineItems.map((item) => item.instanceId), countedInEngine: run.lengthMeters.state === "known",
    });
    if (run.baseCableInstanceId === null || run.lengthMeters.state !== "known") {
      missing.push(finding("unknown", "unknown-run-length", `Cable run ${run.id} is missing a known base-cable length`, ["cableRuns"], { connectionId: run.connections[0]?.connectionId }));
      return;
    }
    const cable = revision.equipment.find((item) => item.id === run.baseCableInstanceId);
    if (!cable) {
      missing.push(finding("unknown", "missing-base-cable", `Cable run ${run.id} has no pinned base cable`, ["cableRuns"]));
      return;
    }
    const model = modelOf(revision, cable);
    const feedlineType = knownText(cable, model, "feedline.feedlineType") as FeedlineType | undefined;
    const connectorType = knownConnector(cable, model, "feedline.connectorType");
    const farEndField = lookupField(cable, model, "feedline.connectorTypeFarEnd");
    const connectorTypeFarEnd = knownConnector(cable, model, "feedline.connectorTypeFarEnd");
    if (farEndField && connectorTypeFarEnd === undefined) {
      missing.push(finding("unknown", "unknown-feedline-far-connector", `Base cable ${cable.label} explicitly records an unknown far-end connector; it will not be replaced with the near-end type`, [], { instanceId: cable.id }));
    } else if (connectorType && connectorTypeFarEnd && connectorType !== connectorTypeFarEnd) {
      limits.push(finding("contradicted", "mixed-feedline-connectors-not-supported", `Base cable ${cable.label} records ${connectorType}/${connectorTypeFarEnd} ends, but the engine applies the near-end loss to every connector`, [], { instanceId: cable.id }));
      proposals.push({ code: "engine-feedline-far-connector", message: "Calculate connector losses from both recorded cable ends instead of multiplying the near-end loss by connectorCount.", owner: "coordinator" });
    }
    const bound = revision.connections.find((connection) => connection.runId === run.id && connection.connectorInterface?.kind === "cable")?.connectorInterface;
    if (bound?.kind === "cable" && connectorType) {
      for (const portId of [bound.fromPortId, bound.toPortId]) {
        const port = cable.ports.find((candidate) => candidate.id === portId)!;
        const physicalType = port.connector.state === "known" ? normalizeConnectorFamily(port.connector.family) : undefined;
        if (physicalType === undefined) {
          missing.push(finding("unknown", "unmapped-cable-connector-family", `Cable port ${port.label} cannot be mapped to an engine connector type; its loss remains unknown`, [], { instanceId: cable.id, portId }));
        } else if (physicalType !== connectorType) {
          limits.push(finding("contradicted", "cable-connector-loss-mismatch", `Cable port ${port.label} records ${physicalType}, but the engine loss input declares ${connectorType}`, [], { instanceId: cable.id, portId }));
        }
      }
    }
    const condition = knownText(cable, model, "feedline.condition") as FeedlineCondition | undefined;
    const connectorCount = knownNumber(cable, model, "feedline.connectorCount");
    if (!feedlineType) missing.push(finding("unknown", "unknown-feedline-type", `Base cable ${cable.label} has no feedline type`, [], { instanceId: cable.id }));
    if (!connectorType) missing.push(finding("unknown", "unknown-feedline-connector", `Base cable ${cable.label} has no connector type`, [], { instanceId: cable.id }));
    if (!condition) missing.push(finding("unknown", "unknown-feedline-condition", `Base cable ${cable.label} has no condition; the engine requires one and this adapter will not invent it`, [], { instanceId: cable.id }));
    if (connectorCount === undefined) missing.push(finding("unknown", "unknown-connector-count", `Base cable ${cable.label} has no connector count; unknown is not zero`, [], { instanceId: cable.id }));
    inlineItems.forEach((inlineRef) => {
      const inline = revision.equipment.find((item) => item.id === inlineRef.instanceId);
      if (!inline) return;
      const inlineModel = modelOf(revision, inline);
      const componentType = knownText(inline, inlineModel, "inline.componentType") as InlineComponentType | undefined;
      const insertionLossDb = knownNumber(inline, inlineModel, "inline.insertionLossDb");
      const bandField = lookupField(inline, inlineModel, "inline.bands");
      const inlineBands = knownList(inline, inlineModel, "inline.bands");
      if (bandField && inlineBands === undefined) {
        missing.push(finding("unknown", "unknown-inline-bands", `Inline device ${inline.label} explicitly records unknown band support`, [], { instanceId: inline.id }));
      } else if (inlineBands) {
        for (const band of requestedBands) {
          if (!inlineBands.includes(band)) limits.push(finding("contradicted", "inline-band-unsupported", `Inline device ${inline.label} does not declare support for requested band ${band}`, [], { instanceId: inline.id }));
        }
      }
      const maximumField = lookupField(inline, inlineModel, "inline.maxPowerWatts");
      if (maximumField) {
        const maximum = knownNumber(inline, inlineModel, "inline.maxPowerWatts");
        missing.push(finding("unknown", maximum === undefined ? "unknown-inline-power-limit" : "unknown-inline-stage-power", maximum === undefined
          ? `Inline device ${inline.label} has an explicitly unknown maximum power`
          : `Inline device ${inline.label} records a ${maximum} W maximum, but the engine's combined feedline stage does not isolate its power; the rating cannot be verified`, [], { instanceId: inline.id }));
        if (maximum !== undefined) proposals.push({ code: "engine-inline-stage-power", message: "Expose per-inline-component power from the canonical engine before comparing recorded inline maximum power limits.", owner: "coordinator" });
      }
      const pigtailLength = knownNumber(inline, inlineModel, "inline.length");
      if (pigtailLength !== undefined) {
        limits.push(finding("unknown", "pigtail-length-not-in-engine", `Inline ${inline.label} records length ${pigtailLength} m that the engine does not add to base-cable length`, [], { instanceId: inline.id }));
      }
      if (insertionLossDb === undefined) missing.push(finding("unknown", "unknown-inline-loss", `Inline ${inline.label} insertion loss is unknown and will not be treated as zero`, [], { instanceId: inline.id }));
      if (!componentType) missing.push(finding("unknown", "unknown-inline-type", `Inline ${inline.label} has no component type`, [], { instanceId: inline.id }));
      if (componentType && insertionLossDb !== undefined) {
        const connectorFrom = knownConnector(inline, inlineModel, "inline.connectorFrom");
        const connectorTo = knownConnector(inline, inlineModel, "inline.connectorTo");
        if (componentType === "choke") {
          const chokeType = knownText(inline, inlineModel, "inline.chokeType");
          if (!chokeType) missing.push(finding("unknown", "unknown-choke-type", `Choke ${inline.label} has no choke type`, [], { instanceId: inline.id }));
          else inlines.push({ id: inline.id, name: inline.label, componentType, insertionLossDb, chokeType: chokeType as "common_mode", ...(inlineBands ? { bands: inlineBands } : {}), addedAt: inline.addedAt });
        } else if (componentType === "adapter") {
          if (!connectorFrom || !connectorTo) missing.push(finding("unknown", "unknown-inline-connectors", `Adapter ${inline.label} is missing engine connector enums; workbench port connectors are not copied as invented feedline connectors`, [], { instanceId: inline.id }));
          else inlines.push({ id: inline.id, name: inline.label, componentType, insertionLossDb, connectorFrom, connectorTo, addedAt: inline.addedAt });
        } else if (componentType === "pigtail") {
          if (!connectorFrom || !connectorTo) missing.push(finding("unknown", "unknown-inline-connectors", `Pigtail ${inline.label} is missing engine connector enums`, [], { instanceId: inline.id }));
          else {
            inlines.push({ id: inline.id, name: inline.label, componentType, insertionLossDb, connectorFrom, connectorTo, lengthInches: 0, addedAt: inline.addedAt });
            limits.push(finding("unknown", "pigtail-length-excluded-from-feedline", "Pigtail length is not added to UserFeedline.lengthFeet; engine pigtail.lengthInches is unused for loss and is left at 0 rather than converting workbench meters twice", [], { instanceId: inline.id }));
            proposals.push({ code: "engine-pigtail-length", message: "InlineComponent pigtail.lengthInches is required by the engine type but must not be added to UserFeedline.lengthFeet. Keep run.lengthMeters as the only feedline length input.", owner: "coordinator" });
          }
        } else if (componentType === "balun") {
          const ratio = knownText(inline, inlineModel, "inline.ratio");
          if (!ratio) missing.push(finding("unknown", "unknown-balun-ratio", `Balun ${inline.label} has no ratio`, [], { instanceId: inline.id }));
          else inlines.push({ id: inline.id, name: inline.label, componentType, insertionLossDb, ratio: ratio as "1:1", ...(inlineBands ? { bands: inlineBands } : {}), addedAt: inline.addedAt });
        } else if (componentType === "ferrite") {
          const ferriteType = knownText(inline, inlineModel, "inline.ferriteType");
          const count = knownNumber(inline, inlineModel, "inline.count");
          if (!ferriteType || count === undefined) missing.push(finding("unknown", "unknown-ferrite-fields", `Ferrite ${inline.label} is missing type or count; count will not be invented as zero`, [], { instanceId: inline.id }));
          else inlines.push({ id: inline.id, name: inline.label, componentType, insertionLossDb, ferriteType: ferriteType as "snap_on", count, addedAt: inline.addedAt });
        }
      }
    });
    if (feedlineType && connectorType && condition && connectorCount !== undefined && run.lengthMeters.state === "known") {
      feedlines.push({
        id: cable.id, name: cable.label, feedlineType, lengthFeet: run.lengthMeters.value / METERS_PER_FOOT,
        connectorCount, connectorType, ...(connectorTypeFarEnd ? { connectorTypeFarEnd } : {}), condition, addedAt: cable.addedAt,
      });
      feedlineRuns.push({ id: run.id, feedlineId: cable.id, inlineComponentIds: inlineItems.map((item) => item.instanceId) });
      nodes.push({ type: "feedline_run", feedlineRunId: run.id });
    }
  };

  emission.forEach((hop, emissionIndex) => {
    if (hop.kind === "connection" && hop.connection?.runId) {
      const run = revision.cableRuns.find((item) => item.id === hop.connection?.runId);
      const segment = run?.connections.find((item) => item.connectionId === hop.connection?.id);
      if (run && segment) emitRun(run, hop.reverse !== segment.reverse, emissionIndex);
    }
    if (hop.kind === "internal" && hop.instance) {
      if (hop.instance.kind === "inline") {
        const represented = revision.cableRuns.some((run) => usedRuns.has(run.id) && run.inlineItems.some((item) => item.instanceId === hop.instance!.id
          && item.internalPathId === hop.path?.id && (item.reverse !== emittedRunDirections.get(run.id)) === hop.reverse));
        if (!represented) {
          limits.push(finding("contradicted", "unrepresented-inline-path", `Selected internal path and direction of ${hop.instance.label} do not match the emitted cable run`, [], { instanceId: hop.instance.id }));
        }
      } else if (hop.instance.kind !== "accessory") {
        limits.push(finding("contradicted", "unrepresented-device-path", `Internal path through ${hop.instance.label} cannot be represented by the engine`, [], { instanceId: hop.instance.id }));
      } else {
        const model = modelOf(revision, hop.instance);
        const category = accessoryCategory(hop.instance, model);
        if (!category) {
          missing.push(finding("unknown", "unknown-accessory-category", `Accessory ${hop.instance.label} has no category`, [], { instanceId: hop.instance.id }));
          return;
        }
        if (SHACK_CATEGORIES.has(category) || !SIGNAL_PATH_CATEGORIES.has(category)) {
          limits.push(finding("contradicted", "non-rf-accessory-on-route", `Accessory ${hop.instance.label} category ${category} is not an RF-path device`, [], { instanceId: hop.instance.id }));
          return;
        }
        const bands = knownList(hop.instance, model, "accessory.bands");
        const bandField = lookupField(hop.instance, model, "accessory.bands");
        if (bandField && bands === undefined) {
          missing.push(finding("unknown", "unknown-accessory-bands", `Accessory ${hop.instance.label} explicitly records unknown band support`, [], { instanceId: hop.instance.id }));
        } else if (bands) {
          for (const band of requestedBands) {
            if (!bands.includes(band)) limits.push(finding("contradicted", "accessory-band-unsupported", `Accessory ${hop.instance.label} does not declare support for requested band ${band}`, [], { instanceId: hop.instance.id }));
          }
        }
        // Amplifier output caps and tuner required ratings retain their category
        // checks below. Optional passive ratings must not disappear as undefined.
        if (category !== "amplifier" && category !== "tuner"
          && lookupField(hop.instance, model, "accessory.maxPowerWatts")
          && knownNumber(hop.instance, model, "accessory.maxPowerWatts") === undefined) {
          missing.push(finding("unknown", "unknown-accessory-power-limit", `Accessory ${hop.instance.label} explicitly records an unknown maximum power`, [], { instanceId: hop.instance.id }));
        }
        if (category === "amplifier") {
          const gainDb = knownNumber(hop.instance, model, "accessory.gainDb");
          const maxPowerWatts = knownNumber(hop.instance, model, "accessory.maxPowerWatts");
          if (gainDb === undefined) missing.push(finding("unknown", "unknown-amplifier-gain", `Amplifier ${hop.instance.label} gain is unknown and will not be treated as zero`, [], { instanceId: hop.instance.id }));
          if (maxPowerWatts === undefined) missing.push(finding("unknown", "unknown-amplifier-power", `Amplifier ${hop.instance.label} max power is unknown`, [], { instanceId: hop.instance.id }));
          if (gainDb !== undefined && gainDb < 0) {
            limits.push(finding("contradicted", "engine-clamps-negative-amplifier-gain", "stationChainEngine clamps amplifier gain to ≥ 0; signed negative gain cannot be represented as a known engine input", [], { instanceId: hop.instance.id }));
            proposals.push({ code: "engine-signed-amplifier-gain", message: "Allow signed accessory.gainDb through stationChainEngine without clampNonNegative, or accept an explicit unsupported result for negative gain.", owner: "coordinator" });
          }
          if (gainDb !== undefined && maxPowerWatts !== undefined) {
            accessories.push({ id: hop.instance.id, name: hop.instance.label, category: "amplifier", gainDb, maxPowerWatts, bands, addedAt: hop.instance.addedAt });
            nodes.push({ type: "accessory", accessoryId: hop.instance.id });
          }
        } else if (category === "filter") {
          const insertionLossDb = knownNumber(hop.instance, model, "accessory.insertionLossDb");
          const filterType = knownText(hop.instance, model, "accessory.filterType") as "bandpass" | "lowpass" | "highpass" | "notch" | undefined;
          if (insertionLossDb === undefined) missing.push(finding("unknown", "unknown-filter-loss", `Filter ${hop.instance.label} insertion loss is unknown and will not be treated as zero`, [], { instanceId: hop.instance.id }));
          if (!filterType) missing.push(finding("unknown", "unknown-filter-type", `Filter ${hop.instance.label} has no filter type`, [], { instanceId: hop.instance.id }));
          if (insertionLossDb !== undefined && filterType) {
            accessories.push({ id: hop.instance.id, name: hop.instance.label, category: "filter", filterType, insertionLossDb, bands, addedAt: hop.instance.addedAt });
            nodes.push({ type: "accessory", accessoryId: hop.instance.id });
          }
        } else if (category === "switch") {
          const insertionLossDb = knownNumber(hop.instance, model, "accessory.insertionLossDb");
          const ports = knownNumber(hop.instance, model, "accessory.ports") ?? hop.instance.ports.length;
          if (insertionLossDb === undefined) missing.push(finding("unknown", "unknown-switch-loss", `Switch ${hop.instance.label} insertion loss is unknown and will not be treated as zero`, [], { instanceId: hop.instance.id }));
          if (insertionLossDb !== undefined) {
            accessories.push({ id: hop.instance.id, name: hop.instance.label, category: "switch", ports, insertionLossDb, addedAt: hop.instance.addedAt });
            nodes.push({ type: "accessory", accessoryId: hop.instance.id });
          }
        } else if (category === "tuner") {
          // The current engine consumes constant insertion loss and exposes no
          // tuner load impedance or SWR-conditioned loss evaluation.
          for (const field of ["accessory.lossAtSwr", "accessory.matchingRangeOhms"] as const) {
            const recorded = lookupField(hop.instance, model, field);
            if (!recorded) continue;
            const label = field === "accessory.lossAtSwr" ? "SWR-dependent loss" : "matching impedance range";
            if (recorded.value.state === "unknown") {
              missing.push(finding("unknown", "unknown-tuner-constraint", `Tuner ${hop.instance.label} explicitly records unknown ${label}`, [], { instanceId: hop.instance.id }));
            } else {
              limits.push(finding("contradicted", "unrepresented-tuner-constraint", `Tuner ${hop.instance.label} records ${label} that the constant-loss engine cannot resolve; dependent estimates are withheld`, [], { instanceId: hop.instance.id }));
            }
            proposals.push({ code: "engine-tuner-constraints", message: "Expose modeled load impedance and SWR at the tuner, and evaluate recorded matching ranges and conditional losses before issuing a supported estimate.", owner: "coordinator" });
          }
          const insertionLossDb = knownNumber(hop.instance, model, "accessory.insertionLossDb");
          const tunerType = knownText(hop.instance, model, "accessory.tunerType") as "manual" | "automatic" | undefined;
          const maxPowerWatts = knownNumber(hop.instance, model, "accessory.maxPowerWatts");
          if (maxPowerWatts === undefined) missing.push(finding("unknown", "unknown-tuner-power", `Tuner ${hop.instance.label} max power is unknown`, [], { instanceId: hop.instance.id }));
          if (insertionLossDb === undefined) missing.push(finding("unknown", "unknown-tuner-loss", `Tuner ${hop.instance.label} insertion loss is unknown and will not be treated as zero`, [], { instanceId: hop.instance.id }));
          if (!tunerType) missing.push(finding("unknown", "unknown-tuner-type", `Tuner ${hop.instance.label} has no tuner type`, [], { instanceId: hop.instance.id }));
          if (insertionLossDb !== undefined && maxPowerWatts !== undefined && tunerType) {
            accessories.push({ id: hop.instance.id, name: hop.instance.label, category: "tuner", type: tunerType, maxPowerWatts, insertionLossDb, addedAt: hop.instance.addedAt });
            nodes.push({ type: "accessory", accessoryId: hop.instance.id });
          }
        }
      }
    }
  });
  nodes.push({ type: "antenna", antennaId: antenna.id });
  if (nodes.length > MAX_CHAIN_NODES) {
    limits.push(finding("contradicted", "engine-node-limit", `Compiled chain has ${nodes.length} nodes; stationChainEngine documents MAX_CHAIN_NODES=${MAX_CHAIN_NODES}`));
    proposals.push({ code: "engine-node-limit", message: "Raise or remove MAX_CHAIN_NODES for workbench-compiled routes, or split evaluation.", owner: "coordinator" });
    return { chain: null, members, cableRuns: compiledRuns, limits, missing, proposals, inventory: null };
  }

  const radioModel = modelOf(revision, radio);
  const antennaModel = modelOf(revision, antenna);
  const maxPower = knownNumber(radio, radioModel, "radio.maxPower");
  const minPower = knownNumber(radio, radioModel, "radio.minPower");
  const bands = knownList(radio, radioModel, "radio.bands") ?? knownList(radio, radioModel, "equipment.bands");
  const modes = knownList(radio, radioModel, "radio.modes");
  const tier = knownText(radio, radioModel, "radio.tier") as RadioTier | undefined;
  const manufacturer = knownText(radio, radioModel, "equipment.manufacturer") ?? radioModel?.manufacturer ?? "Unknown";
  const modelName = knownText(radio, radioModel, "radio.model") ?? radioModel?.name ?? radio.label;
  if (maxPower === undefined) missing.push(finding("unknown", "unknown-radio-max-power", "Radio maximum power is unknown; the engine will not receive a fabricated 100 W", [], { instanceId: radio.id }));
  if (minPower === undefined) missing.push(finding("unknown", "unknown-radio-min-power", "Radio minimum power is unknown; the engine will not receive a fabricated zero", [], { instanceId: radio.id }));
  if (!bands?.length) missing.push(finding("unknown", "unknown-radio-bands", "Radio bands are unknown; none were inferred from frequency", [], { instanceId: radio.id }));
  if (!tier || !RADIO_TIERS.includes(tier)) missing.push(finding("unknown", "unknown-radio-tier", "Radio tier is unknown; the engine type requires one and this adapter will not invent it", [], { instanceId: radio.id }));

  const antennaType = knownText(antenna, antennaModel, "antenna.antennaType") as UserAntennaType | undefined;
  const gainPattern = knownText(antenna, antennaModel, "antenna.gainPatternType") as AntennaType | undefined;
  const antennaBands = knownList(antenna, antennaModel, "antenna.bands") ?? knownList(antenna, antennaModel, "equipment.bands");
  const heightMeters = knownNumber(antenna, antennaModel, "antenna.heightMeters");
  const polarization = knownText(antenna, antennaModel, "antenna.polarization") as UserAntenna["polarization"] | undefined;
  const mounting = knownText(antenna, antennaModel, "antenna.mounting") as UserAntenna["mounting"] | undefined;
  const gainMap = knownMap(antenna, antennaModel, "antenna.gainDbiOverride");
  const scalarGain = knownNumber(antenna, antennaModel, "antenna.gain");
  const swrMap = knownMap(antenna, antennaModel, "antenna.swrByBand");
  const scalarSwr = knownNumber(antenna, antennaModel, "antenna.swr");
  if (!antennaType) missing.push(finding("unknown", "unknown-antenna-type", "Antenna type is unknown; none was inferred", [], { instanceId: antenna.id }));
  if (!gainPattern && !(antennaType && antennaType in ANTENNA_TYPE_TO_PATTERN)) missing.push(finding("unknown", "unknown-gain-pattern", "Antenna gain pattern is unknown; peak catalog gain will not be substituted as a known value", [], { instanceId: antenna.id }));
  if (!antennaBands?.length) missing.push(finding("unknown", "unknown-antenna-bands", "Antenna bands are unknown", [], { instanceId: antenna.id }));
  if (heightMeters === undefined) missing.push(finding("unknown", "unknown-antenna-height", "Antenna height is unknown; the engine requires heightMeters and zero will not be substituted", [], { instanceId: antenna.id }));
  if (!polarization) missing.push(finding("unknown", "unknown-polarization", "Antenna polarization is unknown; the engine type requires one", [], { instanceId: antenna.id }));
  if (!mounting) missing.push(finding("unknown", "unknown-mounting", "Antenna mounting is unknown; the engine type requires one", [], { instanceId: antenna.id }));
  if (gainMap === undefined && scalarGain === undefined) {
    missing.push(finding("unknown", "unknown-antenna-gain", "Antenna gain is unknown; engine peakGainDbi fallback would smuggle a catalog default into a known result", [], { instanceId: antenna.id }));
    proposals.push({ code: "engine-default-antenna-gain", message: "stationChainEngine uses ANTENNA_TYPES peakGainDbi then 0 when gainDbiOverride is absent. Accept optional gain or return unknown instead of a numeric default.", owner: "coordinator" });
  }
  if (swrMap === undefined && scalarSwr === undefined) {
    missing.push(finding("unknown", "unknown-antenna-swr", "Antenna SWR is unknown; engine DEFAULT_SWR 1.5 would smuggle a fabricated match into feedline loss", [], { instanceId: antenna.id }));
    proposals.push({ code: "engine-default-swr", message: "stationChainEngine uses DEFAULT_SWR 1.5 when swrByBand is missing. Require explicit SWR or compute loss with an unknown result.", owner: "coordinator" });
  }
  const ferriteLoss = knownNumber(antenna, antennaModel, "antenna.feedpointFerrites.insertionLossDb");
  if (ferriteLoss !== undefined && ferriteLoss !== 0) {
    limits.push(finding("contradicted", "feedpoint-ferrite-not-in-engine", `Feedpoint ferrite loss ${ferriteLoss} dB is recorded but stationChainEngine does not apply it; dependent estimates are withheld`, [], { instanceId: antenna.id }));
    proposals.push({ code: "engine-feedpoint-ferrite-loss", message: "Optionally fold recorded antenna.feedpointFerrites.insertionLossDb into the canonical engine once, with provenance, rather than in this adapter.", owner: "coordinator" });
  }

  const requestedPower = revision.settings.requestedPowerWatts;
  if (route.purpose === "transmit" && requestedPower.state === "unknown") {
    missing.push(finding("unknown", "unknown-requested-power", requestedPower.reason, ["settings", "requestedPowerWatts"]));
  }
  const operatingPowerWatts = requestedPower.state === "known" ? requestedPower.value : undefined;
  if (route.purpose === "receive" && requestedPower.state === "unknown") {
    missing.push(finding("unknown", "unknown-receive-power-for-engine", "Receive intent may omit transmit power, but the engine still requires operatingPowerWatts; W07 will not invent 0 W from unknown", ["settings", "requestedPowerWatts"]));
    proposals.push({ code: "engine-receive-power", message: "Allow computeStationChainPerformance to evaluate receive path loss without a transmit power, or accept an explicit omitted-power input.", owner: "coordinator" });
  }

  if (missing.length) {
    return { chain: null, members, cableRuns: compiledRuns, limits, missing, proposals, inventory: null };
  }

  const resolvedPattern = gainPattern ?? (antennaType ? ANTENNA_TYPE_TO_PATTERN[antennaType] as AntennaType : undefined);
  // A map's existence says nothing about an absent band key. Resolve every
  // requested band before entering the engine, which otherwise supplies defaults.
  const resolveBands = (map: Record<string, number> | undefined, scalar: number | undefined, field: string) => {
    const resolved: Record<string, number> = {};
    requestedBands.forEach((band) => {
      const value = map && Object.prototype.hasOwnProperty.call(map, band) ? map[band] : scalar;
      if (value === undefined) missing.push(finding("unknown", `unknown-antenna-${field}-band`, `Antenna ${field} is not recorded for ${band}; engine defaults will not be substituted`, [], { instanceId: antenna.id }));
      else resolved[band] = value;
    });
    return resolved;
  };
  const gainDbiOverride = resolveBands(gainMap, scalarGain, "gain");
  const swrByBand = resolveBands(swrMap, scalarSwr, "swr");
  const userAntenna: UserAntenna = {
    id: antenna.id, name: antenna.label, antennaType: antennaType!, gainPatternType: resolvedPattern!,
    bands: antennaBands!, heightMeters: heightMeters!, polarization: polarization!, mounting: mounting!,
    azimuthDeg: knownNumber(antenna, antennaModel, "antenna.azimuthDeg"),
    isRotatable: knownBoolean(antenna, antennaModel, "antenna.isRotatable"),
    gainDbiOverride, swrByBand, addedAt: antenna.addedAt,
  };
  const userRadio: UserRadio = {
    id: radio.id, equipmentId: radio.modelId ?? radio.id, nickname: radio.label,
    customPowerLimit: knownNumber(radio, radioModel, "radio.customPowerLimit"),
    specPreference: radio.privateMetadata.specPreference, addedAt: radio.addedAt,
  };
  const equipment: RadioEquipment = {
    id: radio.modelId ?? radio.id, manufacturer, model: modelName,
    displayName: knownText(radio, radioModel, "radio.displayName") ?? radio.label,
    receiver: { rmdr: Number.NaN, imdr3: Number.NaN, blockingGain: Number.NaN, sensitivity: Number.NaN },
    maxPower: maxPower!, minPower: minPower!,
    // The power/loss engine does not consume mode capability. An empty array
    // keeps its input shape safe; the separate envelope gate retains unknown.
    modes: (modes ?? []).filter((mode): mode is RadioMode => RADIO_MODES.includes(mode as RadioMode)),
    bands: bands!, tier: tier!,
  };
  const chain: StationChain = {
    id: `workbench:${revision.id}:${route.id}`,
    name: route.name,
    nodes,
    feedlineRuns,
    operatingPowerWatts: operatingPowerWatts!,
    linkedLocationId: revision.location?.id,
    shackAccessoryIds: members
      .filter((member) => member.role === "unwired-member")
      .map((member) => member.instanceId)
      .filter((id) => revision.equipment.find((item) => item.id === id)?.kind === "accessory"),
    notes: revision.notes,
    createdAt: revision.createdAt,
  };
  return {
    chain, members, cableRuns: compiledRuns, limits, missing, proposals,
    inventory: {
      radios: [{ userRadio, equipment }],
      antennas: [userAntenna],
      feedlines,
      accessories,
      inlineComponents: inlines,
    },
  };
}

function documentedLayers(revision: Revision, hops: OrientedHop[]): DocumentedLayer[] {
  const used = new Set(hops.flatMap((hop) => hop.connection ? [hop.connection.id] : []));
  const layers: DocumentedLayer[] = [];
  revision.connections.forEach((connection) => {
    if (used.has(connection.id)) return;
    if (connection.signal === "rf") {
      layers.push({ connectionId: connection.id, signal: connection.signal, reason: "RF connection is not on the explicitly selected route; it is retained as documentation and is not compiled" });
      return;
    }
    layers.push({ connectionId: connection.id, signal: connection.signal, reason: `${connection.signal} layer is documented and is not an RF engine path` });
  });
  return layers;
}

function fillReceiver(
  equipment: RadioEquipment, catalog: CatalogReceiverSelection,
): { ok: boolean; limits: CompatibilityFinding[]; proposals: IntegrationProposal[] } {
  const limits: CompatibilityFinding[] = [];
  const proposals: IntegrationProposal[] = [];
  if (catalog.selectedSource === "unknown") {
    limits.push(finding("unknown", "unknown-receiver-group", "No factory or tested receiver group is available; engine RadioEquipment.receiver required fields will not be fabricated"));
    proposals.push({ code: "engine-optional-receiver", message: "Make RadioEquipment.receiver optional, or accept workbench unknown quantities, so chain evaluation can proceed without dummy RMDR/IMDR/sensitivity.", owner: "coordinator" });
    return { ok: false, limits, proposals };
  }
  const expectedReportType = catalog.selectedSource === "tested" ? "independent-test" : "manufacturer";
  const attributed = Object.values(catalog.fields).every((field) => field.state === "unknown" || catalog.evidence.some((source) => source.id === field.evidenceId && source.kind === "report" && source.reportType === expectedReportType));
  if (!attributed) {
    limits.push(finding("unknown", "receiver-provenance-not-supported", "The engine cannot label this receiver group's declared or modeled evidence accurately; its envelope is withheld while the pinned evidence remains available"));
    proposals.push({ code: "engine-receiver-provenance", message: "Accept explicit receiver evidence classification instead of inferring manufacturer/test attribution from the receiver object slot.", owner: "coordinator" });
    return { ok: false, limits, proposals };
  }
  const prefix = catalog.selectedSource === "tested" ? "testedSpecs" : "receiver";
  const required = REQUIRED_RECEIVER.every((metric) => catalog.fields[metric].state === "known" && typeof catalog.fields[metric].value === "number");
  if (!required) {
    limits.push(finding("unknown", "partial-receiver-group", "The selected catalog receiver group is partial; required engine receiver fields will not be filled from another group or with zeros"));
    return { ok: false, limits, proposals };
  }
  const number = (metric: ReceiverMetric): number => (catalog.fields[metric].state === "known" && typeof catalog.fields[metric].value === "number" ? catalog.fields[metric].value : Number.NaN);
  const sensitivityVolts = number("sensitivity");
  const receiver = {
    rmdr: number("rmdr"), imdr3: number("imdr3"), blockingGain: number("blockingGain"),
    sensitivity: sensitivityVolts * VOLTS_TO_MICROVOLTS,
    ...(catalog.fields.noiseFloorDbm.state === "known" && typeof catalog.fields.noiseFloorDbm.value === "number" ? { noiseFloorDbm: catalog.fields.noiseFloorDbm.value } : {}),
    ...(catalog.fields.ip3Dbm.state === "known" && typeof catalog.fields.ip3Dbm.value === "number" ? { ip3Dbm: catalog.fields.ip3Dbm.value } : {}),
    ...(catalog.fields.phaseNoiseDbcHz.state === "known" && typeof catalog.fields.phaseNoiseDbcHz.value === "object" ? { phaseNoiseDbcHz: catalog.fields.phaseNoiseDbcHz.value as Record<string, number> } : {}),
  };
  if (prefix === "testedSpecs") equipment.testedSpecs = receiver;
  else equipment.receiver = receiver;
  if (prefix === "testedSpecs") {
    // Engine envelope reads testedSpecs when present; keep factory object distinct and unclaimed.
    equipment.receiver = { rmdr: Number.NaN, imdr3: Number.NaN, blockingGain: Number.NaN, sensitivity: Number.NaN };
  }
  limits.push(finding("compatible", "sensitivity-unit-conversion", "Workbench radio.receiver.sensitivity is volts; RadioEquipment.sensitivity is microvolts. The adapter converts at the engine boundary and reports volts in gear capability."));
  return { ok: true, limits, proposals };
}

function metricsFromEngine(result: NonNullable<ReturnType<typeof computeStationChainPerformance>["bands"][number]>, band: string): ReportedQuantity[] {
  const qty = (name: string, value: number, unit: string): ReportedQuantity => ({
    name, quantity: { state: "known", value, unit, evidenceId: "engine-modeled" }, unit, provenance: "engine-modeled", sourceId: band,
  });
  return [
    qty("frequency", result.freqMHz * 1e6, "Hz"),
    qty("requestedPower", result.requestedPowerWatts, "W"),
    qty("conductedPower", result.txPowerWatts, "W"),
    qty("feedlineLoss", result.feedlineLossDb, "dB"),
    qty("inlineLoss", result.inlineLossDb, "dB"),
    qty("passiveLoss", result.totalPassiveLossDb, "dB"),
    qty("amplifierGain", result.totalAmplifierGainDb, "dB"),
    qty("antennaGain", result.antennaGainDbi, "dBi"),
    qty("powerAtAntenna", result.powerAtAntennaWatts, "W"),
    qty("eirp", result.eirpWatts, "W"),
    qty("erp", result.erpWatts, "W"),
  ];
}

/** Compile one explicit selected route from pinned revision inputs into the canonical engine. */
export function compileSelectedRoute(input: unknown, requestInput: unknown): DeepReadonly<RouteCompilation> {
  const parsedRequest = routeCompileRequestSchema.safeParse(requestInput);
  const request: RouteCompileRequest = parsedRequest.success ? parsedRequest.data : { revisionId: "", routeId: "" };
  let effectiveMode = request.options?.mode ?? null;
  let effectiveBands = request.options?.bands ?? null;
  const diagnostics: CompatibilityFinding[] = [];
  const empty = (status: CompilationStatus, extra: Partial<RouteCompilation> = {}): DeepReadonly<RouteCompilation> => immutable({
    status, revisionId: request.revisionId, routeId: request.routeId, purpose: null, structuralCandidate: false,
    compatibility: { overall: "not-evaluated", hops: [], findings: diagnostics },
    exclusiveSelections: [], topology: { chain: extra.topology?.chain ?? null, members: extra.topology?.members ?? [], cableRuns: extra.topology?.cableRuns ?? [], documentedLayers: extra.topology?.documentedLayers ?? [] },
    gearCapability: { radio: {}, antenna: {}, catalogReceiver: null, bibliography: [] },
    modeledRoute: { state: "withheld", reasons: extra.modeledRoute?.reasons ?? diagnostics.map((item) => item.message), engine: null, envelope: null },
    measurements: [], pathTimeConditions: { bands: effectiveBands, targetBearingDeg: request.options?.targetBearingDeg ?? null, takeoffAngleDeg: request.options?.takeoffAngleDeg ?? null, mode: effectiveMode, localNoiseFloorDbm: request.options?.localNoiseFloorDbm ?? null },
    metrics: [], assumptions: [], missingInputs: extra.missingInputs ?? [], calculationLimits: extra.calculationLimits ?? [],
    integrationProposals: extra.integrationProposals ?? [], diagnostics, ...extra,
  } as RouteCompilation);

  if (!parsedRequest.success) {
    diagnostics.push(finding("contradicted", "invalid-request", parsedRequest.error.message));
    return empty("invalid");
  }
  let archive: Archive;
  try {
    archive = parseWorkbenchArchive(input);
  } catch (error) {
    diagnostics.push(finding("contradicted", "invalid-document", error instanceof Error ? error.message : "Workbench archive is invalid"));
    return empty("invalid");
  }
  const revision = archive.revisions.find((item) => item.id === request.revisionId);
  if (!revision) {
    diagnostics.push(finding("contradicted", "missing-revision", `Pinned revision does not exist: ${request.revisionId}`, ["revisions"]));
    return empty("invalid");
  }
  const route = revision.routes.find((item) => item.id === request.routeId);
  if (!route) {
    diagnostics.push(finding("contradicted", "missing-route", `Selected route was not found: ${request.routeId}. No radio, antenna or first route was inferred.`, ["routes"]));
    return empty("invalid");
  }
  const bandId = request.options?.bands?.length ? request.options.bands : (revision.settings.bandId ? [revision.settings.bandId] : null);
  const rawMode = request.options?.mode ?? revision.settings.mode ?? null;
  const parsedMode = routeCompileModeSchema.safeParse(rawMode);
  const mode = parsedMode.success ? parsedMode.data : rawMode;
  effectiveMode = mode;
  effectiveBands = bandId;
  if (bandId?.some((band) => !routeCompileBandSchema.safeParse(band).success)) {
    diagnostics.push(finding("contradicted", "unsupported-pinned-band", "The pinned band has no engine center frequency"));
    return empty("unsupported");
  }
  const structuralCandidate = route.analysis.state === "candidate";
  const walk = walkRoute(revision, route);
  diagnostics.push(...walk.diagnostics);
  const layers = documentedLayers(revision, walk.hops);
  if (route.analysis.state === "documentation-only") {
    route.analysis.reasons.forEach((reason) => diagnostics.push(finding("contradicted", "documented-limit", reason, ["routes"], { connectionId: undefined })));
  }
  const exclusives = exclusiveSelections(walk.hops);
  if (exclusives.conflict) diagnostics.push(finding("contradicted", "exclusive-conflict", "Selected route includes more than one path from an exclusive switch group; hardware is not claimed to have switched"));
  if (walk.cycle) diagnostics.push(finding("contradicted", "cycle", "Selected route revisits an endpoint; cycles are documented and not compiled into the ordered engine"));

  const hopCompat = walk.hops.map((hop) => evaluateHop(hop, route.purpose, revision.settings.frequencyHz, revision));
  const overall = hopCompat.length ? aggregate(hopCompat.flatMap((hop) => hop.findings).concat(diagnostics)) : aggregate(diagnostics);
  const radio = revision.equipment.find((item) => item.kind === "radio" && walk.hops.some((hop) => hop.from.instanceId === item.id || hop.to.instanceId === item.id));
  const antenna = revision.equipment.find((item) => item.kind === "antenna" && walk.hops.some((hop) => hop.from.instanceId === item.id || hop.to.instanceId === item.id));
  const catalogReceiver = radio ? resolvePinnedReceiver(revision, radio, request.options?.preferTestedSpecs === true) : null;
  const bibliography = catalogReceiver?.modelCitations ?? [];
  const measurements = revision.evidence.filter((entry): entry is Extract<Evidence, { kind: "measurement" }> => entry.kind === "measurement");
  const gearRadio: Record<string, Quantity> = radio ? {
    maxPower: quantityFromLookup(radio, modelOf(revision, radio), "radio.maxPower", "Radio maximum power is not recorded"),
    minPower: quantityFromLookup(radio, modelOf(revision, radio), "radio.minPower", "Radio minimum power is not recorded"),
    customPowerLimit: quantityFromLookup(radio, modelOf(revision, radio), "radio.customPowerLimit", "No instance power limit is recorded"),
  } : {};
  const gearAntenna: Record<string, Quantity> = antenna ? {
    gain: quantityFromLookup(antenna, modelOf(revision, antenna), "antenna.gain", "Antenna gain is not recorded"),
    heightMeters: quantityFromLookup(antenna, modelOf(revision, antenna), "antenna.heightMeters", "Antenna height is not recorded"),
    swr: quantityFromLookup(antenna, modelOf(revision, antenna), "antenna.swr", "Antenna SWR is not recorded"),
  } : {};
  if (catalogReceiver) {
    RECEIVER_METRICS.forEach((metric) => {
      const field = catalogReceiver.fields[metric];
      if (field.state === "known" && typeof field.value === "number") {
        gearRadio[`receiver.${metric}`] = { state: "known", value: field.value, unit: field.unit ?? "", evidenceId: field.evidenceId };
      } else if (field.state === "unknown") {
        gearRadio[`receiver.${metric}`] = field;
      }
    });
  }

  const latestFindings = () => [...diagnostics, ...hopCompat.flatMap((hop) => hop.findings)];
  const latestOverall = () => hopCompat.length ? aggregate(latestFindings()) : aggregate(diagnostics);
  const withhold = (status: CompilationStatus, reasons: string[], extra: Partial<RouteCompilation> = {}) => empty(status, {
    purpose: route.purpose, structuralCandidate,
    compatibility: { overall: latestOverall(), hops: hopCompat, findings: latestFindings() },
    exclusiveSelections: exclusives.selections,
    topology: { chain: extra.topology?.chain ?? null, members: extra.topology?.members ?? [], cableRuns: extra.topology?.cableRuns ?? [], documentedLayers: layers },
    gearCapability: { radio: gearRadio, antenna: gearAntenna, catalogReceiver, bibliography },
    modeledRoute: { state: "withheld", reasons, engine: null, envelope: null },
    measurements, assumptions: extra.assumptions ?? [], missingInputs: extra.missingInputs ?? [],
    calculationLimits: extra.calculationLimits ?? [], integrationProposals: extra.integrationProposals ?? [],
    diagnostics: latestFindings(),
  });

  if (walk.cycle || exclusives.conflict || route.analysis.state === "documentation-only" || walk.diagnostics.some((item) => item.code === "non-rf-hop")) {
    const compiled = compileChain(revision, route, walk.hops, bandId ?? []);
    return withhold("unsupported", [
      ...(walk.cycle ? ["Selected route contains a cycle"] : []),
      ...(exclusives.conflict ? ["Exclusive switch paths conflict on the selected route"] : []),
      ...(route.analysis.state === "documentation-only" ? route.analysis.reasons : []),
      ...walk.diagnostics.filter((item) => item.code === "non-rf-hop").map((item) => item.message),
    ], {
      topology: { chain: null, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
      calculationLimits: compiled.limits, missingInputs: compiled.missing, integrationProposals: compiled.proposals,
    });
  }
  if (overall === "contradicted") {
    const compiled = compileChain(revision, route, walk.hops, bandId ?? []);
    return withhold("unsupported", ["Selected route has contradicted compatibility and is not an engine-supported estimate"], {
      topology: { chain: null, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
      calculationLimits: compiled.limits, missingInputs: compiled.missing, integrationProposals: compiled.proposals,
    });
  }

  const compiled = compileChain(revision, route, walk.hops, bandId ?? []);
  const blockingLimits = compiled.limits.filter((item) => item.verdict === "contradicted");
  if (blockingLimits.length) {
    return withhold("unsupported", blockingLimits.map((item) => item.message), {
      topology: { chain: null, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
      missingInputs: compiled.missing, calculationLimits: compiled.limits, integrationProposals: compiled.proposals,
    });
  }
  const unknownCompat = overall === "unknown";
  if (unknownCompat) {
    compiled.missing.push(finding("unknown", "unknown-compatibility", "Compatibility is unknown; dependent engine results are withheld rather than assumed valid"));
  }
  if (!compiled.chain || !compiled.inventory || compiled.missing.length) {
    return withhold("incomplete", compiled.missing.map((item) => item.message), {
      topology: { chain: compiled.chain, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
      missingInputs: compiled.missing, calculationLimits: compiled.limits, integrationProposals: compiled.proposals,
    });
  }

  const radioEquipment = compiled.inventory.radios[0]?.equipment;
  const receiverFill = catalogReceiver && radioEquipment
    ? fillReceiver(radioEquipment, catalogReceiver)
    : { ok: false, limits: [finding("unknown", "missing-catalog-receiver", "No radio catalog receiver selection is available")], proposals: [] as IntegrationProposal[] };
  compiled.limits.push(...receiverFill.limits);
  compiled.proposals.push(...receiverFill.proposals);

  if (!bandId) {
    compiled.missing.push(finding("unknown", "missing-band", "No explicit bandId or compile options.bands was supplied; frequency was not converted into a band"));
    compiled.proposals.push({ code: "explicit-band", message: "W08/callers should pass explicit bands. Do not infer band from frequencyHz.", owner: "coordinator" });
    return withhold("incomplete", compiled.missing.map((item) => item.message), {
      topology: { chain: compiled.chain, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
      missingInputs: compiled.missing, calculationLimits: compiled.limits, integrationProposals: compiled.proposals,
    });
  }

  const frequency = revision.settings.frequencyHz;
  if (frequency.state === "known") {
    const frequencyHz = frequency.value;
    bandId.forEach((band) => {
      const centerMhz = BAND_CENTER_FREQUENCIES[band];
      if (centerMhz != null && Math.abs(centerMhz * 1e6 - frequencyHz) > 1) {
        compiled.limits.push(finding("unknown", "engine-uses-band-center", `Revision frequency is ${frequencyHz} Hz; stationChainEngine evaluates ${band} at ${centerMhz} MHz. W07 does not replace the engine's band-center table.`));
        compiled.proposals.push({ code: "engine-frequency-input", message: "Allow computeStationChainPerformance to accept an explicit Hz input instead of only BAND_CENTER_FREQUENCIES[band].", owner: "coordinator" });
      }
    });
  }

  const assumptions = [
    "W07 compiles one explicit selected RF route; it does not switch hardware or infer unused branches",
    "Canonical calculation authority remains stationChainEngine; this adapter does not reimplement loss or gain physics",
    "Cable-run lengthMeters maps to UserFeedline.lengthFeet at 0.3048 m/ft; inline pigtail lengths are not added",
    ...(catalogReceiver?.fallbackReason ? [catalogReceiver.fallbackReason] : []),
    ...(request.options?.targetBearingDeg == null ? ["target_bearing_not_supplied"] : []),
    ...(request.options?.localNoiseFloorDbm == null ? ["local_noise_not_measured"] : []),
  ];
  const options = { ...request.options, bands: bandId, ...(parsedMode.success ? { mode: parsedMode.data } : {}) };
  if (!parsedMode.success) compiled.limits.push(finding("unknown", mode ? "unsupported-operating-mode" : "unknown-operating-mode", "No supported mode override or pinned mode is recorded; the path envelope is withheld rather than defaulting to WSPR"));
  const engine = computeStationChainPerformance(compiled.chain, compiled.inventory, options);
  const nonfinite = (value: unknown): boolean => typeof value === "number" ? !Number.isFinite(value)
    : value !== null && typeof value === "object" && Object.values(value).some(nonfinite);
  if (nonfinite(engine)) {
    compiled.limits.push(finding("unknown", "nonfinite-engine-result", "The engine produced a nonfinite value; numerical estimates are withheld"));
    return withhold("incomplete", ["Engine output contains nonfinite values"], {
      topology: { chain: compiled.chain, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
      calculationLimits: compiled.limits, integrationProposals: compiled.proposals,
    });
  }
  // An unsupported engine stage may report zero power. That zero cannot
  // establish a rating pass, and a missing band must not quietly disappear.
  if (engine.bands.length !== bandId.length || engine.bands.some((band) => !band.supported || band.nodes.some((node) => !node.supported))) {
    compiled.limits.push(finding("contradicted", "unsupported-engine-band", "The engine cannot evaluate every requested band with supported stages; dependent estimates and power-rating passes are withheld"));
    return withhold("unsupported", ["One or more requested bands are not supported by the compiled engine route"], {
      topology: { chain: compiled.chain, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
      calculationLimits: compiled.limits, integrationProposals: compiled.proposals,
    });
  }
  // Port compatibility must cover the actual calculation frequency as well
  // as the pinned operating frequency; the engine currently uses band centers.
  for (const band of engine.bands) {
    for (const hop of walk.hops) {
      const actual = evaluateHop(hop, route.purpose, { state: "known", value: band.freqMHz * 1e6, unit: "Hz", evidenceId: "engine-modeled" }, revision);
      const frequencyFindings = actual.findings.filter((item) => item.code.includes("frequency"));
      const target = hopCompat.find((item) => item.hopIndex === hop.hopIndex)!;
      target.findings.push(...frequencyFindings.map((item) => ({ ...item, message: `${band.band} engine frequency: ${item.message}`, path: ["hops", hop.hopIndex, "engine", band.band] })));
      target.verdict = aggregate(target.findings);
    }
  }
  const supportedRadioModes = radio ? knownList(radio, modelOf(revision, radio), "radio.modes") : undefined;
  const modeSupported = parsedMode.success && supportedRadioModes?.includes(parsedMode.data) === true;
  if (parsedMode.success && !modeSupported) {
    compiled.limits.push(finding(supportedRadioModes === undefined ? "unknown" : "contradicted", supportedRadioModes === undefined ? "unknown-radio-mode-capability" : "unsupported-radio-mode",
      supportedRadioModes === undefined ? "Pinned radio mode capability is unknown; the mode-dependent envelope is withheld"
        : `Pinned radio does not declare support for ${parsedMode.data}; the mode-dependent envelope is withheld`, [], { instanceId: radio?.id }));
  }
  const envelope = receiverFill.ok && modeSupported
    ? deriveStationFeatureEnvelope(compiled.chain, compiled.inventory, bandId[0], options)
    : null;
  const hopPowerFindings = evaluateEnginePowerRatings(walk.hops, compiled.chain, engine, revision);
  hopPowerFindings.forEach((item) => {
    const hop = hopCompat.find((entry) => entry.hopIndex === item.path[1]);
    if (hop) {
      hop.findings.push(item);
      hop.verdict = aggregate(hop.findings);
    }
  });
  const ratedOverall = hopCompat.length ? aggregate(hopCompat.flatMap((hop) => hop.findings).concat(diagnostics)) : overall;
  if (ratedOverall === "contradicted" || ratedOverall === "unknown") {
    return withhold(ratedOverall === "contradicted" ? "unsupported" : "incomplete", latestFindings().filter((item) => item.verdict !== "compatible").map((item) => item.message), {
      purpose: route.purpose, structuralCandidate,
      topology: { chain: compiled.chain, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
      missingInputs: ratedOverall === "unknown" ? latestFindings().filter((item) => item.verdict === "unknown") : compiled.missing,
      calculationLimits: compiled.limits, integrationProposals: compiled.proposals,
    });
  }
  const engineMetrics = engine.bands.flatMap((result) => metricsFromEngine(result, result.band));
  if (!receiverFill.ok) {
    assumptions.push("Path/time/conditions envelope withheld because catalog receiver fields are incomplete or unknown");
  }

  return immutable({
    status: "compiled",
    revisionId: revision.id,
    routeId: route.id,
    purpose: route.purpose,
    structuralCandidate,
    compatibility: { overall: ratedOverall, hops: hopCompat, findings: latestFindings() },
    exclusiveSelections: exclusives.selections,
    topology: { chain: compiled.chain, members: compiled.members, cableRuns: compiled.cableRuns, documentedLayers: layers },
    gearCapability: { radio: gearRadio, antenna: gearAntenna, catalogReceiver, bibliography },
    modeledRoute: { state: "computed", reasons: [], engine, envelope },
    measurements,
    pathTimeConditions: {
      bands: bandId, targetBearingDeg: request.options?.targetBearingDeg ?? null,
      takeoffAngleDeg: request.options?.takeoffAngleDeg ?? null, mode,
      localNoiseFloorDbm: request.options?.localNoiseFloorDbm ?? null,
    },
    metrics: engineMetrics,
    assumptions,
    missingInputs: compiled.missing,
    calculationLimits: compiled.limits,
    integrationProposals: compiled.proposals,
    diagnostics: latestFindings(),
  });
}
/** W07 selected-route compiler contracts. No storage, UI, hardware or engine physics. */
import type {
  CatalogReceiverSelection,
} from "@/lib/station/workbench/equipment/services";
import type {
  DeepReadonly,
  Evidence,
  Quantity,
  RouteIntent,
} from "@/lib/station/workbench/contracts";
import type {
  ChainPerformanceResult,
  StationCalculationOptions,
  StationFeatureEnvelope,
} from "@/lib/station/stationChainEngine";
import type { StationChain } from "@/types/stationChain";

export type CompatibilityVerdict = "compatible" | "contradicted" | "unknown";
export type CompilationStatus = "compiled" | "incomplete" | "unsupported" | "invalid";
export type MemberRole = "rf-path" | "unwired-member" | "documented-layer";
export type QuantityProvenance =
  | "instance-field"
  | "instance-fact"
  | "model-field"
  | "model-specification"
  | "measurement"
  | "catalog-factory"
  | "catalog-tested"
  | "cable-run"
  | "revision-settings"
  | "engine-modeled"
  | "caller-option";

export type RouteCompileOptions = StationCalculationOptions;

export interface RouteCompileRequest {
  revisionId: string;
  routeId: string;
  options?: RouteCompileOptions;
}

export interface CompatibilityFinding {
  verdict: CompatibilityVerdict;
  code: string;
  message: string;
  path: (string | number)[];
  instanceId?: string;
  portId?: string;
  connectionId?: string;
}

export interface HopCompatibility {
  hopIndex: number;
  verdict: CompatibilityVerdict;
  findings: CompatibilityFinding[];
}

export interface ExclusiveSelection {
  instanceId: string;
  groupId: string;
  selectedPathId: string;
  commonPortId: string;
  throwPortId: string;
}

export interface ReportedQuantity {
  name: string;
  quantity: Quantity;
  unit: string;
  provenance: QuantityProvenance;
  sourceId?: string;
}

export interface PathMember {
  instanceId: string;
  role: MemberRole;
  signal?: string;
}

export interface CompiledCableRun {
  id: string;
  baseCableInstanceId: string | null;
  lengthMeters: Quantity;
  inlineInstanceIds: string[];
  /** Engine feedline length uses this run's base cable only; pigtail lengths stay off that input. */
  countedInEngine: boolean;
}

export interface DocumentedLayer {
  connectionId: string;
  signal: string;
  reason: string;
}

export interface IntegrationProposal {
  code: string;
  message: string;
  owner: "coordinator";
}

export interface RouteCompilation {
  status: CompilationStatus;
  revisionId: string;
  routeId: string;
  purpose: RouteIntent["purpose"] | null;
  /** W03 candidate is structural only; this flag never implies engine support. */
  structuralCandidate: boolean;
  compatibility: {
    overall: CompatibilityVerdict | "not-evaluated";
    hops: HopCompatibility[];
    findings: CompatibilityFinding[];
  };
  exclusiveSelections: ExclusiveSelection[];
  topology: {
    chain: StationChain | null;
    members: PathMember[];
    cableRuns: CompiledCableRun[];
    documentedLayers: DocumentedLayer[];
  };
  gearCapability: {
    radio: Record<string, Quantity>;
    antenna: Record<string, Quantity>;
    catalogReceiver: DeepReadonly<CatalogReceiverSelection> | null;
    bibliography: Extract<Evidence, { kind: "report" }>[];
  };
  modeledRoute: {
    state: "computed" | "withheld";
    reasons: string[];
    engine: ChainPerformanceResult | null;
    envelope: StationFeatureEnvelope | null;
  };
  measurements: Extract<Evidence, { kind: "measurement" }>[];
  pathTimeConditions: {
    bands: string[] | null;
    targetBearingDeg: number | null;
    takeoffAngleDeg: number | null;
    mode: string | null;
    localNoiseFloorDbm: number | null;
  };
  metrics: ReportedQuantity[];
  assumptions: string[];
  missingInputs: CompatibilityFinding[];
  calculationLimits: CompatibilityFinding[];
  integrationProposals: IntegrationProposal[];
  diagnostics: CompatibilityFinding[];
}

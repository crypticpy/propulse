import type {
  AdapterComponent,
  BalunComponent,
  ChokeComponent,
  ConnectorType,
  FerriteComponent,
  InlineComponent,
  InlineComponentType,
  PigtailComponent,
} from "@/types/shack";

/** Distributed Omit for discriminated unions */
type OmitFromUnion<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export interface ComponentForm {
  name: string;
  componentType: InlineComponentType;
  insertionLossDb: string;
  notes: string;
  fromConnector: ConnectorType;
  toConnector: ConnectorType;
  lengthInches: string;
  chokeMaterial: "ferrite_core" | "air_wound" | "snap_on";
  chokeTurns: string;
  chokeImpedanceOhms: string;
  chokeFrequencyRangeMHz: string;
  balunRatio: "1:1" | "4:1" | "6:1" | "9:1";
  balunType: "current" | "voltage";
  balunPowerRatingWatts: string;
  ferriteType: FerriteComponent["ferriteType"];
  ferriteMaterial: string;
  ferriteCount: string;
  ferriteTurns: string;
  ferriteImpedanceOhms: string;
}

export function createDefaultInlineComponentForm(): ComponentForm {
  return {
    name: "",
    componentType: "adapter",
    insertionLossDb: "0.1",
    notes: "",
    fromConnector: "pl259",
    toConnector: "n_type",
    lengthInches: "12",
    chokeMaterial: "ferrite_core",
    chokeTurns: "6",
    chokeImpedanceOhms: "",
    chokeFrequencyRangeMHz: "1.8-30",
    balunRatio: "1:1",
    balunType: "current",
    balunPowerRatingWatts: "",
    ferriteType: "snap_on",
    ferriteMaterial: "31",
    ferriteCount: "1",
    ferriteTurns: "1",
    ferriteImpedanceOhms: "",
  };
}

export function inlineComponentFormFromComponent(
  component: InlineComponent,
): ComponentForm {
  const base: ComponentForm = {
    ...createDefaultInlineComponentForm(),
    name: component.name,
    componentType: component.componentType,
    insertionLossDb: String(component.insertionLossDb),
    notes: component.notes ?? "",
  };

  switch (component.componentType) {
    case "adapter": {
      const adapter = component as AdapterComponent;
      base.fromConnector = adapter.connectorFrom;
      base.toConnector = adapter.connectorTo;
      break;
    }
    case "pigtail": {
      const pigtail = component as PigtailComponent;
      base.fromConnector = pigtail.connectorFrom;
      base.toConnector = pigtail.connectorTo;
      base.lengthInches = String(pigtail.lengthInches);
      break;
    }
    case "choke": {
      const choke = component as ChokeComponent;
      base.chokeMaterial =
        choke.chokeType === "common_mode"
          ? "ferrite_core"
          : choke.chokeType === "line_isolator"
            ? "air_wound"
            : "snap_on";
      base.chokeTurns = choke.turns !== undefined ? String(choke.turns) : "";
      base.chokeImpedanceOhms =
        choke.impedance !== undefined ? String(choke.impedance) : "";
      base.chokeFrequencyRangeMHz = choke.bands?.join(", ") ?? "";
      break;
    }
    case "balun": {
      const balun = component as BalunComponent;
      const baseRatio = balun.ratio.replace(/_current$/, "");
      if (
        baseRatio === "1:1" ||
        baseRatio === "4:1" ||
        baseRatio === "6:1" ||
        baseRatio === "9:1"
      ) {
        base.balunRatio = baseRatio;
      }
      base.balunType = balun.ratio.includes("current") ? "current" : "voltage";
      base.balunPowerRatingWatts =
        balun.maxPowerWatts !== undefined ? String(balun.maxPowerWatts) : "";
      break;
    }
    case "ferrite": {
      const ferrite = component as FerriteComponent;
      base.ferriteType = ferrite.ferriteType;
      base.ferriteMaterial = ferrite.material ?? "";
      base.ferriteCount = String(ferrite.count);
      base.ferriteTurns =
        ferrite.turns !== undefined ? String(ferrite.turns) : "";
      base.ferriteImpedanceOhms =
        ferrite.impedanceOhms !== undefined
          ? String(ferrite.impedanceOhms)
          : "";
      break;
    }
  }

  return base;
}

function parseOptionalInt(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalFloat(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBandList(value: string): string[] | undefined {
  const bands = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return bands.length > 0 ? bands : undefined;
}

/** Build the store-compatible payload from form state */
export function buildInlineComponentPayload(
  form: ComponentForm,
): OmitFromUnion<InlineComponent, "id" | "addedAt"> {
  const base = {
    name: form.name.trim(),
    insertionLossDb: Number.parseFloat(form.insertionLossDb) || 0,
    notes: form.notes.trim() || undefined,
  };

  switch (form.componentType) {
    case "adapter":
      return {
        ...base,
        componentType: "adapter" as const,
        connectorFrom: form.fromConnector,
        connectorTo: form.toConnector,
      } as Omit<AdapterComponent, "id" | "addedAt">;
    case "pigtail":
      return {
        ...base,
        componentType: "pigtail" as const,
        connectorFrom: form.fromConnector,
        connectorTo: form.toConnector,
        lengthInches: Number.parseFloat(form.lengthInches) || 0,
      } as Omit<PigtailComponent, "id" | "addedAt">;
    case "choke": {
      const chokeTypeMap: Record<string, ChokeComponent["chokeType"]> = {
        ferrite_core: "common_mode",
        air_wound: "line_isolator",
        snap_on: "feed_through",
      };
      return {
        ...base,
        componentType: "choke" as const,
        chokeType: chokeTypeMap[form.chokeMaterial] ?? "common_mode",
        impedance: parseOptionalFloat(form.chokeImpedanceOhms),
        turns: parseOptionalInt(form.chokeTurns),
        bands: parseBandList(form.chokeFrequencyRangeMHz),
      } as Omit<ChokeComponent, "id" | "addedAt">;
    }
    case "balun": {
      const isCurrent = form.balunType === "current";
      const storeRatio =
        isCurrent &&
        (form.balunRatio === "1:1" ||
          form.balunRatio === "4:1" ||
          form.balunRatio === "6:1")
          ? (`${form.balunRatio}_current` as BalunComponent["ratio"])
          : (form.balunRatio as BalunComponent["ratio"]);

      return {
        ...base,
        componentType: "balun" as const,
        ratio: storeRatio,
        maxPowerWatts: parseOptionalFloat(form.balunPowerRatingWatts),
      } as Omit<BalunComponent, "id" | "addedAt">;
    }
    case "ferrite":
      return {
        ...base,
        componentType: "ferrite" as const,
        ferriteType: form.ferriteType,
        material: (form.ferriteMaterial.trim() || undefined) as
          | FerriteComponent["material"]
          | undefined,
        count: Math.max(1, parseOptionalInt(form.ferriteCount) ?? 1),
        turns: parseOptionalInt(form.ferriteTurns),
        impedanceOhms: parseOptionalFloat(form.ferriteImpedanceOhms),
      } as Omit<FerriteComponent, "id" | "addedAt">;
  }
}

/** Round-trip helper for tests: apply a name-only edit and rebuild payload. */
export function buildInlineComponentPayloadAfterNameEdit(
  component: InlineComponent,
  nextName: string,
): OmitFromUnion<InlineComponent, "id" | "addedAt"> {
  const form = inlineComponentFormFromComponent(component);
  return buildInlineComponentPayload({ ...form, name: nextName });
}

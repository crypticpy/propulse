import { createContext, useContext } from "react";

export interface EquipmentUsedInRequest {
  instanceId: string;
  label: string;
}

export interface EquipmentUsedInContextValue {
  openUsedIn: (request: EquipmentUsedInRequest) => void;
}

const EquipmentUsedInContext = createContext<EquipmentUsedInContextValue | null>(null);

export function useEquipmentUsedIn(): EquipmentUsedInContextValue {
  const value = useContext(EquipmentUsedInContext);
  if (!value) {
    throw new Error("useEquipmentUsedIn requires EquipmentUsedInHost");
  }
  return value;
}

export { EquipmentUsedInContext };

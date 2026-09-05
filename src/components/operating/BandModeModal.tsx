import { lazy, Suspense } from "react";
import type { BandModeModalProps } from "./BandModeModalContent";

const Content = lazy(() => import("./BandModeModalContent").then((module) => ({ default: module.BandModeModal })));

/** The shared shell does not load band analysis until the operator opens it. */
export function BandModeModal(props: BandModeModalProps) {
  if (!props.isOpen) return null;
  return <Suspense fallback={<p role="status" className="fixed bottom-4 right-4 z-50 rounded-lg bg-panel p-3 text-sm text-white">Loading band controls…</p>}><Content {...props} /></Suspense>;
}

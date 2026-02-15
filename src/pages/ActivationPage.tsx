/**
 * ActivationPage — POTA/SOTA activation workflow
 *
 * Route: /activation
 * Wraps ActivationPanel in a full-page layout with header.
 */

import { ActivationPanel } from "@/components/activation/ActivationPanel";

export function ActivationPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          Park & Summit Activation
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          POTA and SOTA activation tracker with quick logging and ADIF export
        </p>
      </div>
      <ActivationPanel />
    </div>
  );
}

export default ActivationPage;

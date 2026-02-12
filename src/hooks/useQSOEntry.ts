/**
 * Convenience hook for the QSO entry form.
 *
 * Provides form state and entry actions.
 * Use in QSOEntryForm and QSOEntryCompact components.
 */

import { useQSOStore } from "@/stores/qsoStore";

export function useQSOEntry() {
  const form = useQSOStore((s) => s.form);
  const formDefaults = useQSOStore((s) => s.formDefaults);
  const lookupResult = useQSOStore((s) => s.lookupResult);
  const lookupLoading = useQSOStore((s) => s.lookupLoading);
  const lookupError = useQSOStore((s) => s.lookupError);
  const dupeInfo = useQSOStore((s) => s.dupeInfo);

  const setField = useQSOStore((s) => s.setField);
  const resetForm = useQSOStore((s) => s.resetForm);
  const setFormDefaults = useQSOStore((s) => s.setFormDefaults);
  const applyLookupToForm = useQSOStore((s) => s.applyLookupToForm);
  const logQSO = useQSOStore((s) => s.logQSO);
  const quickLog = useQSOStore((s) => s.quickLog);
  const lookupCallsign = useQSOStore((s) => s.lookupCallsign);
  const clearLookup = useQSOStore((s) => s.clearLookup);
  const checkDupe = useQSOStore((s) => s.checkDupe);

  return {
    form,
    formDefaults,
    lookupResult,
    lookupLoading,
    lookupError,
    dupeInfo,
    setField,
    resetForm,
    setFormDefaults,
    applyLookupToForm,
    logQSO,
    quickLog,
    lookupCallsign,
    clearLookup,
    checkDupe,
  };
}

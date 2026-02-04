/**
 * ContestEditLastModal - Modal for editing the most recent QSO
 * Provides fast recovery from typos and errors in contest logging
 */

import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";
import { getDefaultRST } from "@/types/contest";

export interface ContestEditLastModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** The QSO to edit (should be the last logged QSO) */
  qso: ContestQSO | null;
}

/**
 * ContestEditLastModal component
 * Allows quick editing of the most recent QSO
 */
export function ContestEditLastModal({
  isOpen,
  onClose,
  qso,
}: ContestEditLastModalProps) {
  const editQSO = useContestStore((s) => s.editQSO);

  // Form state
  const [callsign, setCallsign] = useState("");
  const [exchangeReceived, setExchangeReceived] = useState("");
  const [rstReceived, setRstReceived] = useState("");
  const [band, setBand] = useState("");
  const [mode, setMode] = useState("");

  // Populate form when QSO changes
  useEffect(() => {
    if (qso) {
      setCallsign(qso.callsign);
      setExchangeReceived(qso.exchangeReceived);
      setRstReceived(qso.rstReceived);
      setBand(qso.band);
      setMode(qso.mode);
    }
  }, [qso]);

  // Update RST default when mode changes
  useEffect(() => {
    if (mode && !rstReceived) {
      setRstReceived(getDefaultRST(mode));
    }
  }, [mode, rstReceived]);

  // Handle save
  const handleSave = useCallback(() => {
    if (!qso) {
      return;
    }

    editQSO(qso.id, {
      callsign: callsign.toUpperCase().trim(),
      exchangeReceived: exchangeReceived.toUpperCase().trim(),
      rstReceived: rstReceived.trim(),
      band,
      mode,
    });

    onClose();
  }, [
    qso,
    callsign,
    exchangeReceived,
    rstReceived,
    band,
    mode,
    editQSO,
    onClose,
  ]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [handleSave, onClose],
  );

  if (!isOpen || !qso) {
    return null;
  }

  const inputClass =
    "w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30 font-mono";

  const selectClass =
    "w-full px-2 py-2 bg-deep-space border border-white/10 rounded-lg text-white focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30 text-sm";

  const labelClass = "block text-xs font-medium text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <Card
        className="relative z-10 w-full max-w-md p-5"
        animate
        onKeyDown={handleKeyDown}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-orbitron font-bold text-white">
              Edit QSO
            </h3>
            <span className="text-xs text-gray-400">
              #{qso.serialSent} • {new Date(qso.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* Form */}
          <div className="grid grid-cols-2 gap-3">
            {/* Callsign */}
            <div className="col-span-2">
              <label htmlFor="edit-callsign" className={labelClass}>
                Callsign
              </label>
              <input
                type="text"
                id="edit-callsign"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                className={`${inputClass} text-lg`}
                autoFocus
              />
            </div>

            {/* Exchange Received */}
            <div className="col-span-2">
              <label htmlFor="edit-exchange" className={labelClass}>
                Exchange Received
              </label>
              <input
                type="text"
                id="edit-exchange"
                value={exchangeReceived}
                onChange={(e) =>
                  setExchangeReceived(e.target.value.toUpperCase())
                }
                className={inputClass}
              />
            </div>

            {/* RST Received */}
            <div>
              <label htmlFor="edit-rst" className={labelClass}>
                RST Received
              </label>
              <input
                type="text"
                id="edit-rst"
                value={rstReceived}
                onChange={(e) => setRstReceived(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Band */}
            <div>
              <label htmlFor="edit-band" className={labelClass}>
                Band
              </label>
              <select
                id="edit-band"
                value={band}
                onChange={(e) => setBand(e.target.value)}
                className={selectClass}
              >
                <option value="160m">160m</option>
                <option value="80m">80m</option>
                <option value="40m">40m</option>
                <option value="20m">20m</option>
                <option value="15m">15m</option>
                <option value="10m">10m</option>
                <option value="6m">6m</option>
                <option value="2m">2m</option>
              </select>
            </div>

            {/* Mode */}
            <div className="col-span-2">
              <label htmlFor="edit-mode" className={labelClass}>
                Mode
              </label>
              <select
                id="edit-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className={selectClass}
              >
                <option value="CW">CW</option>
                <option value="SSB">SSB</option>
                <option value="RTTY">RTTY</option>
                <option value="FT8">FT8</option>
                <option value="FT4">FT4</option>
              </select>
            </div>
          </div>

          {/* Keyboard hints */}
          <div className="text-xs text-gray-500 flex items-center gap-4">
            <span>
              <kbd className="px-1 py-0.5 bg-white/10 rounded">Enter</kbd> Save
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-white/10 rounded">Esc</kbd> Cancel
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg
                         text-gray-300 hover:text-white hover:border-white/20
                         transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-plasma-orange text-deep-space rounded-lg
                         hover:bg-plasma-orange/90 shadow-[0_0_15px_rgba(255,170,0,0.3)]
                         transition-colors font-bold"
            >
              Save Changes
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default ContestEditLastModal;

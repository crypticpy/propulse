/**
 * ContestConfigModal - Modal to configure and start a contest session
 */

import { useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui";
import {
  CONTEST_DATABASE,
  getContestById,
  getContestsByGroup,
} from "@/lib/data/contests";
import type { ContestCategories } from "@/stores/contestStore";

export interface ContestConfig {
  contestId: string;
  myExchange: string;
  categories: ContestCategories;
}

export interface ContestConfigModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when contest is started with configuration */
  onStart: (config: ContestConfig) => void;
}

export function ContestConfigModal({
  isOpen,
  onClose,
  onStart,
}: ContestConfigModalProps) {
  // Form state
  const [selectedContestId, setSelectedContestId] = useState(
    CONTEST_DATABASE[0]?.id || "",
  );
  const [myExchange, setMyExchange] = useState("");
  const [operator, setOperator] =
    useState<ContestCategories["operator"]>("single-op");
  const [power, setPower] = useState<ContestCategories["power"]>("low");
  const [mode, setMode] = useState<ContestCategories["mode"]>("cw");
  const [band, setBand] = useState<ContestCategories["band"]>("all");

  // Get grouped contests for the dropdown
  const contestsByGroup = useMemo(() => getContestsByGroup(), []);

  // Get selected contest details
  const selectedContest = useMemo(
    () => getContestById(selectedContestId),
    [selectedContestId],
  );

  // Handle contest selection change
  const handleContestChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newContestId = e.target.value;
      setSelectedContestId(newContestId);

      // Reset categories to first available option
      const contest = getContestById(newContestId);
      if (contest) {
        if (contest.categories.operator[0]) {
          setOperator(
            contest.categories.operator[0] as ContestCategories["operator"],
          );
        }
        if (contest.categories.power[0]) {
          setPower(contest.categories.power[0] as ContestCategories["power"]);
        }
        if (contest.categories.mode[0]) {
          setMode(contest.categories.mode[0] as ContestCategories["mode"]);
        }
        if (contest.categories.band[0]) {
          setBand(contest.categories.band[0] as ContestCategories["band"]);
        }
      }
    },
    [],
  );

  // Handle form submission
  const handleStart = useCallback(() => {
    if (!selectedContestId || !myExchange.trim()) {
      return;
    }

    const config: ContestConfig = {
      contestId: selectedContestId,
      myExchange: myExchange.trim().toUpperCase(),
      categories: {
        operator,
        power,
        mode,
        band,
      },
    };

    onStart(config);
    onClose();
  }, [
    selectedContestId,
    myExchange,
    operator,
    power,
    mode,
    band,
    onStart,
    onClose,
  ]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const inputClass =
    "w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30";

  const selectClass =
    "w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30";

  const labelClass = "block text-sm font-medium text-gray-300 mb-2";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <Card
        className="relative z-10 w-full max-w-lg p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            Start Contest
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Contest Selection */}
        <div className="mb-6">
          <label htmlFor="contest-select" className={labelClass}>
            Contest
          </label>
          <select
            id="contest-select"
            value={selectedContestId}
            onChange={handleContestChange}
            className={selectClass}
          >
            {Object.entries(contestsByGroup).map(([sponsor, contests]) => (
              <optgroup key={sponsor} label={sponsor}>
                {contests.map((contest) => (
                  <option key={contest.id} value={contest.id}>
                    {contest.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Contest info */}
          {selectedContest && (
            <div className="mt-2 p-3 bg-nebula-blue rounded-lg border border-white/10">
              <p className="text-sm text-gray-300">
                {selectedContest.description}
              </p>
              <div className="mt-2 flex gap-4 text-xs text-gray-400">
                <span>Duration: {selectedContest.durationHours}h</span>
                <span>Multipliers: {selectedContest.multiplierType}</span>
              </div>
            </div>
          )}
        </div>

        {/* My Exchange */}
        <div className="mb-6">
          <label htmlFor="my-exchange" className={labelClass}>
            My Exchange
          </label>
          <input
            type="text"
            id="my-exchange"
            value={myExchange}
            onChange={(e) => setMyExchange(e.target.value.toUpperCase())}
            placeholder={
              selectedContest?.exchange.sent
                .replace("{rst}", "599")
                .replace("{serial}", "#")
                .replace("{state}", "CA")
                .replace("{zone}", "05")
                .replace("{section}", "ORG")
                .replace("{class}", "2A")
                .replace("{precedence}", "A")
                .replace("{check}", "72") || "599 CA"
            }
            className={`${inputClass} font-mono`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Exchange format:{" "}
            {selectedContest?.exchange.sent || "RST + Exchange"}
          </p>
        </div>

        {/* Category Selection */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Categories</h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Operator Category */}
            <div>
              <label
                htmlFor="cat-operator"
                className="text-xs text-gray-400 mb-1 block"
              >
                Operator
              </label>
              <select
                id="cat-operator"
                value={operator}
                onChange={(e) =>
                  setOperator(e.target.value as ContestCategories["operator"])
                }
                className={selectClass}
              >
                {(
                  selectedContest?.categories.operator || [
                    "single-op",
                    "multi-op",
                  ]
                ).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.replace("-", " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Band Category */}
            <div>
              <label
                htmlFor="cat-band"
                className="text-xs text-gray-400 mb-1 block"
              >
                Band
              </label>
              <select
                id="cat-band"
                value={band}
                onChange={(e) =>
                  setBand(e.target.value as ContestCategories["band"])
                }
                className={selectClass}
              >
                {(selectedContest?.categories.band || ["all", "single"]).map(
                  (opt) => (
                    <option key={opt} value={opt}>
                      {opt.toUpperCase()}
                    </option>
                  ),
                )}
              </select>
            </div>

            {/* Power Category */}
            <div>
              <label
                htmlFor="cat-power"
                className="text-xs text-gray-400 mb-1 block"
              >
                Power
              </label>
              <select
                id="cat-power"
                value={power}
                onChange={(e) =>
                  setPower(e.target.value as ContestCategories["power"])
                }
                className={selectClass}
              >
                {(
                  selectedContest?.categories.power || ["high", "low", "qrp"]
                ).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode Category */}
            <div>
              <label
                htmlFor="cat-mode"
                className="text-xs text-gray-400 mb-1 block"
              >
                Mode
              </label>
              <select
                id="cat-mode"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as ContestCategories["mode"])
                }
                className={selectClass}
              >
                {(
                  selectedContest?.categories.mode || ["cw", "ssb", "mixed"]
                ).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={!selectedContestId || !myExchange.trim()}
          className="w-full px-4 py-3 bg-plasma-orange text-deep-space font-bold rounded-lg
                     hover:bg-plasma-orange/90 shadow-[0_0_20px_rgba(255,170,0,0.3)]
                     transition-all duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Contest
        </button>

        {/* Footer note */}
        <p className="mt-4 text-xs text-gray-500 text-center">
          Contest session will be saved locally. You can export Cabrillo logs
          after the contest.
        </p>
      </Card>
    </div>
  );
}

export default ContestConfigModal;

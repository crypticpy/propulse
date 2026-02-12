/**
 * VoIPNodeList -- Displays EchoLink, AllStar, and IRLP VoIP access nodes
 * with copy-to-clipboard functionality.
 *
 * Renders a compact section listing each available node number in monospace
 * font with a clipboard copy button. The button provides brief visual
 * feedback (checkmark icon for 1.5s) after copying. Returns null if no
 * nodes are provided.
 */

import { useState, useCallback } from "react";

interface VoIPNodeListProps {
  echolinkNode?: string;
  allstarNode?: string;
  irlpNode?: string;
}

interface NodeRowProps {
  label: string;
  node: string;
}

function NodeRow({ label, node }: NodeRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(node);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [node]);

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-gray-400 shrink-0">{label}</span>
        <span className="text-xs font-mono text-gray-200 truncate">{node}</span>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Copied!" : `Copy ${label} node`}
        className="shrink-0 p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60"
      >
        {copied ? (
          /* Checkmark icon */
          <svg
            className="w-3.5 h-3.5 text-signal-green"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
        ) : (
          /* Clipboard icon */
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

export function VoIPNodeList({
  echolinkNode,
  allstarNode,
  irlpNode,
}: VoIPNodeListProps) {
  const hasAny =
    (echolinkNode && echolinkNode.trim().length > 0) ||
    (allstarNode && allstarNode.trim().length > 0) ||
    (irlpNode && irlpNode.trim().length > 0);

  if (!hasAny) return null;

  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
        VoIP Access
      </h4>
      <div className="divide-y divide-white/5">
        {echolinkNode && echolinkNode.trim() && (
          <NodeRow label="EchoLink" node={echolinkNode} />
        )}
        {allstarNode && allstarNode.trim() && (
          <NodeRow label="AllStar" node={allstarNode} />
        )}
        {irlpNode && irlpNode.trim() && (
          <NodeRow label="IRLP" node={irlpNode} />
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";

/** Code block with copy-to-clipboard button */
export function CommandBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(children)
      .then(() => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [children]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="relative group">
      <pre className="text-xs md:text-sm bg-su-input border border-su-line/40 rounded-lg p-3 pr-10 overflow-x-auto text-su-text font-mono">
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-su-line/10 border border-su-line/40 text-su-muted hover:text-su-text hover:bg-su-line/20 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <svg
            className="w-3.5 h-3.5 text-signal-green"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

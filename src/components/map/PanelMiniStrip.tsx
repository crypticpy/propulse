import React from "react";

interface PanelMiniStripProps {
  side: "left" | "right";
  onExpand: () => void;
  onHide: () => void;
  children: React.ReactNode;
}

export function PanelMiniStrip({
  side,
  onExpand,
  onHide,
  children,
}: PanelMiniStripProps) {
  const isLeft = side === "left";

  return (
    <div
      className={[
        "w-10 flex-shrink-0 flex flex-col items-center justify-between",
        "bg-void-black/80 backdrop-blur-sm",
        "py-2 gap-3",
        "transition-all duration-200",
        "hover:bg-white/5",
        isLeft ? "border-r border-white/10" : "border-l border-white/10",
      ].join(" ")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onExpand();
      }}
      role="complementary"
    >
      {/* Top: expand chevron */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
        className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded"
        aria-label="Expand panel"
      >
        {isLeft ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 2.5L9.5 7L5 11.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 2.5L4.5 7L9 11.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Middle: panel-specific metrics */}
      <div
        className="flex-1 flex flex-col items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
      >
        {children}
      </div>

      {/* Bottom: close / hide button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onHide();
        }}
        className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-white/10 rounded"
        aria-label="Hide panel"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 2L10 10M10 2L2 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

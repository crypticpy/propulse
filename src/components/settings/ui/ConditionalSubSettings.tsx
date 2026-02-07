import { useRef, useEffect, useState } from "react";

export function ConditionalSubSettings({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(
    show ? undefined : 0,
  );
  const [overflow, setOverflow] = useState<"hidden" | "visible">(
    show ? "visible" : "hidden",
  );

  useEffect(() => {
    if (!contentRef.current) return;
    if (show) {
      // Start expanding: set to scrollHeight so the transition animates
      setOverflow("hidden");
      setHeight(contentRef.current.scrollHeight);
      // After transition completes (160ms > 150ms duration), switch to auto height
      // and allow overflow so content displays properly
      const timer = setTimeout(() => {
        setHeight(undefined);
        setOverflow("visible");
      }, 160);
      return () => clearTimeout(timer);
    } else {
      // Start collapsing: first set explicit height from current scrollHeight
      setOverflow("hidden");
      setHeight(contentRef.current.scrollHeight);
      // Then animate to 0 on next frame
      requestAnimationFrame(() => setHeight(0));
    }
  }, [show]);

  return (
    <div
      className="transition-[height] duration-150 ease-in-out"
      style={{
        height: height !== undefined ? `${height}px` : "auto",
        overflow,
      }}
    >
      <div
        ref={contentRef}
        className="pl-4 border-l-2 border-white/5 space-y-3 pt-2"
      >
        {children}
      </div>
    </div>
  );
}

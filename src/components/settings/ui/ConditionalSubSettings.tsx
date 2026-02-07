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

  useEffect(() => {
    if (!contentRef.current) return;
    if (show) {
      setHeight(contentRef.current.scrollHeight);
      const timer = setTimeout(() => setHeight(undefined), 150);
      return () => clearTimeout(timer);
    } else {
      setHeight(contentRef.current.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [show]);

  return (
    <div
      className="overflow-hidden transition-[height] duration-150 ease-in-out"
      style={{ height: height !== undefined ? `${height}px` : "auto" }}
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

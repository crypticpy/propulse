import type { ReactNode } from "react";

export function KeyValueList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="su-key-values">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Table({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <div
      className="su-table-scroll"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="su-table">
        <caption>{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export function Avatar({ name, src }: { name: string; src?: string }) {
  return (
    <span className="su-avatar">
      {src ? (
        <img src={src} alt={name} />
      ) : (
        <span aria-label={name}>
          {name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")}
        </span>
      )}
    </span>
  );
}

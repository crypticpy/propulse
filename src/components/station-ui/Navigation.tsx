import { useId, useRef, type ReactNode } from "react";

export function SectionNav({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; current?: boolean }[];
}) {
  return (
    <nav className="su-nav" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/** Automatic activation; native buttons plus arrow/Home/End roving focus. */
export function Tabs({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: {
    value: string;
    label: string;
    content: ReactNode;
    disabled?: boolean;
  }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.disabled);
  const selected = items.findIndex(
    (item) => item.value === value && !item.disabled,
  );
  const active = selected >= 0 ? selected : (enabled[0]?.index ?? -1);
  return (
    <div className="su-tabs">
      <div role="tablist" aria-label={label}>
        {items.map((item, index) => (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={index === active}
            disabled={item.disabled}
            tabIndex={index === active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                  event.key,
                ) ||
                !enabled.length
              )
                return;
              event.preventDefault();
              const current = enabled.findIndex(
                (entry) => entry.index === index,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? enabled.length - 1
                    : (current +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        enabled.length) %
                      enabled.length;
              onChange(enabled[next].item.value);
              refs.current[enabled[next].index]?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.value}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          hidden={index !== active}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

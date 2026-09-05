import {
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface HamClockTab {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface HamClockTabsProps {
  /** Accessible name for the tablist. */
  label: string;
  tabs: readonly HamClockTab[];
  /** Controlled active tab id. */
  active?: string;
  defaultActive?: string;
  onChange?: (id: string) => void;
}

/**
 * A tab strip built for a remote rather than a mouse: the arrow keys move
 * focus across tabs without switching content, so browsing the strip never
 * yanks the panel out from under whatever the operator was reading. Only a
 * click, Enter or Space commits the choice. Only the active tab's content is
 * mounted, and its panel is `overflow: hidden` — a tab whose content would
 * not fit gets split into another tab, it never grows a scrollbar.
 */
export function HamClockTabs({
  label,
  tabs,
  active,
  defaultActive,
  onChange,
}: HamClockTabsProps) {
  const baseId = useId();
  const [internalActive, setInternalActive] = useState(
    () => defaultActive ?? tabs.find((tab) => !tab.disabled)?.id ?? tabs[0]?.id,
  );
  const activeId = active ?? internalActive;
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const enabled = useMemo(() => tabs.filter((tab) => !tab.disabled), [tabs]);
  // Roving tab stop, tracked separately from the committed selection: while
  // the tablist has focus the *focused* tab is the tab stop (manual
  // activation lets the operator arrow past several tabs before committing
  // one), and it resets to the active tab once focus leaves the strip.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activeIsEnabled = enabled.some((tab) => tab.id === activeId);
  const fallbackActiveId = activeIsEnabled ? activeId : enabled[0]?.id;
  const tabStopId = focusedId ?? fallbackActiveId;

  function handleTablistBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setFocusedId(null);
    }
  }

  function commit(id: string) {
    onChange?.(id);
    if (active === undefined) setInternalActive(id);
  }

  function focusTab(id: string) {
    buttonRefs.current.get(id)?.focus();
  }

  function moveFocus(fromId: string, delta: number) {
    if (enabled.length === 0) return;
    const currentIndex = enabled.findIndex((tab) => tab.id === fromId);
    const from = currentIndex === -1 ? 0 : currentIndex;
    const next = enabled[(from + delta + enabled.length) % enabled.length];
    focusTab(next.id);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    tabId: string,
  ) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus(tabId, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus(tabId, -1);
        break;
      case "Home":
        event.preventDefault();
        if (enabled[0]) focusTab(enabled[0].id);
        break;
      case "End": {
        event.preventDefault();
        const last = enabled[enabled.length - 1];
        if (last) focusTab(last.id);
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        commit(tabId);
        break;
      default:
        break;
    }
  }

  const activeTab = tabs.find((tab) => tab.id === activeId);

  return (
    <div className="hcc-tabs">
      <div
        role="tablist"
        aria-label={label}
        className="hcc-tablist"
        onBlur={handleTablistBlur}
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeId;
          const tabButtonId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) buttonRefs.current.set(tab.id, el);
                else buttonRefs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={tabButtonId}
              aria-selected={selected}
              aria-controls={panelId}
              disabled={tab.disabled}
              tabIndex={tab.id === tabStopId ? 0 : -1}
              className="hcc-tab"
              onClick={() => commit(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
              onFocus={() => setFocusedId(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab && (
        <div
          key={activeTab.id}
          role="tabpanel"
          id={`${baseId}-panel-${activeTab.id}`}
          aria-labelledby={`${baseId}-tab-${activeTab.id}`}
          className="hcc-tabpanel"
        >
          {activeTab.content}
        </div>
      )}
    </div>
  );
}

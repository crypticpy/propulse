import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface HamClockSegmentedOption<T extends string> {
  value: T;
  label: string;
  detail?: string;
  disabled?: boolean;
  /** Rendered inside the button before the label, e.g. a theme swatch. */
  preview?: ReactNode;
}

export interface HamClockSegmentedProps<T extends string> {
  /** Accessible group name, also drawn as a small caps caption unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  options: readonly HamClockSegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

/**
 * A fixed choice as a row of big buttons, guide §9: a `<select>` needs a
 * precise click and hides the other choices, this is readable and clickable
 * from the couch. Wraps onto more than one line past six options; it never
 * scrolls. Selection uses roving tabindex — only the chosen button is a tab
 * stop, and the arrow keys both move the selection and move focus with it.
 */
export function HamClockSegmented<T extends string>({
  label,
  hideLabel = false,
  options,
  value,
  onChange,
}: HamClockSegmentedProps<T>) {
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
  const enabled = options.filter((option) => !option.disabled);
  // If `value` matches no option, or matches a disabled one, the roving tab
  // stop still has to land somewhere reachable: the first enabled option.
  const selectedIsEnabled = enabled.some((option) => option.value === value);
  const tabStopValue = selectedIsEnabled ? value : enabled[0]?.value;

  function focusValue(target: T) {
    buttonRefs.current.get(target)?.focus();
  }

  function moveSelection(delta: number) {
    if (enabled.length === 0) return;
    const currentIndex = enabled.findIndex((option) => option.value === value);
    const from = currentIndex === -1 ? 0 : currentIndex;
    const next = enabled[(from + delta + enabled.length) % enabled.length];
    onChange(next.value);
    focusValue(next.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveSelection(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveSelection(-1);
        break;
      case "Home":
        event.preventDefault();
        if (enabled[0]) {
          onChange(enabled[0].value);
          focusValue(enabled[0].value);
        }
        break;
      case "End": {
        event.preventDefault();
        const last = enabled[enabled.length - 1];
        if (last) {
          onChange(last.value);
          focusValue(last.value);
        }
        break;
      }
      default:
        break;
    }
  }

  return (
    <div className="hcc-seg-wrap">
      {!hideLabel && <p className="hcc-seg-label">{label}</p>}
      <div role="radiogroup" aria-label={label} className="hcc-seg">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                if (el) buttonRefs.current.set(option.value, el);
                else buttonRefs.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled}
              tabIndex={option.value === tabStopValue ? 0 : -1}
              className="hcc-seg-btn"
              onClick={() => onChange(option.value)}
              onKeyDown={handleKeyDown}
            >
              {option.preview && (
                <span className="hcc-seg-btn-preview" aria-hidden="true">
                  {option.preview}
                </span>
              )}
              <span className="hcc-seg-btn-label">{option.label}</span>
              {option.detail && (
                <span className="hcc-seg-btn-detail">{option.detail}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

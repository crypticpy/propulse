/**
 * HelpShortcutTable — Renders keyboard shortcuts with styled <kbd> elements.
 *
 * Mobile: slightly increased vertical spacing for better touch readability.
 */

export interface Shortcut {
  key: string;
  action: string;
}

interface HelpShortcutTableProps {
  shortcuts: Shortcut[];
}

export function HelpShortcutTable({ shortcuts }: HelpShortcutTableProps) {
  return (
    <div className="my-3 space-y-1.5">
      {shortcuts.map((shortcut, i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-2 sm:py-1.5 border-b border-su-line/20 last:border-b-0"
        >
          <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md bg-su-line/20 border border-su-line/40 text-xs font-mono font-medium text-su-muted shadow-[0_1px_0_0_rgba(255,255,255,0.05)] flex-shrink-0">
            {shortcut.key}
          </kbd>
          <span className="text-sm text-su-muted">{shortcut.action}</span>
        </div>
      ))}
    </div>
  );
}

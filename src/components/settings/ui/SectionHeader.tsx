export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-su-muted uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

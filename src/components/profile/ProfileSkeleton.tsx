/**
 * ProfileSkeleton -- Skeleton loading states for the profile page.
 *
 * ProfileSkeleton: Full-page skeleton matching the desktop sidebar + content layout.
 * ProfileTabSkeleton: Generic tab content skeleton for lazy-loaded tab panels.
 */

// ---- Pulse block helpers ----------------------------------------------------

function PulseBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none rounded ${className}`}
    />
  );
}

// ---- ProfileSkeleton --------------------------------------------------------

export function ProfileSkeleton() {
  return (
    <div className="flex gap-8 max-w-[1080px] mx-auto px-6 py-6">
      {/* Sidebar card skeleton */}
      <div className="w-[320px] flex-shrink-0">
        <div className="bg-panel/30 border border-su-line/20 rounded-2xl p-6 space-y-4">
          {/* Avatar circle */}
          <div className="flex justify-center">
            <PulseBlock className="w-20 h-20 rounded-full bg-su-line/20" />
          </div>

          {/* Callsign */}
          <PulseBlock className="h-6 w-32 mx-auto bg-su-line/20" />

          {/* Operator name */}
          <PulseBlock className="h-4 w-24 mx-auto bg-su-line/10" />

          {/* Grid locator */}
          <PulseBlock className="h-3 w-16 mx-auto bg-su-line/10" />

          {/* Completeness ring placeholder */}
          <div className="flex justify-center pt-2">
            <PulseBlock className="w-16 h-16 rounded-full bg-su-line/10" />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <PulseBlock className="h-8 flex-1 bg-su-line/10" />
            <PulseBlock className="h-8 flex-1 bg-su-line/10" />
          </div>
        </div>
      </div>

      {/* Content area skeleton */}
      <div className="flex-1 min-w-0 max-w-[720px]">
        {/* Tab bar skeleton */}
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <PulseBlock
              key={i}
              className={`h-9 rounded-lg ${i === 0 ? "w-24 bg-su-line/20" : "w-20 bg-su-line/10"}`}
            />
          ))}
        </div>

        {/* Tab content skeleton */}
        <ProfileTabSkeleton />
      </div>
    </div>
  );
}

// ---- ProfileTabSkeleton -----------------------------------------------------

export function ProfileTabSkeleton() {
  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="bg-panel/30 border border-su-line/20 rounded-2xl p-6 space-y-4">
        <PulseBlock className="h-4 w-40 bg-su-line/20" />
        <PulseBlock className="h-3 w-64 bg-su-line/10" />
        <PulseBlock className="h-3 w-48 bg-su-line/10" />
      </div>

      {/* Content cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-panel/30 border border-su-line/20 rounded-2xl p-6 space-y-3"
        >
          <PulseBlock className="h-4 w-32 bg-su-line/20" />
          <div className="space-y-2">
            <PulseBlock className="h-3 w-full bg-su-line/10" />
            <PulseBlock className="h-3 w-3/4 bg-su-line/10" />
            <PulseBlock className="h-3 w-5/6 bg-su-line/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

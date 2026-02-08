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
        <div className="bg-panel/30 border border-white/5 rounded-2xl p-6 space-y-4">
          {/* Avatar circle */}
          <div className="flex justify-center">
            <PulseBlock className="w-20 h-20 rounded-full bg-white/10" />
          </div>

          {/* Callsign */}
          <PulseBlock className="h-6 w-32 mx-auto bg-white/10" />

          {/* Operator name */}
          <PulseBlock className="h-4 w-24 mx-auto bg-white/5" />

          {/* Grid locator */}
          <PulseBlock className="h-3 w-16 mx-auto bg-white/5" />

          {/* Completeness ring placeholder */}
          <div className="flex justify-center pt-2">
            <PulseBlock className="w-16 h-16 rounded-full bg-white/5" />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <PulseBlock className="h-8 flex-1 bg-white/5" />
            <PulseBlock className="h-8 flex-1 bg-white/5" />
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
              className={`h-9 rounded-lg ${i === 0 ? "w-24 bg-white/10" : "w-20 bg-white/5"}`}
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
      <div className="bg-panel/30 border border-white/5 rounded-2xl p-6 space-y-4">
        <PulseBlock className="h-4 w-40 bg-white/10" />
        <PulseBlock className="h-3 w-64 bg-white/5" />
        <PulseBlock className="h-3 w-48 bg-white/5" />
      </div>

      {/* Content cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-panel/30 border border-white/5 rounded-2xl p-6 space-y-3"
        >
          <PulseBlock className="h-4 w-32 bg-white/10" />
          <div className="space-y-2">
            <PulseBlock className="h-3 w-full bg-white/5" />
            <PulseBlock className="h-3 w-3/4 bg-white/5" />
            <PulseBlock className="h-3 w-5/6 bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

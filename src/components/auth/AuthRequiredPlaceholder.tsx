/**
 * AuthRequiredPlaceholder — Empty-state component for sections gated behind auth.
 *
 * Renders a centered lock icon, contextual prompt, and "Sign In" button
 * that opens the auth modal.
 */

import { useAuthUIStore } from "@/stores/authUIStore";

interface AuthRequiredPlaceholderProps {
  prompt: string;
}

export function AuthRequiredPlaceholder({
  prompt,
}: AuthRequiredPlaceholderProps) {
  const openAuthModal = useAuthUIStore((s) => s.openAuthModal);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* Lock icon */}
      <svg
        className="w-10 h-10 text-gray-600 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>

      <p className="text-sm text-gray-400 mb-4 max-w-xs">{prompt}</p>

      <button
        onClick={() => openAuthModal(prompt)}
        className="px-5 py-2 text-sm font-medium rounded-lg bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30 hover:bg-plasma-orange/30 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
      >
        Sign In
      </button>
    </div>
  );
}

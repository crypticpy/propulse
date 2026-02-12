/**
 * NetCreatePage -- Auth-gated page for creating a new net listing.
 *
 * Renders the NetForm within a centered layout. On successful creation,
 * navigates to the new net's detail page.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useNetStore } from "@/stores/netStore";
import { AuthRequiredPlaceholder } from "@/components/auth/AuthRequiredPlaceholder";
import { NetForm } from "@/components/nets/NetForm";
import type { CreateNetInput } from "@/types/net";

export function NetCreatePage() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const createNet = useNetStore((s) => s.createNet);
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (data: CreateNetInput) => {
      setIsSubmitting(true);
      try {
        const newId = await createNet(data);
        if (newId) {
          navigate(`/nets/${newId}`);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [createNet, navigate],
  );

  // ── Auth gate ──────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <AuthRequiredPlaceholder prompt="Sign in to create a net" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="mb-8">
        <button
          type="button"
          onClick={() => navigate("/nets")}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-4"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Net Registry
        </button>
        <h1 className="text-2xl font-bold text-white">Create a New Net</h1>
        <p className="mt-1 text-sm text-gray-400">
          Set up a new net listing for your community. You'll be added as the
          owner.
        </p>
      </div>

      {/* Form */}
      <div className="bg-panel/30 border border-white/5 rounded-2xl p-6">
        <NetForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </div>
    </div>
  );
}

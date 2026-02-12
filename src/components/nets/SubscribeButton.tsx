/**
 * SubscribeButton -- Auth-gated subscribe/unsubscribe toggle for nets.
 *
 * Shows "Subscribe" when not subscribed. When subscribed, shows
 * "Subscribed" with a check mark that changes to "Unsubscribe" on hover
 * with red styling. Uses useRequireAuth() to gate the action.
 */

import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";

interface SubscribeButtonProps {
  netId: string;
  isSubscribed: boolean;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}

export function SubscribeButton({
  netId: _netId,
  isSubscribed,
  onSubscribe,
  onUnsubscribe,
}: SubscribeButtonProps) {
  const requireAuth = useRequireAuth();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    if (isSubscribed) {
      requireAuth(onUnsubscribe, "Sign in to manage your net subscriptions");
    } else {
      requireAuth(onSubscribe, "Sign in to subscribe to this net");
    }
  };

  // Determine display state
  const showUnsubscribe = isSubscribed && isHovered;

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
        showUnsubscribe
          ? "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
          : isSubscribed
            ? "bg-signal-green/15 text-signal-green border-signal-green/30"
            : "bg-plasma-orange/15 text-plasma-orange border-plasma-orange/30 hover:bg-plasma-orange/25"
      }`}
    >
      {showUnsubscribe
        ? "Unsubscribe"
        : isSubscribed
          ? "Subscribed \u2713"
          : "Subscribe"}
    </button>
  );
}

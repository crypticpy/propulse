/**
 * HelpCategoryCard — Landing page category card with icon.
 *
 * Standard: compact card in 4-col grid.
 * Featured: larger card with more prominent icon/description.
 *
 * Mobile: min 44px touch targets, active:scale pressed state,
 * reduced padding on mobile for featured variant.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface CategoryCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  featured?: boolean;
}

export function HelpCategoryCard({
  icon,
  title,
  description,
  href,
  featured = false,
}: CategoryCardProps) {
  if (featured) {
    return (
      <Link
        to={href}
        className="group block rounded-xl bg-gray-900/60 backdrop-blur-xl border border-white/[0.08] p-4 sm:p-5 min-h-[44px] transition-all duration-200 hover:border-white/15 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 active:scale-[0.98] active:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 motion-reduce:transition-none motion-reduce:hover:transform-none"
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-plasma-orange/10 flex items-center justify-center text-plasma-orange transition-colors group-hover:bg-plasma-orange/15"
            aria-hidden="true"
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-100 mb-1 group-hover:text-plasma-orange transition-colors">
              {title}
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={href}
      className="group block rounded-xl bg-gray-900/60 backdrop-blur-xl border border-white/[0.08] p-3.5 sm:p-4 min-h-[44px] transition-all duration-200 hover:border-white/15 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 active:scale-[0.98] active:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 motion-reduce:transition-none motion-reduce:hover:transform-none"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 w-5 h-5 text-gray-400 group-hover:text-plasma-orange transition-colors"
          aria-hidden="true"
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-200 group-hover:text-gray-100 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-gray-500 truncate">{description}</p>
        </div>
        <svg
          aria-hidden="true"
          className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-all duration-200 group-hover:translate-x-0.5 flex-shrink-0 motion-reduce:transition-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
      </div>
    </Link>
  );
}

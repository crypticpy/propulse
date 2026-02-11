/**
 * HelpBreadcrumbs — Navigation breadcrumbs for help article pages.
 *
 * Desktop: full breadcrumb trail.
 * Mobile: compact "back arrow" link instead of full trail when items > 2.
 * Touch target: at least 44px for back navigation.
 */

import { Link } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface HelpBreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function HelpBreadcrumbs({ items }: HelpBreadcrumbsProps) {
  const isMobile = useIsMobile();

  // Mobile compact: show back link to parent instead of full breadcrumb trail
  if (isMobile && items.length > 2) {
    // Find the last item with an href (the parent)
    const parent = [...items].reverse().find((item) => item.href);
    const parentLabel = parent?.label ?? "Help";
    const parentHref = parent?.href ?? "/help";

    return (
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link
          to={parentHref}
          className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-gray-400 hover:text-plasma-orange active:text-plasma-orange/80 transition-colors"
        >
          <svg
            aria-hidden="true"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          {parentLabel}
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm min-h-[44px] sm:min-h-0">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg
                  aria-hidden="true"
                  className="w-3 h-3 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
              )}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={
                    isLast ? "text-gray-200 font-medium" : "text-gray-500"
                  }
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="text-gray-400 hover:text-plasma-orange transition-colors duration-150"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

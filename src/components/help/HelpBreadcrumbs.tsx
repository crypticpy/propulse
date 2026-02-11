/**
 * HelpBreadcrumbs — Navigation breadcrumbs for help article pages.
 */

import { Link } from "react-router-dom";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface HelpBreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function HelpBreadcrumbs({ items }: HelpBreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg
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
                  className={
                    isLast ? "text-gray-200 font-medium" : "text-gray-500"
                  }
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="text-gray-400 hover:text-plasma-orange transition-colors"
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

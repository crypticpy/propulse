/**
 * HelpPage — Help Center landing page.
 *
 * Hero area with search, featured section (3 larger cards),
 * and all-topics 4-column grid of HelpCategoryCard.
 */

import { HelpSearch } from "@/components/help/HelpSearch";
import { HelpCategoryCard } from "@/components/help/HelpCategoryCard";
import { HELP_SECTIONS } from "@/components/help/helpData";

const featured = HELP_SECTIONS.filter((s) => s.featured);
const allTopics = HELP_SECTIONS.filter((s) => !s.featured);

export default function HelpPage() {
  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8">
      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-100 mb-2">
          Help Center
        </h1>
        <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
          Find guides, tips, and answers for every feature in Propulse.
        </p>
        <HelpSearch className="max-w-lg mx-auto" />
      </div>

      {/* ─── Featured Section ──────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Popular Topics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {featured.map((section) => (
            <HelpCategoryCard
              key={section.id}
              icon={section.icon("w-5 h-5")}
              title={section.title}
              description={section.description}
              href={`/help/${section.id}`}
              featured
            />
          ))}
        </div>
      </section>

      {/* ─── All Topics ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          All Topics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {allTopics.map((section) => (
            <HelpCategoryCard
              key={section.id}
              icon={section.icon("w-5 h-5")}
              title={section.title}
              description={section.description}
              href={`/help/${section.id}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

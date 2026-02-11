/**
 * HelpPage — Help Center landing page.
 *
 * Hero area with search, featured section (3 larger cards),
 * and all-topics 4-column grid of HelpCategoryCard.
 *
 * Mobile: 1-column on phones (<640px), 2 columns on tablets.
 * Featured cards stagger-animate on entrance.
 */

import { HelpSearch } from "@/components/help/HelpSearch";
import { HelpCategoryCard } from "@/components/help/HelpCategoryCard";
import { HELP_SECTIONS } from "@/components/help/helpData";

const featured = HELP_SECTIONS.filter((s) => s.featured);
const allTopics = HELP_SECTIONS.filter((s) => !s.featured);

const staggerDelays = ["delay-75", "delay-150", "delay-225"];

export default function HelpPage() {
  return (
    <main
      className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 sm:py-8"
      aria-labelledby="help-page-heading"
    >
      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <header className="text-center mb-8 sm:mb-10">
        <h1
          id="help-page-heading"
          className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-100 mb-2"
        >
          Help Center
        </h1>
        <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
          Find guides, tips, and answers for every feature in Propulse.
        </p>
        <HelpSearch className="max-w-lg mx-auto w-full" />
      </header>

      {/* ─── Featured Section ──────────────────────────────────────────── */}
      <section className="mb-8 sm:mb-10" aria-labelledby="help-popular-heading">
        <h2
          id="help-popular-heading"
          className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4"
        >
          Popular Topics
        </h2>
        {/* Subtle gradient backdrop for featured area */}
        <div className="relative rounded-2xl p-0.5">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-plasma-orange/[0.04] via-transparent to-plasma-orange/[0.02] pointer-events-none" />
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3">
            {featured.map((section, i) => (
              <div
                key={section.id}
                className={`animate-in fade-in slide-in-from-top-2 ${staggerDelays[i] ?? ""}`}
              >
                <HelpCategoryCard
                  icon={section.icon("w-5 h-5")}
                  title={section.title}
                  description={section.description}
                  href={`/help/${section.id}`}
                  featured
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── All Topics ────────────────────────────────────────────────── */}
      <section
        className="py-6 sm:py-0"
        aria-labelledby="help-all-topics-heading"
      >
        <h2
          id="help-all-topics-heading"
          className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4"
        >
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
    </main>
  );
}

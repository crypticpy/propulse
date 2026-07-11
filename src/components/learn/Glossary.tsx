import { useState, useMemo } from "react";
import { Card } from "@/components/ui";
import { GLOSSARY, type GlossaryTerm } from "@/lib/data/glossary";

interface TermCardProps {
  term: GlossaryTerm;
  isExpanded: boolean;
  onToggle: () => void;
  onTermClick: (term: string) => void;
}

function TermCard({ term, isExpanded, onToggle, onTermClick }: TermCardProps) {
  return (
    <div className="border-b border-white/10 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between py-3 text-left hover:bg-white/5 transition-colors rounded-lg px-3 -mx-3"
      >
        <div className="flex-1">
          <h3 className="font-semibold text-white">{term.term}</h3>
          <p className="text-sm text-gray-400 mt-0.5">{term.short}</p>
        </div>
        <span
          className={`text-gray-400 transition-transform mt-1 ${isExpanded ? "rotate-180" : ""}`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </span>
      </button>

      {isExpanded && (
        <div className="pb-4 pl-3 space-y-3">
          <p className="text-gray-300 text-sm leading-relaxed">{term.long}</p>

          {term.related && term.related.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Related:</span>
              {term.related.map((relatedTerm) => (
                <button
                  key={relatedTerm}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTermClick(relatedTerm);
                  }}
                  className="text-xs bg-plasma-orange/10 text-plasma-orange hover:bg-plasma-orange/20 px-2 py-0.5 rounded transition-colors"
                >
                  {relatedTerm}
                </button>
              ))}
            </div>
          )}

          {term.seeAlso && term.seeAlso.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">See also:</span>
              {term.seeAlso.map((section) => (
                <span
                  key={section}
                  className="text-xs bg-cosmic-cyan/10 text-cosmic-cyan px-2 py-0.5 rounded"
                >
                  {section}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Glossary - Searchable list of ham radio terms
 */
export function Glossary() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  // Filter terms based on search
  const filteredTerms = useMemo(() => {
    if (!searchQuery.trim()) {
      return GLOSSARY;
    }

    const query = searchQuery.toLowerCase();
    return GLOSSARY.filter(
      (term) =>
        term.term.toLowerCase().includes(query) ||
        term.short.toLowerCase().includes(query) ||
        term.long.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  // Group terms by first letter
  const groupedTerms = useMemo(() => {
    const groups: Record<string, GlossaryTerm[]> = {};

    for (const term of filteredTerms) {
      const letter = term.term[0].toUpperCase();
      if (!groups[letter]) {
        groups[letter] = [];
      }
      groups[letter].push(term);
    }

    return groups;
  }, [filteredTerms]);

  const letters = Object.keys(groupedTerms).sort();

  // Handle clicking a related term
  const handleTermClick = (term: string) => {
    // Find the term in the glossary
    const found = GLOSSARY.find(
      (t) => t.term.toLowerCase() === term.toLowerCase(),
    );
    if (found) {
      setSearchQuery("");
      setExpandedTerm(found.term);
      // Scroll to the term
      const element = document.getElementById(`term-${found.term}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Search box */}
      <Card>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search terms..."
            className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-plasma-orange/50 focus:border-plasma-orange/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {searchQuery && (
          <p className="mt-2 text-sm text-gray-400">
            Found {filteredTerms.length} term
            {filteredTerms.length !== 1 ? "s" : ""}
          </p>
        )}
      </Card>

      {/* Alphabet quick navigation */}
      {!searchQuery && (
        <Card className="py-3">
          <div className="flex flex-wrap gap-1 justify-center">
            {Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").map((letter) => {
              const hasTerms = groupedTerms[letter]?.length > 0;
              return (
                <button
                  key={letter}
                  onClick={() => {
                    if (hasTerms) {
                      const element = document.getElementById(
                        `section-${letter}`,
                      );
                      if (element) {
                        element.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }
                    }
                  }}
                  disabled={!hasTerms}
                  className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                    hasTerms
                      ? "bg-white/5 hover:bg-plasma-orange/20 text-gray-300 hover:text-plasma-orange"
                      : "text-gray-600 cursor-not-allowed"
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Terms list */}
      {letters.length > 0 ? (
        <div className="space-y-4">
          {letters.map((letter) => (
            <Card key={letter} id={`section-${letter}`}>
              <h2 className="text-xl font-bold text-plasma-orange mb-4 pb-2 border-b border-white/10">
                {letter}
              </h2>
              <div className="space-y-0">
                {groupedTerms[letter].map((term) => (
                  <div key={term.term} id={`term-${term.term}`}>
                    <TermCard
                      term={term}
                      isExpanded={expandedTerm === term.term}
                      onToggle={() =>
                        setExpandedTerm(
                          expandedTerm === term.term ? null : term.term,
                        )
                      }
                      onTermClick={handleTermClick}
                    />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="text-center py-8">
            <p className="text-gray-400">
              No terms found matching "{searchQuery}"
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="mt-2 text-plasma-orange hover:underline"
            >
              Clear search
            </button>
          </div>
        </Card>
      )}

      {/* Term count */}
      <Card className="text-center py-4">
        <p className="text-sm text-gray-500">
          {GLOSSARY.length} terms in the glossary
        </p>
      </Card>
    </div>
  );
}

export default Glossary;

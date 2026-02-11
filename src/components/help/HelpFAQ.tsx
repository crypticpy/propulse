/**
 * HelpFAQ — Accordion-style FAQ (Q&A pairs).
 * Simpler than HelpAccordion — just question as clickable heading, answer expands below.
 */

import { useState, useCallback } from "react";

export interface FAQItem {
  question: string;
  answer: string;
}

interface HelpFAQProps {
  items: FAQItem[];
}

function FAQEntry({ item, index }: { item: FAQItem; index: number }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const headingId = `faq-heading-${index}`;
  const panelId = `faq-panel-${index}`;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <h4>
        <button
          id={headingId}
          type="button"
          onClick={toggle}
          onKeyDown={handleKeyDown}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="w-full flex items-center gap-2.5 py-3 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 rounded"
        >
          <svg
            aria-hidden="true"
            className={`w-3.5 h-3.5 flex-shrink-0 text-gray-500 transition-transform duration-200 motion-reduce:transition-none ${
              isOpen ? "rotate-90" : "rotate-0"
            }`}
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
          <span
            className={`text-sm font-medium transition-colors ${
              isOpen
                ? "text-gray-100"
                : "text-gray-300 group-hover:text-gray-100"
            }`}
          >
            {item.question}
          </span>
        </button>
      </h4>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        hidden={!isOpen ? true : undefined}
      >
        {isOpen && (
          <div className="pl-6 pr-2 pb-3">
            <p className="text-sm text-gray-400 leading-relaxed">
              {item.answer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function HelpFAQ({ items }: HelpFAQProps) {
  return (
    <div className="my-3">
      {items.map((item, i) => (
        <FAQEntry key={i} item={item} index={i} />
      ))}
    </div>
  );
}

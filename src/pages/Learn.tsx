import { useState } from "react";
import {
  PropagationGuide,
  BandGuide,
  FirstDXGuide,
  Glossary,
} from "@/components/learn";

type TabId = "propagation" | "bands" | "firstdx" | "glossary";

interface TabInfo {
  id: TabId;
  label: string;
  shortLabel: string;
  description: string;
}

const TABS: TabInfo[] = [
  {
    id: "propagation",
    label: "Propagation 101",
    shortLabel: "Propagation",
    description: "Understanding how radio waves travel",
  },
  {
    id: "bands",
    label: "Band Guide",
    shortLabel: "Bands",
    description: "HF band characteristics and usage",
  },
  {
    id: "firstdx",
    label: "Your First DX",
    shortLabel: "First DX",
    description: "Step-by-step guide to making your first contact",
  },
  {
    id: "glossary",
    label: "Glossary",
    shortLabel: "Glossary",
    description: "Ham radio terminology explained",
  },
];

/**
 * Learn Page - Educational content about ham radio propagation
 */
export function Learn() {
  const [activeTab, setActiveTab] = useState<TabId>("propagation");

  const currentTab = TABS.find((t) => t.id === activeTab);

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="font-orbitron text-2xl md:text-3xl font-bold text-gradient-orange mb-2">
            Learn Ham Radio Propagation
          </h1>
          <p className="text-gray-400">
            Master the fundamentals of HF propagation and make your first DX
            contact
          </p>
        </div>

        {/* Tab navigation */}
        <div className="glass-panel rounded-xl p-1 mb-6">
          <div className="flex flex-wrap gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex-1 min-w-[100px] px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-200
                  ${
                    activeTab === tab.id
                      ? "bg-plasma-orange/20 text-plasma-orange"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab description */}
        {currentTab && (
          <div className="mb-6">
            <p className="text-sm text-gray-500">{currentTab.description}</p>
          </div>
        )}

        {/* Tab content */}
        <div className="animate-fade-in">
          {activeTab === "propagation" && <PropagationGuide />}
          {activeTab === "bands" && <BandGuide />}
          {activeTab === "firstdx" && <FirstDXGuide />}
          {activeTab === "glossary" && <Glossary />}
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-white/10 text-center">
          <p className="text-sm text-gray-500">
            Content accuracy is important. If you find errors, please let us
            know.
          </p>
          <p className="text-xs text-gray-600 mt-2">
            Propulse — The ionosphere, visualized
          </p>
        </footer>
      </main>
    </div>
  );
}

export default Learn;

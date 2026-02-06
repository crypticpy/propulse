/**
 * QuickActions Component
 *
 * A grid of navigation cards linking to the main tool pages.
 * Uses glass-morphism styling with hover glow effects.
 */

import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";

export interface QuickActionsProps {
  className?: string;
}

interface QuickAction {
  icon: string;
  title: string;
  description: string;
  path: string;
}

const actions: QuickAction[] = [
  {
    icon: "\uD83C\uDF0D",
    title: "PropSphere",
    description: "3D globe with live DX spots",
    path: "/map",
  },
  {
    icon: "\uD83E\uDDD9",
    title: "DX Wizard",
    description: "AI propagation advisor",
    path: "/dx",
  },
  {
    icon: "\uD83D\uDCE1",
    title: "Band Planner",
    description: "Band opening predictions",
    path: "/planner",
  },
  {
    icon: "\uD83C\uDFC6",
    title: "Contest Mode",
    description: "High-speed contest logging",
    path: "/contest",
  },
];

export function QuickActions({ className = "" }: QuickActionsProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {actions.map((action) => (
        <Link key={action.path} to={action.path} className="group">
          <Card className="h-full flex flex-col items-center text-center gap-2 p-4 hover:border-white/20 hover:bg-white/[0.05] transition-all duration-200 cursor-pointer">
            <span className="text-3xl">{action.icon}</span>
            <span className="font-sans text-sm font-medium text-white">
              {action.title}
            </span>
            <span className="text-xs text-gray-400">{action.description}</span>
            <span className="text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              &rarr;
            </span>
          </Card>
        </Link>
      ))}
    </div>
  );
}

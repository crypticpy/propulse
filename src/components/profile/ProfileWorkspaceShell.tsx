import type { CSSProperties, ReactNode } from "react";
import { BookOpen, Radio, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Badge,
  PageHeader,
  Section,
  StationProvider,
  Tabs,
} from "@/components/station-ui";
import type { ProfileTab } from "./ProfileTabBar";
import "./profile-workspace.css";

const sections: { value: ProfileTab; label: string; visitorLabel?: string }[] =
  [
    { value: "overview", label: "Overview" },
    { value: "shack", label: "My shack", visitorLabel: "Station" },
    { value: "stats", label: "Stats & records" },
    { value: "awards", label: "Awards" },
    { value: "social", label: "Social & sharing", visitorLabel: "Social" },
  ];

/** Real profile host: navigation changes presentation, never publication or operating state. */
export function ProfileWorkspaceShell({
  visitor = false,
  callsign,
  identity,
  actions,
  activeTab,
  onTabChange,
  children,
  overlays,
  style,
  backgroundUrl,
}: {
  visitor?: boolean;
  callsign: string;
  identity: ReactNode;
  actions?: ReactNode;
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  children: ReactNode;
  overlays?: ReactNode;
  style?: CSSProperties;
  backgroundUrl?: string | null;
}) {
  return (
    <StationProvider className="profile-workspace" style={style} role="main">
      {backgroundUrl && (
        <div
          className="profile-workspace-background"
          aria-hidden="true"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        />
      )}
      <div className="profile-workspace-inner">
        <div className="profile-workspace-context">
          <span>
            <Radio size={17} aria-hidden="true" />{" "}
            {visitor ? "Meet the operator" : "Your operator workspace"}
          </span>
          {visitor ? (
            <Link to="/profile">
              Back to my profile <span aria-hidden="true">↗</span>
            </Link>
          ) : (
            <Badge>
              <UserRound size={14} aria-hidden="true" /> Owner view
            </Badge>
          )}
        </div>
        <PageHeader
          title={
            visitor ? `${callsign} · Station & story` : "Profile & station"
          }
          description={
            visitor
              ? "Explore this operator’s station, interests, and life on the air."
              : "Your story, your station, and the contacts that connect it all."
          }
          actions={actions}
        />
        <div className="profile-workspace-layout">
          <aside
            className="profile-workspace-identity"
            aria-label={
              visitor ? "Operator identity" : "Your operator identity"
            }
          >
            <div className="profile-workspace-legacy">{identity}</div>
            {!visitor && (
              <div className="profile-workspace-rail-note">
                <ShieldCheck size={19} aria-hidden="true" />
                <div>
                  <strong>Make it yours.</strong>
                  <p>
                    Manage who sees each part of your profile in Social &amp;
                    sharing.
                  </p>
                  <Link to="/settings">
                    Profile &amp; appearance settings{" "}
                    <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </div>
            )}
          </aside>
          <div className="profile-workspace-content">
            <Tabs
              label={
                visitor ? "Operator profile sections" : "Your profile sections"
              }
              value={activeTab}
              onChange={(value) => onTabChange(value as ProfileTab)}
              items={sections.map((section) => ({
                value: section.value,
                label: visitor
                  ? (section.visitorLabel ?? section.label)
                  : section.label,
                // Preserve the existing unmount-on-tab-change behavior.
                content:
                  section.value === activeTab ? (
                    <div
                      className={
                        activeTab === "shack"
                          ? "profile-workspace-shack"
                          : "profile-workspace-legacy profile-workspace-tab"
                      }
                    >
                      {children}
                    </div>
                  ) : null,
              }))}
            />
          </div>
        </div>
        <footer className="profile-workspace-footer">
          <BookOpen size={16} aria-hidden="true" />
          <span>
            {visitor
              ? "Every station has a story."
              : "Keep building your station. Keep telling your story."}
          </span>
        </footer>
      </div>
      {overlays}
    </StationProvider>
  );
}

export function ProfileWorkspaceSection({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Section
      className="profile-workspace-section"
      title={title}
      description={description}
      actions={actions}
    >
      {children}
    </Section>
  );
}

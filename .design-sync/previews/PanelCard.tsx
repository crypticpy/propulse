import { PanelCard } from "propulse";

export function Default() {
  return (
    <PanelCard
      title="Band Conditions"
      subtitle="20 m — daytime"
      statusDot="success"
      badges={[
        { label: "SFI", value: 142, color: "success" },
        { label: "Kp", value: 3, color: "warning" },
      ]}
    >
      <p className="text-sm text-su-text">
        Excellent propagation to Europe and Asia. Grayline enhancement
        expected near 22:00 UTC.
      </p>
    </PanelCard>
  );
}

export function WithHelpAndExpand() {
  return (
    <PanelCard
      title="Aurora Watch"
      statusDot="warning"
      helpContent={{
        title: "Aurora Watch",
        sections: [
          {
            title: "What this means",
            content:
              "Kp index above 5 can disrupt polar and near-polar HF paths.",
          },
        ],
      }}
      expandable
      onExpand={() => {}}
      footer={<span className="text-[10px] text-su-muted">Updated 2 min ago</span>}
    >
      <p className="text-sm text-su-text">
        Kp 6 — auroral absorption likely on paths above 60° N.
      </p>
    </PanelCard>
  );
}

export function Collapsed() {
  return (
    <PanelCard
      title="Solar Flux"
      collapsible
      collapsed
      statusDot="neutral"
      onToggleCollapse={() => {}}
      collapsedSummary={
        <span className="font-mono text-su-text">SFI 142</span>
      }
    >
      <p className="text-sm text-su-text">Hidden while collapsed.</p>
    </PanelCard>
  );
}

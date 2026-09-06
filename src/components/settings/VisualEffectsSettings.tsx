import {
  Badge,
  Button,
  ChoiceGroup,
  Notice,
  Section,
  Stack,
  StationProvider,
  Surface,
  Switch,
} from "@/components/station-ui";
import { useVisualEffects } from "@/hooks/useVisualEffects";
import { useVisualEffectsStore } from "@/stores/visualEffectsStore";

const effects = [
  {
    key: "celebrations",
    label: "Level-up celebrations",
    hint: "A rank notice in Subtle; the full celebration in Full.",
  },
  {
    key: "animatedBadges",
    label: "Animated badges and frames",
    hint: "Moving rank treatments on profiles and gear cards. Requires Full.",
  },
  {
    key: "particles",
    label: "Particles and ambient motion",
    hint: "Decorative particles around rank cards and celebrations. Requires Full.",
  },
  {
    key: "glow",
    label: "Decorative glow",
    hint: "Soft halos around rank details. Turn off for crisper edges.",
  },
] as const;

export function VisualEffectsSettings() {
  const preferences = useVisualEffectsStore();
  const resolved = useVisualEffects();

  return (
    <StationProvider>
      <Surface>
        <Section
          title="Decorative effects"
          description="Set a comfortable level of detail for your profiles, rank badges and shack gear cards. Your earned progress stays the same."
          actions={<Badge>On this device</Badge>}
        >
          <Stack>
            <ChoiceGroup
              label="Effects level"
              value={preferences.level}
              onChange={preferences.setLevel}
              options={[
                { value: "off", label: "Off" },
                { value: "subtle", label: "Subtle" },
                { value: "full", label: "Full" },
              ]}
            />
            <p className="su-hint" role="status">
              {preferences.level === "off"
                ? "Off: static rank details, without celebrations, decorative movement or glow."
                : preferences.level === "subtle"
                  ? "Subtle: calm rank notices and optional glow, with static badges and cards."
                  : "Full: all the effects you choose below, within your device’s motion preference."}
            </p>
            {resolved.reducedMotion && (
              <Notice title="Reduced motion is active">
                Your device preference keeps decorative movement and particles off,
                including in Full. Rank notices stay still; glow is your choice.
              </Notice>
            )}
            {!preferences.persistenceAvailable && (
              <Notice title="Preferences are temporary" tone="warning">
                Browser storage is unavailable. These choices work for this visit,
                but may be lost when you reload.
                <Button variant="quiet" onClick={preferences.retryPersistence}>
                  Try saving again
                </Button>
              </Notice>
            )}
            <fieldset className="space-y-4">
              <legend className="font-semibold mb-2">Choose your effects</legend>
              <p className="su-hint mb-4">
                Your switches are remembered at every level. Off pauses them all;
                Subtle pauses animations and particles.
              </p>
              {effects.map(({ key, label, hint }) => (
                <div key={key}>
                  <Switch
                    label={label}
                    hint={`${hint} ${preferences[key] && !resolved[key] ? "Paused by your effects level or reduced-motion preference." : preferences[key] ? "Enabled at this level." : "Switched off."}`}
                    checked={preferences[key]}
                    onChange={(event) => preferences.setEffect(key, event.target.checked)}
                  />
                </div>
              ))}
            </fieldset>
            <div className="su-inline justify-between">
              <p className="su-hint">Changes apply immediately on this device.</p>
              <Button variant="quiet" onClick={preferences.reset}>
                Reset effects to Subtle
              </Button>
            </div>
          </Stack>
        </Section>
      </Surface>
    </StationProvider>
  );
}

import {
  WallClockDisplay,
  type WallClockMode,
} from "@/components/kiosk/WallClockDisplay";

export function WallClockPage({ mode }: { mode: WallClockMode }) {
  return <WallClockDisplay mode={mode} />;
}

/**
 * The one predicate that decides whether a profile section is disclosed to the
 * operator looking at it. ProfilePage gated `Where to find me` and the grid
 * line with an inline `vis.location !== "private"` check while the contact
 * panel next to them read the same coordinates ungated, so the rule lives here
 * now and every consumer of a published section asks this function.
 *
 * "Friend" is the app's follow relation: the viewer follows the profile owner.
 */

import type { VisibilitySettings } from "@/types/social";

export type ProfileSection = keyof VisibilitySettings;

export function isSectionVisibleToViewer(
  settings: VisibilitySettings | undefined,
  section: ProfileSection,
  viewerIsFriend: boolean,
): boolean {
  const level = settings?.[section];
  // A profile that never published settings keeps the pre-existing open
  // behaviour: there is nothing to honour yet.
  if (!level) return true;
  if (level === "private") return false;
  if (level === "friends") return viewerIsFriend;
  return true;
}

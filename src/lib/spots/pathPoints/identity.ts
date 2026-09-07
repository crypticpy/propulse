import type { PathPointDescriptor } from "@/lib/views/spotContracts";

export type PathPointRole = PathPointDescriptor["role"];

/** Matches SP-01 `contractIdSchema` length (1 + 127). */
export const PATH_POINT_ID_MAX_LENGTH = 128;

const CONTRACT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/;

function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hopRoleSuffix(hopIndex: number, role: PathPointRole): string {
  return `:h${hopIndex}:${role}`;
}

/**
 * Stable inspectable identity. Independent of animation ticks and camera.
 * Always fits `contractIdSchema` even when `pathId` is already 128 characters.
 */
export function pathPointId(
  pathId: string,
  hopIndex: number,
  role: PathPointRole,
): string {
  const suffix = hopRoleSuffix(hopIndex, role);
  const direct = `${pathId}${suffix}`;
  if (direct.length <= PATH_POINT_ID_MAX_LENGTH && CONTRACT_ID_RE.test(direct)) {
    return direct;
  }
  const bounded = `p${fnv1aHex(pathId)}${suffix}`;
  return bounded.slice(0, PATH_POINT_ID_MAX_LENGTH);
}

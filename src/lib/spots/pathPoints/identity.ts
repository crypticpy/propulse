import type { PathPointDescriptor } from "@/lib/views/spotContracts";

export type PathPointRole = PathPointDescriptor["role"];

/** Matches SP-01 `contractIdSchema` length (1 + 127). */
export const PATH_POINT_ID_MAX_LENGTH = 128;

const CONTRACT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/;

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 16 hex chars of the full pathId so shared prefixes stay distinct. */
function pathIdDigest(pathId: string): string {
  const primary = fnv1a(pathId).toString(16).padStart(8, "0");
  const salted = fnv1a(`${pathId.length}:${pathId}`).toString(16).padStart(8, "0");
  return `${primary}${salted}`;
}

function hopRoleSuffix(hopIndex: number, role: PathPointRole): string {
  return `:h${hopIndex}:${role}`;
}

/**
 * Stable inspectable identity. Independent of animation ticks and camera.
 * Always fits `contractIdSchema`. Hop and role stay in the suffix; they are
 * never truncated when `pathId` is already 128 characters.
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
  const bounded = `p${pathIdDigest(pathId)}${suffix}`;
  if (bounded.length > PATH_POINT_ID_MAX_LENGTH || !CONTRACT_ID_RE.test(bounded)) {
    throw new Error("pathPointId could not fit hop/role into the contract id");
  }
  return bounded;
}

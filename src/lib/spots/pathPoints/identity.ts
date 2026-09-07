import type { PathPointDescriptor } from "@/lib/views/spotContracts";

export type PathPointRole = PathPointDescriptor["role"];

/** Stable inspectable identity. Independent of animation ticks and camera. */
export function pathPointId(
  pathId: string,
  hopIndex: number,
  role: PathPointRole,
): string {
  return `${pathId}:h${hopIndex}:${role}`;
}

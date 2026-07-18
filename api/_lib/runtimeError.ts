export function isErrorNamed(
  value: unknown,
  ...names: string[]
): boolean {
  if (typeof value !== "object" || value === null) return false;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" && names.includes(name);
}

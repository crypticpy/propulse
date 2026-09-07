const INSTALL_KEY = "propulse-view-install-id";

/** Fresh per mount. Never read from sessionStorage or copy into saved records. */
export function createInstanceId(): string {
  return crypto.randomUUID();
}

/** Anonymous working-slot namespace. Distinct from QSO device-sync identity. */
export function getAnonymousInstallId(storage: Storage | null = defaultLocalStorage()): string {
  if (!storage) return `memory:${createInstanceId()}`;
  const existing = storage.getItem(INSTALL_KEY);
  if (existing && /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(existing)) return existing;
  const created = createInstanceId();
  try {
    storage.setItem(INSTALL_KEY, created);
  } catch {
    return `memory:${created}`;
  }
  return created;
}

export function ownerNamespace(ownerId: string | null, installStorage?: Storage | null): string {
  return ownerId && ownerId.length > 0 ? `acct:${ownerId}` : `anon:${getAnonymousInstallId(installStorage)}`;
}

function defaultLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

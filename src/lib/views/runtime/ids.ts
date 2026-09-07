const INSTALL_KEY = "propulse-view-install-id";
const INSTALL_ID = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/;

/** Process-stable anonymous id when localStorage is missing or throws. */
let processInstallId: string | null = null;

/** Fresh per mount. Never read from sessionStorage or copy into saved records. */
export function createInstanceId(): string {
  return crypto.randomUUID();
}

function rememberProcessInstallId(preferred?: string): string {
  if (!processInstallId) processInstallId = preferred ?? createInstanceId();
  return processInstallId;
}

/** Anonymous working-slot namespace. Distinct from QSO device-sync identity. */
export function getAnonymousInstallId(storage: Storage | null = defaultLocalStorage()): string {
  if (storage) {
    try {
      const existing = storage.getItem(INSTALL_KEY);
      if (existing && INSTALL_ID.test(existing)) {
        processInstallId = existing;
        return existing;
      }
    } catch {
      return rememberProcessInstallId();
    }
    const created = rememberProcessInstallId();
    try {
      storage.setItem(INSTALL_KEY, created);
    } catch {
      return created;
    }
    return created;
  }
  return rememberProcessInstallId();
}

export function ownerNamespace(ownerId: string | null, installStorage?: Storage | null): string {
  return ownerId && ownerId.length > 0 ? `acct:${ownerId}` : `anon:${getAnonymousInstallId(installStorage)}`;
}

export function resetAnonymousInstallIdForTests(): void {
  processInstallId = null;
}

function defaultLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

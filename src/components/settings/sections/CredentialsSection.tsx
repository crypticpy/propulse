/**
 * CredentialsSection — QSL Service Credentials management
 *
 * Provides per-service credential entry (LoTW, eQSL, QRZ, Club Log)
 * backed by the encrypted credential vault (credentialStore).
 * Shows passphrase setup prompt if vault not yet configured.
 * "Lock Now" button, per-service "Stored" badges, and change passphrase flow.
 */

import { useState, useEffect, useCallback } from "react";
import {
  isUnlocked,
  lock,
  saveCredential,
  getCredential,
  deleteCredential,
  getState as getVaultState,
} from "@/lib/db/credentialStore";
import { useProfileStore } from "@/stores/profileStore";
import { CredentialUnlockDialog } from "@/components/settings/CredentialUnlockDialog";

// ---------------------------------------------------------------------------
// Service definitions
// ---------------------------------------------------------------------------

interface ServiceDef {
  id: string;
  label: string;
  description: string;
  fields: { key: string; label: string; type: "text" | "password" }[];
}

const QSL_SERVICES: ServiceDef[] = [
  {
    id: "lotw",
    label: "Logbook of The World (LoTW)",
    description:
      "ARRL's trusted QSL confirmation service. Requires a tQSL certificate.",
    fields: [
      { key: "username", label: "LoTW Username", type: "text" },
      { key: "password", label: "LoTW Password", type: "password" },
    ],
  },
  {
    id: "eqsl",
    label: "eQSL",
    description: "Electronic QSL card exchange with visual QSL cards.",
    fields: [
      { key: "username", label: "eQSL Username", type: "text" },
      { key: "password", label: "eQSL Password", type: "password" },
    ],
  },
  {
    id: "qrz",
    label: "QRZ.com",
    description: "Callsign lookup and online logbook service.",
    fields: [
      { key: "username", label: "QRZ Username", type: "text" },
      { key: "password", label: "QRZ Password / API Key", type: "password" },
    ],
  },
  {
    id: "clublog",
    label: "Club Log",
    description: "DXCC tracking and Most Wanted analysis.",
    fields: [
      { key: "username", label: "Club Log Email", type: "text" },
      { key: "password", label: "Club Log Password", type: "password" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Service credential form
// ---------------------------------------------------------------------------

interface ServiceFormState {
  username: string;
  password: string;
  editing: boolean;
  saving: boolean;
  saved: boolean;
  deleting: boolean;
  showPassword: boolean;
}

const INITIAL_FORM: ServiceFormState = {
  username: "",
  password: "",
  editing: false,
  saving: false,
  saved: false,
  deleting: false,
  showPassword: false,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CredentialsSection() {
  // Vault state
  const [vaultSetup, setVaultSetup] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [storedServices, setStoredServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"setup" | "unlock">("setup");
  const [requestingService, setRequestingService] = useState<
    string | undefined
  >();

  // Per-service form state
  const [forms, setForms] = useState<Record<string, ServiceFormState>>({});

  // Store
  const credentialStoreSetup = useProfileStore((s) => s.credentialStoreSetup);
  const setCredentialStoreSetup = useProfileStore(
    (s) => s.setCredentialStoreSetup,
  );
  const setLastCredentialUnlock = useProfileStore(
    (s) => s.setLastCredentialUnlock,
  );
  const serviceCredentials = useProfileStore((s) => s.serviceCredentials);
  const clearPlaintextCredentials = useProfileStore(
    (s) => s.clearPlaintextCredentials,
  );

  // Check for plaintext credentials that need migration
  const hasPlaintextCredentials =
    Object.keys(serviceCredentials).length > 0 &&
    Object.values(serviceCredentials).some((v) => v !== undefined);

  // ---------------------------------------------------------------------------
  // Load vault state
  // ---------------------------------------------------------------------------

  const refreshVaultState = useCallback(async () => {
    try {
      const state = await getVaultState();
      setVaultSetup(state.isSetup);
      setVaultUnlocked(state.isUnlocked);
      setStoredServices(state.services);

      // Sync persisted flag with actual vault state
      if (state.isSetup && !credentialStoreSetup) {
        setCredentialStoreSetup(true);
      }
    } catch {
      // Vault may not be ready yet
    } finally {
      setLoading(false);
    }
  }, [credentialStoreSetup, setCredentialStoreSetup]);

  useEffect(() => {
    refreshVaultState();
  }, [refreshVaultState]);

  // Poll for auto-lock changes
  useEffect(() => {
    if (!vaultUnlocked) return;

    const interval = setInterval(() => {
      const unlocked = isUnlocked();
      if (!unlocked && vaultUnlocked) {
        setVaultUnlocked(false);
        // Reset all editing forms
        setForms({});
      }
    }, 5_000);

    return () => clearInterval(interval);
  }, [vaultUnlocked]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSetupOrUnlock = useCallback(
    (service?: string) => {
      setRequestingService(service);
      setDialogMode(vaultSetup ? "unlock" : "setup");
      setDialogOpen(true);
    },
    [vaultSetup],
  );

  const handleUnlocked = useCallback(async () => {
    setDialogOpen(false);
    setVaultUnlocked(true);
    setVaultSetup(true);
    setCredentialStoreSetup(true);
    setLastCredentialUnlock(Date.now());

    // If there are plaintext credentials, migrate them
    if (hasPlaintextCredentials) {
      try {
        for (const [service, cred] of Object.entries(serviceCredentials)) {
          if (!cred) continue;
          const username =
            "username" in cred
              ? (cred as { username: string }).username
              : "email" in cred
                ? (cred as { email: string }).email
                : "apiKey" in cred
                  ? (cred as { apiKey: string }).apiKey
                  : "";
          const password =
            "password" in cred ? (cred as { password: string }).password : "";
          if (username || password) {
            await saveCredential(service, username, password);
          }
        }
        clearPlaintextCredentials();
      } catch {
        // Migration is best-effort
      }
    }

    await refreshVaultState();
  }, [
    hasPlaintextCredentials,
    serviceCredentials,
    clearPlaintextCredentials,
    setCredentialStoreSetup,
    setLastCredentialUnlock,
    refreshVaultState,
  ]);

  const handleLockNow = useCallback(() => {
    lock();
    setVaultUnlocked(false);
    setForms({});
  }, []);

  const handleEditService = useCallback(
    async (serviceId: string) => {
      if (!isUnlocked()) {
        handleSetupOrUnlock(serviceId);
        return;
      }

      try {
        const cred = await getCredential(serviceId);
        setForms((prev) => ({
          ...prev,
          [serviceId]: {
            ...INITIAL_FORM,
            username: cred?.username ?? "",
            password: cred?.password ?? "",
            editing: true,
          },
        }));
      } catch {
        setForms((prev) => ({
          ...prev,
          [serviceId]: {
            ...INITIAL_FORM,
            editing: true,
          },
        }));
      }
    },
    [handleSetupOrUnlock],
  );

  const handleSaveService = useCallback(
    async (serviceId: string) => {
      const form = forms[serviceId];
      if (!form) return;

      setForms((prev) => ({
        ...prev,
        [serviceId]: { ...prev[serviceId], saving: true },
      }));

      try {
        await saveCredential(serviceId, form.username, form.password);
        setForms((prev) => ({
          ...prev,
          [serviceId]: {
            ...prev[serviceId],
            saving: false,
            saved: true,
            editing: false,
          },
        }));
        // Clear "saved" indicator after a moment
        setTimeout(() => {
          setForms((prev) => ({
            ...prev,
            [serviceId]: prev[serviceId]
              ? { ...prev[serviceId], saved: false }
              : prev[serviceId],
          }));
        }, 2_000);
        await refreshVaultState();
      } catch {
        setForms((prev) => ({
          ...prev,
          [serviceId]: { ...prev[serviceId], saving: false },
        }));
      }
    },
    [forms, refreshVaultState],
  );

  const handleDeleteService = useCallback(
    async (serviceId: string) => {
      setForms((prev) => ({
        ...prev,
        [serviceId]: { ...prev[serviceId], deleting: true },
      }));

      try {
        await deleteCredential(serviceId);
        setForms((prev) => ({
          ...prev,
          [serviceId]: { ...INITIAL_FORM },
        }));
        await refreshVaultState();
      } catch {
        setForms((prev) => ({
          ...prev,
          [serviceId]: { ...prev[serviceId], deleting: false },
        }));
      }
    },
    [refreshVaultState],
  );

  const handleCancelEdit = useCallback((serviceId: string) => {
    setForms((prev) => ({
      ...prev,
      [serviceId]: { ...INITIAL_FORM },
    }));
  }, []);

  const updateFormField = useCallback(
    (serviceId: string, field: "username" | "password", value: string) => {
      setForms((prev) => ({
        ...prev,
        [serviceId]: {
          ...(prev[serviceId] ?? INITIAL_FORM),
          [field]: value,
        },
      }));
    },
    [],
  );

  const toggleShowPassword = useCallback((serviceId: string) => {
    setForms((prev) => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] ?? INITIAL_FORM),
        showPassword: !prev[serviceId]?.showPassword,
      },
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg
          className="w-5 h-5 animate-spin text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vault status bar */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center gap-3">
          {/* Lock/Unlock icon */}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              vaultUnlocked
                ? "bg-signal-green/20"
                : vaultSetup
                  ? "bg-caution-amber/20"
                  : "bg-white/10"
            }`}
          >
            {vaultUnlocked ? (
              <svg
                className="w-4 h-4 text-signal-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                />
              </svg>
            ) : (
              <svg
                className={`w-4 h-4 ${vaultSetup ? "text-caution-amber" : "text-gray-500"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-200">
              {vaultUnlocked
                ? "Vault Unlocked"
                : vaultSetup
                  ? "Vault Locked"
                  : "Vault Not Configured"}
            </p>
            <p className="text-xs text-gray-500">
              {vaultUnlocked
                ? `${storedServices.length} service${storedServices.length !== 1 ? "s" : ""} stored`
                : vaultSetup
                  ? "Enter your passphrase to manage credentials"
                  : "Set up a passphrase to encrypt your service credentials"}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {vaultUnlocked ? (
            <button
              type="button"
              onClick={handleLockNow}
              className="px-3 py-1.5 rounded-lg text-xs font-medium
                bg-white/5 text-gray-300 border border-white/10
                hover:bg-white/10 transition-colors"
            >
              Lock Now
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSetupOrUnlock()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium
                bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30
                hover:bg-plasma-orange/30 transition-colors"
            >
              {vaultSetup ? "Unlock" : "Set Up Passphrase"}
            </button>
          )}
        </div>
      </div>

      {/* Migration notice */}
      {hasPlaintextCredentials && !vaultSetup && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-caution-amber/10 border border-caution-amber/20">
          <svg
            className="w-5 h-5 text-caution-amber flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-caution-amber">
              Unencrypted credentials detected
            </p>
            <p className="text-xs text-gray-400 mt-1">
              You have service credentials stored in plaintext. Set up a
              passphrase to migrate them to the encrypted vault.
            </p>
          </div>
        </div>
      )}

      {/* Service cards */}
      <div className="space-y-3">
        {QSL_SERVICES.map((service) => {
          const isStored = storedServices.includes(service.id);
          const form = forms[service.id];
          const isEditing = form?.editing ?? false;

          return (
            <div
              key={service.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden"
            >
              {/* Service header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ServiceIcon serviceId={service.id} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-200 truncate">
                        {service.label}
                      </h4>
                      {isStored && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-signal-green/20 text-signal-green border border-signal-green/30">
                          Stored
                        </span>
                      )}
                      {form?.saved && (
                        <span className="flex-shrink-0 text-xs text-signal-green animate-in fade-in">
                          Saved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {service.description}
                    </p>
                  </div>
                </div>

                {/* Edit / Add button */}
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => handleEditService(service.id)}
                    disabled={!vaultUnlocked}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${
                        vaultUnlocked
                          ? isStored
                            ? "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                            : "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/25 hover:bg-plasma-orange/25"
                          : "bg-white/5 text-gray-600 border border-white/5 cursor-not-allowed"
                      }`}
                  >
                    {isStored ? "Edit" : "Add"}
                  </button>
                )}
              </div>

              {/* Inline credential form (when editing) */}
              {isEditing && form && (
                <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
                  {service.fields.map((field) => {
                    const value =
                      field.key === "username" ? form.username : form.password;
                    const isPasswordField = field.type === "password";
                    const showPw = isPasswordField && form.showPassword;

                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          {field.label}
                        </label>
                        <div className="relative">
                          <input
                            type={
                              isPasswordField
                                ? showPw
                                  ? "text"
                                  : "password"
                                : "text"
                            }
                            value={value}
                            onChange={(e) =>
                              updateFormField(
                                service.id,
                                field.key as "username" | "password",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-2 pr-10 rounded-lg bg-white/5 border border-white/10
                              text-white placeholder-gray-600 text-sm
                              focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                              transition-colors"
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            autoComplete="off"
                            disabled={form.saving}
                          />
                          {isPasswordField && (
                            <button
                              type="button"
                              onClick={() => toggleShowPassword(service.id)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                              aria-label={
                                showPw ? "Hide password" : "Show password"
                              }
                              tabIndex={-1}
                            >
                              {showPw ? <EyeOffIconSmall /> : <EyeIconSmall />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveService(service.id)}
                      disabled={
                        form.saving || (!form.username && !form.password)
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                        bg-plasma-orange text-black
                        hover:bg-plasma-orange/90
                        disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {form.saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancelEdit(service.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium
                        bg-white/5 text-gray-400 border border-white/10
                        hover:bg-white/10 transition-colors"
                      disabled={form.saving}
                    >
                      Cancel
                    </button>
                    {isStored && (
                      <button
                        type="button"
                        onClick={() => handleDeleteService(service.id)}
                        disabled={form.deleting}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium
                          bg-red-500/10 text-red-400 border border-red-500/20
                          hover:bg-red-500/20 transition-colors
                          disabled:opacity-40"
                      >
                        {form.deleting ? "Removing..." : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Security note */}
      <div className="px-4 py-3 rounded-lg bg-white/[0.02] border border-white/5">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-xs text-gray-500 leading-relaxed">
            Credentials are encrypted with AES-256-GCM and stored in a separate
            local database. Your passphrase is never stored or transmitted. The
            vault auto-locks after 30 minutes of inactivity.
          </p>
        </div>
      </div>

      {/* Unlock dialog */}
      <CredentialUnlockDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onUnlocked={handleUnlocked}
        mode={dialogMode}
        requestingService={requestingService}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service icons
// ---------------------------------------------------------------------------

function ServiceIcon({ serviceId }: { serviceId: string }) {
  const colors: Record<string, string> = {
    lotw: "bg-blue-500/20 text-blue-400",
    eqsl: "bg-green-500/20 text-green-400",
    qrz: "bg-purple-500/20 text-purple-400",
    clublog: "bg-amber-500/20 text-amber-400",
  };

  const labels: Record<string, string> = {
    lotw: "LW",
    eqsl: "eQ",
    qrz: "QZ",
    clublog: "CL",
  };

  return (
    <div
      className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${colors[serviceId] ?? "bg-white/10 text-gray-400"}`}
    >
      {labels[serviceId] ?? "??"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small eye icons for inline forms
// ---------------------------------------------------------------------------

function EyeIconSmall() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeOffIconSmall() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

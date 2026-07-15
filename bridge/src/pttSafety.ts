export type PttDriver = (enabled: boolean) => Promise<void>;

/**
 * Owns manual-PTT lockout, client ownership, and the maximum key-down timer.
 * Hardware state changes are injected so the policy can be tested without a
 * radio attached.
 */
export class PttSafetyController {
  private isLockedOut = false;
  private ownerClientId: string | null = null;
  private maxKeyDownTimer: ReturnType<typeof setTimeout> | null = null;
  private releaseRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private releasePending = false;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly drivePtt: PttDriver,
    private readonly maxKeyDownMs: number,
    private readonly onReleaseError: (reason: string, error: unknown) => void,
    private readonly releaseRetryMs = 250,
  ) {}

  get lockout(): boolean {
    return this.isLockedOut;
  }

  get owner(): string | null {
    return this.ownerClientId;
  }

  private clearMaxKeyDownTimer(): void {
    if (this.maxKeyDownTimer) clearTimeout(this.maxKeyDownTimer);
    this.maxKeyDownTimer = null;
  }

  private clearReleaseRetryTimer(): void {
    if (this.releaseRetryTimer) clearTimeout(this.releaseRetryTimer);
    this.releaseRetryTimer = null;
  }

  private clearTimers(): void {
    this.clearMaxKeyDownTimer();
    this.clearReleaseRetryTimer();
  }

  private scheduleReleaseRetry(reason: string): void {
    if (this.releaseRetryTimer || this.ownerClientId === null) return;
    this.releaseRetryTimer = setTimeout(() => {
      this.releaseRetryTimer = null;
      void this.release(reason).catch((error) => {
        this.onReleaseError(reason, error);
      });
    }, this.releaseRetryMs);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  setManualPtt(clientId: string, enabled: boolean): Promise<void> {
    return this.enqueue(async () => {
      if (enabled && this.isLockedOut) {
        throw new Error("PTT safety lockout is enabled");
      }
      if (enabled && this.releasePending) {
        throw new Error("PTT release is pending after a hardware error");
      }

      // Record ownership before the hardware operation so a disconnect that
      // races a slow key-down is queued to release immediately afterward.
      if (enabled) this.ownerClientId = clientId;
      try {
        await this.drivePtt(enabled);
      } catch (error) {
        if (enabled && this.ownerClientId === clientId) {
          this.ownerClientId = null;
        }
        throw error;
      }
      this.clearTimers();

      if (!enabled) {
        this.ownerClientId = null;
        this.releasePending = false;
        return;
      }

      this.maxKeyDownTimer = setTimeout(() => {
        this.maxKeyDownTimer = null;
        void this.release("maximum key-down timer").catch((error) => {
          this.onReleaseError("maximum key-down timer", error);
        });
      }, this.maxKeyDownMs);
    });
  }

  private async releaseNow(): Promise<boolean> {
    const hadOwner = this.ownerClientId !== null;
    if (!hadOwner) return false;
    this.releasePending = true;
    // Ownership and retry state are cleared only after hardware confirms PTT-off.
    await this.drivePtt(false);
    this.ownerClientId = null;
    this.releasePending = false;
    this.clearTimers();
    return true;
  }

  private async releaseWithRetry(reason: string): Promise<boolean> {
    try {
      return await this.releaseNow();
    } catch (error) {
      this.scheduleReleaseRetry(reason);
      throw error;
    }
  }

  release(reason: string): Promise<boolean> {
    return this.enqueue(() => this.releaseWithRetry(reason));
  }

  releaseIfOwnedBy(clientId: string, reason: string): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.ownerClientId !== clientId) return false;
      return this.releaseWithRetry(reason);
    });
  }

  configure(lockout: boolean): Promise<void> {
    return this.enqueue(async () => {
      this.isLockedOut = lockout;
      if (lockout) await this.releaseWithRetry("PTT safety lockout enabled");
    });
  }
}

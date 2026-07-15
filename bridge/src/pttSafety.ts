export type PttDriver = (enabled: boolean) => Promise<void>;

/**
 * Owns manual-PTT lockout, client ownership, and the maximum key-down timer.
 * Hardware state changes are injected so the policy can be tested without a
 * radio attached.
 */
export class PttSafetyController {
  private isLockedOut = false;
  private ownerClientId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly drivePtt: PttDriver,
    private readonly maxKeyDownMs: number,
    private readonly onReleaseError: (reason: string, error: unknown) => void,
  ) {}

  get lockout(): boolean {
    return this.isLockedOut;
  }

  get owner(): string | null {
    return this.ownerClientId;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
      this.clearTimer();

      if (!enabled) {
        this.ownerClientId = null;
        return;
      }

      this.timer = setTimeout(() => {
        this.timer = null;
        void this.release("maximum key-down timer").catch((error) => {
          this.onReleaseError("maximum key-down timer", error);
        });
      }, this.maxKeyDownMs);
    });
  }

  private async releaseNow(): Promise<boolean> {
    const hadOwner = this.ownerClientId !== null || this.timer !== null;
    this.ownerClientId = null;
    this.clearTimer();
    if (!hadOwner) return false;
    await this.drivePtt(false);
    return true;
  }

  release(_reason: string): Promise<boolean> {
    return this.enqueue(() => this.releaseNow());
  }

  releaseIfOwnedBy(clientId: string, _reason: string): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.ownerClientId !== clientId) return false;
      return this.releaseNow();
    });
  }

  configure(lockout: boolean): Promise<void> {
    return this.enqueue(async () => {
      this.isLockedOut = lockout;
      if (lockout) await this.releaseNow();
    });
  }
}

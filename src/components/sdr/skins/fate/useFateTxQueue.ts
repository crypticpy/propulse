/**
 * useFateTxQueue — Stub hook for future FT8/FT4 transmit capability.
 *
 * Returns a non-functional TX interface so UI components can wire to it
 * without conditional rendering. All operations are no-ops that log warnings.
 * `isReady` is always false until a real FT8 encoder is implemented.
 */

import type {
  FT8TxMessage,
  FT8TxState,
  FT8TxCapability,
} from "@/lib/ft8/ft8TxTypes";

interface UseFateTxQueueResult {
  txState: FT8TxState;
  capability: FT8TxCapability;
  queueMessage: (msg: FT8TxMessage) => void;
  cancelTx: () => void;
}

export function useFateTxQueue(): UseFateTxQueueResult {
  return {
    txState: {
      queuedMessage: null,
      txActive: false,
      nextTxSlot: 0,
      autoStage: null,
    },
    capability: {
      isReady: false,
      reason: "FT8 transmit encoder not yet implemented",
    },
    queueMessage: (_msg: FT8TxMessage) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[useFateTxQueue] TX not available — FT8 encoder not implemented",
        );
      }
    },
    cancelTx: () => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[useFateTxQueue] TX not available — FT8 encoder not implemented",
        );
      }
    },
  };
}

import { Card } from "@/components/ui";

export interface EndContestModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EndContestModal({
  isOpen,
  onCancel,
  onConfirm,
}: EndContestModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <Card className="relative z-10 w-full max-w-md p-6" animate>
        <div className="text-center space-y-4">
          <h3 className="text-lg font-orbitron font-bold text-white">
            End Contest Session?
          </h3>
          <p className="text-gray-400 text-sm">
            This will end your current session and move it to history.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg
                         text-gray-300 hover:text-white hover:border-white/20
                         transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-alert-red/20 border border-alert-red/50 rounded-lg
                         text-alert-red hover:bg-alert-red/30
                         transition-colors font-bold"
            >
              End Contest
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default EndContestModal;


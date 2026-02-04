import React from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { SpotStatsDashboard } from "../SpotStatsDashboard";

export interface ClusterPulseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ClusterPulseDetailModal
 *
 * Wrapper modal that displays the full SpotStatsDashboard (non-compact mode)
 * inside a DetailModal. Opens when clicking the ClusterPulseCard tile or
 * the compact SpotStatsDashboard bar.
 *
 * The full dashboard includes:
 * - Summary stats (total, unique callsigns, grids, avg/hr)
 * - Band distribution bars
 * - Mode distribution donut
 * - 24h activity timeline
 * - Top callsigns, grids, spotters lists
 */
export const ClusterPulseDetailModal: React.FC<
  ClusterPulseDetailModalProps
> = ({ isOpen, onClose }) => {
  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Cluster Activity Dashboard"
      subtitle="Real-time DX spot statistics and trends"
      size="xl"
    >
      <SpotStatsDashboard />
    </DetailModal>
  );
};

ClusterPulseDetailModal.displayName = "ClusterPulseDetailModal";

export default ClusterPulseDetailModal;

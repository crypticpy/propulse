import { DetailModal } from "@/components/ui/DetailModal";
import { ICS213Form } from "./ICS213Form";

interface ICS213ModalProps {
  open: boolean;
  onClose: () => void;
}

export function ICS213Modal({ open, onClose }: ICS213ModalProps) {
  return (
    <DetailModal
      isOpen={open}
      onClose={onClose}
      title="ICS-213 General Message"
      size="lg"
    >
      <ICS213Form onClose={onClose} />
    </DetailModal>
  );
}

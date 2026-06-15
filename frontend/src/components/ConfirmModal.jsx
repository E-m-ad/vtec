import { AlertTriangle, X } from "lucide-react";

import Button from "./Button";

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="modal-header">
          <div className="modal-title">
            <AlertTriangle size={20} aria-hidden="true" />
            <h2 id="confirm-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

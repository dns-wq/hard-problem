"use client";

interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

// Host-screen confirmation for actions the whole room sees (Reveal/Reopen/End)
export default function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel, busy }: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-body">{body}</p>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="modal-btn modal-btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

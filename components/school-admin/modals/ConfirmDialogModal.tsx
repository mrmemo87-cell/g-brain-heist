import React from 'react';
import ReactDOM from 'react-dom';
import { useSchoolAdmin } from '../SchoolAdminContext';

const ConfirmDialogModal: React.FC = () => {
  const {
    confirmBusy, confirmDialog, confirmReason, setConfirmBusy, setConfirmDialog, setConfirmReason,
  } = useSchoolAdmin();

  const close = React.useCallback(() => {
    if (confirmBusy) return;
    setConfirmDialog(null);
    setConfirmReason('');
  }, [confirmBusy, setConfirmDialog, setConfirmReason]);

  React.useEffect(() => {
    if (!confirmDialog) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [confirmDialog, close]);

  return (
    <>
    {confirmDialog && ReactDOM.createPortal(
      <div className="school-admin-modal-overlay fixed inset-0 flex items-center justify-center z-[9999] p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div
          className={`school-admin-modal school-admin-confirm-modal rounded-xl max-w-md w-full ${confirmDialog.isDestructive ? 'is-destructive' : 'is-information'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
        >
          <div className="school-admin-confirm-heading"><span aria-hidden="true">{confirmDialog.isDestructive ? '!' : 'i'}</span><div><p className="school-admin-eyebrow">{confirmDialog.isDestructive ? 'Please confirm' : 'Confirm action'}</p><h3 id="confirm-dialog-title">{confirmDialog.title}</h3></div></div>
          <p id="confirm-dialog-description" className="school-admin-confirm-description">{confirmDialog.description}</p>
          {confirmDialog.requiresReason && (
            <div className="mb-4">
              <label htmlFor="confirm-reason" className="block text-sm font-medium text-slate-700 mb-1">
                Reason (optional)
              </label>
              <input
                id="confirm-reason"
                type="text"
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg"
                placeholder="Add a reason for this action"
              />
            </div>
          )}
          <div className="school-admin-confirm-actions">
            <button
              onClick={close}
              disabled={confirmBusy}
              className="admin-button-ghost"
            >
              {confirmDialog.cancelLabel || 'Cancel'}
            </button>
            <button
              disabled={confirmBusy}
              onClick={async () => {
                setConfirmBusy(true);
                try {
                  await confirmDialog.onConfirm(confirmReason.trim() || undefined);
                } finally {
                  setConfirmBusy(false);
                  setConfirmDialog(null);
                  setConfirmReason('');
                }
              }}
              className={confirmDialog.isDestructive ? 'admin-button-danger school-admin-confirm-submit' : 'admin-button-primary'}
            >
              {confirmBusy ? 'Processing…' : (confirmDialog.confirmLabel || 'Confirm')}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
};

export default ConfirmDialogModal;

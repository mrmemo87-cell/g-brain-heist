import React from 'react';
import ReactDOM from 'react-dom';
import { useSchoolAdmin } from '../SchoolAdminContext';

const ConfirmDialogModal: React.FC = () => {
  const {
    confirmBusy, confirmDialog, confirmReason, setConfirmBusy, setConfirmDialog, setConfirmReason,
  } = useSchoolAdmin();

  return (
    <>
    {confirmDialog && ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
        <div
          className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
        >
          <h3 id="confirm-dialog-title" className="text-xl font-bold mb-2">
            {confirmDialog.title}
          </h3>
          <p id="confirm-dialog-description" className="text-sm text-gray-400 mb-4">
            {confirmDialog.description}
          </p>
          {confirmDialog.requiresReason && (
            <div className="mb-4">
              <label htmlFor="confirm-reason" className="block text-sm font-medium text-gray-300 mb-1">
                Reason (optional)
              </label>
              <input
                id="confirm-reason"
                type="text"
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                placeholder="Add a reason for this action"
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => {
                if (confirmBusy) return;
                setConfirmDialog(null);
                setConfirmReason('');
              }}
              disabled={confirmBusy}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
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
              className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                confirmDialog.isDestructive
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
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

import { useState } from 'react';
import Dialog from './Dialog.jsx';

export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch {
      setError('Something went wrong. Nothing was changed. Try again.');
      setBusy(false);
    }
  };

  return (
    <Dialog title={title} labelId="confirm-title" onClose={onCancel} dismissible={!busy} size="sm" role="alertdialog">
      <p className="mb-4 text-body-md text-slate-600">{message}</p>
      {error && (
        <p role="alert" className="mb-3 text-body-md text-urgent">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary" data-autofocus>
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={busy} className="btn-destructive">
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

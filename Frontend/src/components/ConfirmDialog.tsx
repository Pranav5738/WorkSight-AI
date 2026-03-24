import React from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title = 'Are you sure?', message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm p-5 border border-gray-200 dark:border-slate-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 text-sm">{cancelText}</button>
          <button onClick={onConfirm} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-sm">{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [resolveRef] = React.useState<{ current: ((v: boolean) => void) | null }>({ current: null });

  const confirm = React.useCallback((msg: string) => {
    setMessage(msg);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
  }, []);

  const onConfirm = React.useCallback(() => { setOpen(false); resolveRef.current?.(true); }, [resolveRef]);
  const onCancel = React.useCallback(() => { setOpen(false); resolveRef.current?.(false); }, [resolveRef]);

  const Dialog = (
    <ConfirmDialog
      open={open}
      message={message}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );

  return { confirm, Dialog } as const;
}

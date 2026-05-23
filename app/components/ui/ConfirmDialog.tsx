'use client';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title = 'Confirm Action',
  description = 'Are you sure you want to continue?',
  confirmText = 'OK',
  cancelText = 'Cancel',
  confirmVariant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="sasa-modal-panel w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="px-6 py-5">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">{title}</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
            {description}
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-300 bg-transparent px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-[#515151] px-4 py-2 font-medium text-white transition-colors hover:bg-[#000000]"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}






'use client';

import { useTranslation } from '../../context/TranslationContext';
import { useDarkMode } from '../../hooks/useDarkMode';
import ModalPortal from './ModalPortal';

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
  title,
  description,
  confirmText,
  cancelText,
  confirmVariant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();

  if (!open) return null;

  const resolvedTitle = title ?? t('common.confirm');
  const resolvedDescription = description ?? '';
  const resolvedCancel = cancelText ?? t('common.cancel');
  const resolvedConfirm = confirmText ?? t('common.accept');

  const confirmClass =
    confirmVariant === 'danger'
      ? 'rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700'
      : 'sasa-btn-primary rounded-xl px-4 py-2 text-sm font-medium transition-colors';

  const cancelClass = darkMode
    ? 'rounded-xl border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10'
    : 'rounded-xl border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50';

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-sm`}
        onClick={onCancel}
      >
        <div
          className="sasa-modal-panel w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
        >
          <div className="px-6 py-5">
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">
              {resolvedTitle}
            </h3>
            {resolvedDescription ? (
              <p
                id="confirm-dialog-description"
                className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-500"
              >
                {resolvedDescription}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button type="button" onClick={onCancel} className={cancelClass}>
              {resolvedCancel}
            </button>
            <button type="button" onClick={onConfirm} className={confirmClass}>
              {resolvedConfirm}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

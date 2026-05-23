'use client';

import { useTranslation } from '../../context/TranslationContext';
import { useDarkMode } from '../../hooks/useDarkMode';
import ModalPortal from './ModalPortal';

interface AlertDialogProps {
  open: boolean;
  title?: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
}

export default function AlertDialog({
  open,
  title,
  message,
  buttonText,
  onClose,
}: AlertDialogProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();

  if (!open) return null;

  const resolvedTitle = title ?? t('common.info');
  const resolvedButton = buttonText ?? t('common.accept');

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-sm`}
        onClick={onClose}
      >
        <div
          className="sasa-modal-panel w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-labelledby="alert-dialog-title"
          aria-describedby="alert-dialog-message"
        >
          <div className="px-6 py-5">
            <h3 id="alert-dialog-title" className="mb-2 text-lg font-semibold text-gray-900">
              {resolvedTitle}
            </h3>
            <p id="alert-dialog-message" className="text-sm text-gray-600 whitespace-pre-line">
              {message}
            </p>
          </div>
          <div className="flex justify-end border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="sasa-btn-primary rounded-xl px-4 py-2 text-sm font-medium transition-colors"
            >
              {resolvedButton}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

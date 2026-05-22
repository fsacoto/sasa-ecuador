'use client';

import { useEffect, type ReactNode } from 'react';
import ModalPortal from './ModalPortal';
import { useTranslation } from '../../context/TranslationContext';
import { useDarkMode } from '../../hooks/useDarkMode';

interface POModalShellProps {
  title: string;
  titleId?: string;
  headerExtra?: ReactNode;
  maxWidthClass?: string;
  panelMaxHeightClass?: string;
  panelClassName?: string;
  zIndexClass?: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}

/** Modal en portal: panel claro u oscuro según `sasaDarkMode`. */
export default function POModalShell({
  title,
  titleId = 'po-modal-title',
  headerExtra,
  maxWidthClass = 'max-w-3xl',
  panelMaxHeightClass = 'max-h-[90vh]',
  panelClassName = '',
  zIndexClass = 'z-[200]',
  onClose,
  closeLabel,
  children,
}: POModalShellProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 backdrop-blur-sm`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={onClose}
      >
        <div
          className={`sasa-modal-panel ${panelMaxHeightClass} w-full overflow-hidden rounded-2xl shadow-2xl ${maxWidthClass} ${panelClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200 px-6 py-4">
            <div className="min-w-0 flex-1 pr-4">
              <h3 id={titleId} className="text-xl font-semibold text-gray-900">
                {title}
              </h3>
              {headerExtra}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 transition-colors hover:text-gray-600"
              aria-label={closeLabel ?? t('common.cancel')}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}

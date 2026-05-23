'use client';

import ModalPortal from './ui/ModalPortal';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import type { BarcodePrintProgressPhase } from '../utils/barcodePrintPdf';

type BarcodePrintProgressProps = {
  phase: BarcodePrintProgressPhase;
  current: number;
  total: number;
};

export default function BarcodePrintProgress({ phase, current, total }: BarcodePrintProgressProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();

  const title =
    phase === 'pdf'
      ? t('purchaseOrders.barcodePrintGenerating')
      : t('purchaseOrders.barcodePrintPreparing');

  const detail =
    phase === 'pdf'
      ? t('purchaseOrders.barcodePrintWait')
      : total > 0
        ? t('purchaseOrders.barcodePrintProgress')
            .replace('{{current}}', String(current))
            .replace('{{total}}', String(total))
        : t('purchaseOrders.barcodePrintWait');

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} fixed inset-0 z-[300] flex flex-col items-center justify-center px-6`}
        style={{ backgroundColor: darkMode ? '#0b0b0b' : '#f9fafb' }}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className={`sasa-modal-panel flex w-full max-w-md flex-col items-center rounded-2xl border px-8 py-10 text-center shadow-xl ${
            darkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <div
            className="mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-gray-200 border-t-[#515151]"
            aria-hidden
          />
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-2 text-sm text-gray-500">{detail}</p>
        </div>
      </div>
    </ModalPortal>
  );
}

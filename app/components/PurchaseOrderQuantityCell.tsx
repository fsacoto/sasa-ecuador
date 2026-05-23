'use client';

import type { ReactNode } from 'react';
import { PurchaseOrder } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { getScanProgress, shouldShowScanStatus } from '../utils/purchaseOrderBarcodeScan';
import { effectivePurchaseOrderStatus } from '../utils/purchaseOrderStatusTheme';
import PoStatusIcon from './icons/PoStatusIcon';
import { IconPoAlert, IconPoXCircle } from './icons/PoLineIcons';

function QuantityPill({
  count,
  label,
  icon,
  tone,
}: {
  count: number;
  label: string;
  icon: ReactNode;
  tone: 'good' | 'problem' | 'missing';
}) {
  const toneClass = {
    good: 'border-green-200 bg-green-50 text-green-800',
    problem: 'border-amber-200 bg-amber-50 text-amber-900',
    missing: 'border-red-200 bg-red-50 text-red-800',
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${toneClass}`}
      title={`${label}: ${count}`}
    >
      {icon}
      {count}
    </span>
  );
}

function getVerificationBreakdown(order: PurchaseOrder) {
  const hasBreakdown =
    order.quantityGood !== undefined ||
    order.quantityProblem !== undefined ||
    order.quantityNotReceived !== undefined;
  const good = order.quantityGood ?? order.quantityReceived ?? order.quantity;
  const problem = order.quantityProblem ?? 0;
  const notReceived = order.quantityNotReceived ?? 0;
  const hasIssues = problem > 0 || notReceived > 0;

  return { hasBreakdown, good, problem, notReceived, hasIssues };
}

interface PurchaseOrderQuantityCellProps {
  order: PurchaseOrder;
}

export default function PurchaseOrderQuantityCell({ order }: PurchaseOrderQuantityCellProps) {
  const { t } = useTranslation();
  const status = effectivePurchaseOrderStatus(order.status);
  const showScan = shouldShowScanStatus(order);
  const scanProg = showScan ? getScanProgress(order) : null;

  if (showScan && scanProg) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-lg font-bold tabular-nums leading-none text-gray-900">{order.quantity}</span>
        <span className="text-xs font-medium tabular-nums text-sky-600">
          {t('purchaseOrders.scanTableQuantity')
            .replace('{scanned}', String(scanProg.scanned))
            .replace('{expected}', String(scanProg.expected))}
        </span>
      </div>
    );
  }

  if (status === 'Verified') {
    const { good, problem, notReceived, hasIssues } = getVerificationBreakdown(order);
    const showBreakdown = hasIssues;

    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-lg font-bold tabular-nums leading-none text-gray-900">{order.quantity}</span>
        {showBreakdown ? (
          <div className="flex max-w-[11rem] flex-wrap justify-center gap-1">
            {good > 0 && (
              <QuantityPill
                count={good}
                label={t('purchaseOrders.quantityGood')}
                icon={<PoStatusIcon status="Verified" className="h-3 w-3 shrink-0" />}
                tone="good"
              />
            )}
            {problem > 0 && (
              <QuantityPill
                count={problem}
                label={t('purchaseOrders.quantityProblem')}
                icon={<IconPoAlert className="h-3 w-3 shrink-0" />}
                tone="problem"
              />
            )}
            {notReceived > 0 && (
              <QuantityPill
                count={notReceived}
                label={t('purchaseOrders.quantityNotReceived')}
                icon={<IconPoXCircle className="h-3 w-3 shrink-0" />}
                tone="missing"
              />
            )}
          </div>
        ) : (
          <QuantityPill
            count={good}
            label={t('purchaseOrders.quantityGood')}
            icon={<PoStatusIcon status="Verified" className="h-3 w-3 shrink-0" />}
            tone="good"
          />
        )}
        {order.verificationComment && (
          <span
            className="max-w-[10rem] truncate text-[10px] font-medium text-gray-500"
            title={order.verificationComment}
          >
            {order.verificationComment}
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="text-sm tabular-nums text-gray-700">{order.quantity}</span>
  );
}

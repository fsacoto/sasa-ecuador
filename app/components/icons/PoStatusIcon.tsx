'use client';

import type { PurchaseOrderStatus } from '../../types';
import {
  PO_STATUS_COLOR,
  effectivePurchaseOrderStatus,
} from '../../utils/purchaseOrderStatusTheme';

interface PoStatusIconProps {
  status: PurchaseOrderStatus | string | undefined;
  className?: string;
}

/** Icono monocromático con un color sólido por estado. */
export default function PoStatusIcon({ status, className = 'w-4 h-4' }: PoStatusIconProps) {
  const s = effectivePurchaseOrderStatus(status);
  const color = PO_STATUS_COLOR[s];

  if (s === 'Verified') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.745 3.745 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
        />
      </svg>
    );
  }

  if (s === 'Received') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6m16 0v1a2 2 0 01-2 2H6a2 2 0 01-2-2v-1m16 0H4"
        />
        <path stroke={color} strokeWidth={2} strokeLinecap="round" d="M16 11V7a4 4 0 00-8 0v4" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  );
}

'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import type { PurchaseOrder } from '../types';
import { displayCategory, displayLine } from '../utils/merchandiseLabels';
import DashboardSalesSection from './dashboard/DashboardSalesSection';
import DashboardInventoryVisual from './dashboard/DashboardInventoryVisual';
import DashboardPurchaseOrdersVisual from './dashboard/DashboardPurchaseOrdersVisual';
import {
  dashboardCardLabelClass,
  dashboardGreetingClass,
  dashboardValueXlClass,
} from './dashboard/charts/chartTheme';

const iconStroke = { strokeWidth: 1.5 };

function IconSuppliers({ className = 'h-5 w-5 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function IconPurchaseOrder({ className = 'h-5 w-5 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function IconPackage({ className = 'h-5 w-5 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  );
}

function IconLayers({ className = 'h-5 w-5 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

function IconTrendUp({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function IconTrendDown({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    </svg>
  );
}

function IconTrendFlat({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}

function toJsDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') {
    const d = maybe.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function inSameCalendarMonth(d: Date, anchor: Date): boolean {
  return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
}

function countCreatedInMonth<T extends { createdAt?: unknown }>(items: T[], anchor: Date): number {
  return items.filter((item) => {
    const created = toJsDate(item.createdAt);
    return created !== null && inSameCalendarMonth(created, anchor);
  }).length;
}

function sumVerifiedInboundUnitsInMonth(orders: PurchaseOrder[], anchor: Date): number {
  return orders.reduce((sum, o) => {
    if (o.status !== 'Verified') return sum;
    const dt = toJsDate(o.verifiedDate) ?? toJsDate(o.createdAt);
    if (!dt || !inSameCalendarMonth(dt, anchor)) return sum;
    const q = o.quantityGood ?? o.quantityReceived ?? o.quantity ?? 0;
    return sum + (typeof q === 'number' && !Number.isNaN(q) ? q : 0);
  }, 0);
}

type MoMKind = 'up' | 'down' | 'flat' | 'new';

function monthOverMonth(thisMonth: number, lastMonth: number): { pct: number; kind: MoMKind } {
  if (thisMonth === 0 && lastMonth === 0) return { pct: 0, kind: 'flat' };
  if (lastMonth === 0 && thisMonth > 0) return { pct: 0, kind: 'new' };
  const raw = ((thisMonth - lastMonth) / lastMonth) * 100;
  if (Math.abs(raw) < 0.05) return { pct: 0, kind: 'flat' };
  return { pct: raw, kind: raw > 0 ? 'up' : 'down' };
}

function MetricMoMVariance({
  thisMonth,
  lastMonth,
  t,
  suffixKey = 'dashboard.varianceThisMonth',
}: {
  thisMonth: number;
  lastMonth: number;
  t: (key: string) => string;
  suffixKey?: string;
}) {
  const { pct, kind } = monthOverMonth(thisMonth, lastMonth);
  const suffix = t(suffixKey);

  let icon: ReactNode;
  let valueText: string;
  let colorClass: string;

  if (kind === 'new') {
    icon = <IconTrendUp className="h-4 w-4 text-emerald-700" />;
    valueText = t('dashboard.varianceNew');
    colorClass = 'text-emerald-800';
  } else if (kind === 'flat') {
    icon = <IconTrendFlat className="h-4 w-4 text-gray-400" />;
    valueText = '0.0%';
    colorClass = 'text-gray-500';
  } else if (kind === 'up') {
    icon = <IconTrendUp className="h-4 w-4 text-emerald-700" />;
    valueText = `+${pct.toFixed(1)}%`;
    colorClass = 'text-emerald-800';
  } else {
    icon = <IconTrendDown className="h-4 w-4 text-rose-700" />;
    valueText = `${pct.toFixed(1)}%`;
    colorClass = 'text-rose-800';
  }

  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-1.5 text-sm font-medium tabular-nums tracking-tight ${colorClass}`}
    >
      <span className="flex shrink-0 items-center" aria-hidden>
        {icon}
      </span>
      <span>{valueText}</span>
      <span className="font-normal text-gray-500">{suffix}</span>
    </div>
  );
}

const metricCardClass =
  'sasa-dashboard-panel rounded-2xl border border-gray-200/90 bg-white p-6 text-left';

export default function Dashboard() {
  const { suppliers, purchaseOrders, inventory } = useInventory();
  const { hasPermission, user } = useAuth();
  const { t } = useTranslation();

  const firstName =
    user?.name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || t('dashboard.greetingDefaultName');

  const [greetingLine, setGreetingLine] = useState(() =>
    t('dashboard.greetingMorning').replace('{name}', firstName)
  );
  const canViewSales = hasPermission('sales.view');

  useEffect(() => {
    const h = new Date().getHours();
    const tpl =
      h >= 5 && h < 12
        ? t('dashboard.greetingMorning')
        : h >= 12 && h < 17
          ? t('dashboard.greetingAfternoon')
          : t('dashboard.greetingEvening');
    setGreetingLine(tpl.replace('{name}', firstName));
  }, [t, firstName]);

  const getInventoryValueByCountry = () => {
    let ecuadorValue = 0;
    
    inventory.forEach(item => {
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
      
      if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return;
      if (!hasVerifiedOrder && !isStandaloneItem) return;
      
      const linkedOrders = purchaseOrders.filter(order => 
        item.linkedPurchaseOrders.includes(order.id) && order.status === 'Verified'
      );
      
      if (linkedOrders.length > 0) {
        const avgCost = linkedOrders.reduce((sum, order) => sum + order.costInUSD, 0) / linkedOrders.length;
        ecuadorValue += avgCost * item.ecuadorStock;
      }
    });
    
    return { ecuador: ecuadorValue, total: ecuadorValue };
  };

  const getEcuadorInventoryValue = () => {
    return getInventoryValueByCountry().ecuador;
  };

  const getEcuadorStock = () => {
    return inventory.reduce((sum, item) => {
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
      
      if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return sum;
      if (!hasVerifiedOrder && !isStandaloneItem) return sum;
      
      return sum + item.ecuadorStock;
    }, 0);
  };

  const getVerifiedInventoryCount = () => {
    return inventory.filter(item => {
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
      
      if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return false;
      
      return hasVerifiedOrder || isStandaloneItem;
    }).length;
  };

  const countVerifiedInventoryBy = (
    keyFn: (item: (typeof inventory)[0]) => string
  ): Record<string, number> => {
    const counts: Record<string, number> = {};
    inventory.forEach((item) => {
      const hasVerifiedOrder = item.linkedPurchaseOrders.some((orderId) => {
        const order = purchaseOrders.find((o) => o.id === orderId);
        return order && order.status === 'Verified';
      });
      const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
      if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return;
      if (!hasVerifiedOrder && !isStandaloneItem) return;
      const key = keyFn(item);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  };

  const getCategoryDistribution = () =>
    countVerifiedInventoryBy((item) => {
      const raw = item.category || t('dashboard.uncategorized');
      return raw === t('dashboard.uncategorized') ? raw : displayCategory(raw);
    });

  const getLineDistribution = () =>
    countVerifiedInventoryBy((item) => {
      const raw = item.line?.trim() || t('dashboard.noLine');
      return raw === t('dashboard.noLine') ? raw : displayLine(raw);
    });

  const now = new Date();
  const priorMonthAnchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const verifiedInventoryForMoM = inventory.filter((item) => {
    const hasVerifiedOrder = item.linkedPurchaseOrders.some((orderId) => {
      const order = purchaseOrders.find((o) => o.id === orderId);
      return order && order.status === 'Verified';
    });
    const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
    if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return false;
    return hasVerifiedOrder || isStandaloneItem;
  });

  const momSuppliersThis = countCreatedInMonth(suppliers, now);
  const momSuppliersLast = countCreatedInMonth(suppliers, priorMonthAnchor);
  const momPoThis = countCreatedInMonth(purchaseOrders, now);
  const momPoLast = countCreatedInMonth(purchaseOrders, priorMonthAnchor);
  const momInvThis = countCreatedInMonth(verifiedInventoryForMoM, now);
  const momVerifiedUnitsThis = sumVerifiedInboundUnitsInMonth(purchaseOrders, now);
  const momVerifiedUnitsLast = sumVerifiedInboundUnitsInMonth(purchaseOrders, priorMonthAnchor);

  const inventoryAddedThisMonthLabel =
    momInvThis === 0
      ? t('dashboard.inventoryAddedThisMonthZero')
      : momInvThis === 1
        ? t('dashboard.inventoryAddedThisMonthOne')
        : t('dashboard.inventoryAddedThisMonthMany').replace('{count}', String(momInvThis));

  const categoryEntries = Object.entries(getCategoryDistribution())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  const lineEntries = Object.entries(getLineDistribution())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  return (
    <div className="space-y-10 font-sans antialiased text-gray-900">
      <header className="pt-1">
        <h1 className={dashboardGreetingClass}>{greetingLine}</h1>
      </header>

      {/* Key metrics */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {hasPermission('suppliers.view') && (
          <div className={metricCardClass}>
            <div className="mb-4">
              <IconSuppliers className="h-5 w-5 text-gray-500" />
            </div>
            <p className={`mb-2 ${dashboardCardLabelClass}`}>{t('dashboard.totalSuppliers')}</p>
            <p className={dashboardValueXlClass}>{suppliers.length}</p>
            <MetricMoMVariance thisMonth={momSuppliersThis} lastMonth={momSuppliersLast} t={t} />
          </div>
        )}

        {hasPermission('purchase.view') && (
          <div className={metricCardClass}>
            <div className="mb-4">
              <IconPurchaseOrder className="h-5 w-5 text-gray-500" />
            </div>
            <p className={`mb-2 ${dashboardCardLabelClass}`}>{t('dashboard.purchaseOrders')}</p>
            <p className={dashboardValueXlClass}>{purchaseOrders.length}</p>
            <MetricMoMVariance thisMonth={momPoThis} lastMonth={momPoLast} t={t} />
          </div>
        )}

        <div className={metricCardClass}>
          <div className="mb-4">
            <IconPackage className="h-5 w-5 text-gray-500" />
          </div>
          <p className={`mb-2 ${dashboardCardLabelClass}`}>{t('dashboard.inventoryItems')}</p>
          <p className={dashboardValueXlClass}>{getVerifiedInventoryCount()}</p>
          <p
            className={`mt-2 text-sm font-medium tabular-nums ${
              momInvThis > 0 ? 'text-emerald-800' : 'text-gray-500'
            }`}
          >
            {inventoryAddedThisMonthLabel}
          </p>
        </div>

        <div className={metricCardClass}>
          <div className="mb-4">
            <IconLayers className="h-5 w-5 text-gray-500" />
          </div>
          <p className={`mb-2 ${dashboardCardLabelClass}`}>{t('dashboard.stockEcuador')}</p>
          <p className={dashboardValueXlClass}>{getEcuadorStock()}</p>
          <MetricMoMVariance
            thisMonth={momVerifiedUnitsThis}
            lastMonth={momVerifiedUnitsLast}
            t={t}
            suffixKey="dashboard.varianceStockSuffix"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <div className={hasPermission('purchase.view') ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <DashboardInventoryVisual
            t={t}
            inventoryValue={getEcuadorInventoryValue()}
            categoryEntries={categoryEntries}
            lineEntries={lineEntries}
            totalItems={getVerifiedInventoryCount()}
            showValue={hasPermission('costs.view')}
          />
        </div>

        {hasPermission('purchase.view') && (
          <DashboardPurchaseOrdersVisual t={t} purchaseOrders={purchaseOrders} />
        )}
      </div>

      {canViewSales && <DashboardSalesSection t={t} />}
    </div>
  );
}

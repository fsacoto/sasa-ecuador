'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import type { PurchaseOrder } from '../types';
import { displayCategory } from '../utils/merchandiseLabels';

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

function IconMapPin({ className = 'h-4 w-4 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/** Globe — “by country”; same 1.5 stroke weight as map pin / package icons. */
function IconGlobe({ className = 'h-5 w-5 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <circle cx="12" cy="12" r="10" strokeLinejoin="round" />
      <path strokeLinecap="round" d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path strokeLinecap="round" d="M2 12h20" />
    </svg>
  );
}

function IconChartBar({ className = 'h-4 w-4 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconTag({ className = 'h-4 w-4 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function IconChevronRight({ className = 'h-5 w-5 text-gray-400' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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

function IconAlertOutline({ className = 'h-5 w-5 text-gray-600' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

interface DashboardProps {
  onNavigate?: (tab: string, filters?: Record<string, any>) => void;
}

const metricCardClass =
  'rounded-2xl border border-gray-200/90 bg-white p-6 text-left transition-all duration-200 hover:border-gray-300 hover:shadow-sm';

export default function Dashboard({ onNavigate }: DashboardProps = {}) {
  const { suppliers, purchaseOrders, inventory } = useInventory();
  const { hasPermission, user } = useAuth();
  const { t } = useTranslation();

  const firstName =
    user?.name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || t('dashboard.greetingDefaultName');

  const [greetingLine, setGreetingLine] = useState(() =>
    t('dashboard.greetingMorning').replace('{name}', firstName)
  );

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

  const handleNavigate = (tab: string, filters?: Record<string, any>) => {
    if (onNavigate) {
      onNavigate(tab, filters);
    }
  };

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

  const getLowStockItems = () => {
    return inventory.filter(item => {
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
      
      if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return false;
      if (!hasVerifiedOrder && !isStandaloneItem) return false;
      
      return item.ecuadorStock <= 2;
    });
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

  const getOrderStatusDistribution = () => {
    const statusCounts = {
      'Pending': 0,
      'Verified': 0,
      'Shipped': 0,
      'Delivered': 0,
      'Cancelled': 0
    };
    
    purchaseOrders.forEach(order => {
      const status = order.status || 'Pending';
      if (status in statusCounts) {
        statusCounts[status as keyof typeof statusCounts]++;
      }
    });
    
    return statusCounts;
  };

  const getCategoryDistribution = () => {
    const categoryCounts: { [key: string]: number } = {};
    
    inventory.forEach(item => {
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
      
      if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return;
      if (!hasVerifiedOrder && !isStandaloneItem) return;
      
      const raw = item.category || t('dashboard.uncategorized');
      const category = raw === t('dashboard.uncategorized') ? raw : displayCategory(raw);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    return categoryCounts;
  };

  const lowStockItems = getLowStockItems();

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

  return (
    <div className="space-y-8 font-sans antialiased text-gray-900">
      <header className="pt-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{greetingLine}</h1>
      </header>

      {/* Key metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {hasPermission('suppliers.view') && (
          <button type="button" onClick={() => handleNavigate('suppliers')} className={`group cursor-pointer ${metricCardClass}`}>
            <div className="mb-4">
              <IconSuppliers className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
            </div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{t('dashboard.totalSuppliers')}</p>
            <p className="text-3xl font-semibold tabular-nums text-gray-900">{suppliers.length}</p>
            <MetricMoMVariance thisMonth={momSuppliersThis} lastMonth={momSuppliersLast} t={t} />
          </button>
        )}

        {hasPermission('purchase.view') && (
          <button type="button" onClick={() => handleNavigate('purchase-orders')} className={`group cursor-pointer ${metricCardClass}`}>
            <div className="mb-4">
              <IconPurchaseOrder className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
            </div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{t('dashboard.purchaseOrders')}</p>
            <p className="text-3xl font-semibold tabular-nums text-gray-900">{purchaseOrders.length}</p>
            <MetricMoMVariance thisMonth={momPoThis} lastMonth={momPoLast} t={t} />
          </button>
        )}

        <button type="button" onClick={() => handleNavigate('inventory')} className={`group cursor-pointer ${metricCardClass}`}>
          <div className="mb-4">
            <IconPackage className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
          </div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{t('dashboard.inventoryItems')}</p>
          <p className="text-3xl font-semibold tabular-nums text-gray-900">{getVerifiedInventoryCount()}</p>
          <p
            className={`mt-2 text-sm font-medium tabular-nums ${
              momInvThis > 0 ? 'text-emerald-800' : 'text-gray-500'
            }`}
          >
            {inventoryAddedThisMonthLabel}
          </p>
        </button>

        <button type="button" onClick={() => handleNavigate('inventory')} className={`group cursor-pointer ${metricCardClass}`}>
          <div className="mb-4">
            <IconLayers className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
          </div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{t('dashboard.stockEcuador')}</p>
          <p className="text-3xl font-semibold tabular-nums text-gray-900">{getEcuadorStock()}</p>
          <MetricMoMVariance
            thisMonth={momVerifiedUnitsThis}
            lastMonth={momVerifiedUnitsLast}
            t={t}
            suffixKey="dashboard.varianceStockSuffix"
          />
        </button>
      </div>

      {/* Low stock */}
      {lowStockItems.length > 0 && hasPermission('inventory.view') && (
        <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
                <IconAlertOutline className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-gray-900">{t('dashboard.lowStockAlert')}</h3>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  {lowStockItems.length} {lowStockItems.length === 1 ? t('dashboard.item') : t('dashboard.items')}{' '}
                  {t('dashboard.needAttention')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate('inventory', { filterLowStock: true })}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:border-gray-400 hover:bg-gray-50"
            >
              {t('dashboard.viewAll')}
              <IconChevronRight className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {lowStockItems.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate('inventory', { searchQuery: item.sku })}
                className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-left transition-all hover:border-gray-300 hover:bg-white"
              >
                <div className="mb-2">
                  <div className="truncate text-sm font-medium text-gray-900">{item.name}</div>
                  <div className="mt-1 text-xs tabular-nums text-gray-500">SKU: {item.sku}</div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200/80 pt-2">
                  <div className="text-sm font-semibold tabular-nums tracking-tight text-gray-900">
                    {item.ecuadorStock} {t('dashboard.units')}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {lowStockItems.length > 6 && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => handleNavigate('inventory', { filterLowStock: true })}
                className="text-sm font-medium text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
              >
                {t('dashboard.viewMoreItems')?.replace('{count}', String(lowStockItems.length - 6)) ||
                  `View ${lowStockItems.length - 6} more items`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stock y valor (solo Ecuador) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={() => handleNavigate('inventory')}
          className={`group text-left ${metricCardClass}`}
        >
          <div className="mb-4">
            <IconMapPin className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
          </div>
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-500">
            {t('dashboard.stockEcuador')}
          </p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-gray-900">{getEcuadorStock()}</p>
          <p className="mt-2 text-sm text-gray-500">{t('dashboard.totalUnits')}</p>
        </button>

        {hasPermission('costs.view') && (
          <button type="button" onClick={() => handleNavigate('landed-costs')} className={`group text-left ${metricCardClass}`}>
            <div className="mb-4">
              <IconGlobe className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
            </div>
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('dashboard.inventoryValue')}
            </p>
            <p className="text-4xl font-semibold tabular-nums tracking-tight text-gray-900">
              ${getEcuadorInventoryValue().toFixed(2)}
            </p>
            <p className="mt-2 text-sm text-gray-500">{t('dashboard.totalValueLabel')}</p>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hasPermission('purchase.view') && (
          <div className={`${metricCardClass} cursor-default`}>
            <div className="mb-4">
              <IconChartBar className="h-5 w-5 text-gray-500" />
            </div>
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('dashboard.orderStatusDistribution')}
            </p>

            <div className="space-y-3">
              {Object.entries(getOrderStatusDistribution()).map(([status, count], i) => {
                const total = purchaseOrders.length;
                const percentage = total > 0 ? (count / total) * 100 : 0;
                const barTones = ['bg-zinc-500', 'bg-zinc-400', 'bg-zinc-600', 'bg-zinc-300', 'bg-zinc-700'];
                const barClass = barTones[i % barTones.length];
                const statusTranslations: { [key: string]: string } = {
                  Pending: t('dashboard.pending'),
                  Verified: t('dashboard.verified'),
                  Shipped: t('dashboard.shipped'),
                  Delivered: t('dashboard.delivered'),
                  Cancelled: t('dashboard.cancelled'),
                };

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => handleNavigate('purchase-orders', { filterStatus: status })}
                    className="group w-full rounded-lg p-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 transition-colors group-hover:text-gray-900">
                        {statusTranslations[status] || status}
                      </span>
                      <span className="text-sm font-semibold tabular-nums tracking-tight text-gray-900">
                        {isNaN(count) ? 0 : count}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${barClass}`}
                        style={{ width: `${isNaN(percentage) ? 0 : percentage}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={`${metricCardClass} cursor-default`}>
          <div className="mb-4">
            <IconTag className="h-5 w-5 text-gray-500" />
          </div>
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-500">
            {t('dashboard.inventoryByCategory')}
          </p>

          <div className="space-y-3">
            {Object.entries(getCategoryDistribution()).map(([category, count]) => {
              const total = getVerifiedInventoryCount();
              const percentage = total > 0 ? (count / total) * 100 : 0;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleNavigate('inventory', { filterCategory: category })}
                  className="group w-full rounded-lg p-2 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600 transition-colors group-hover:text-gray-900">{category}</span>
                    <span className="text-sm font-semibold tabular-nums tracking-tight text-gray-900">
                      {isNaN(count) ? 0 : count}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100">
                    <div
                      className="h-1.5 rounded-full bg-zinc-500 transition-all duration-500"
                      style={{ width: `${isNaN(percentage) ? 0 : percentage}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

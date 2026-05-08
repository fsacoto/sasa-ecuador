'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from './context/AuthContext';
import { useTranslation } from './context/TranslationContext';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import Suppliers from './components/Suppliers';
import PurchaseOrders from './components/PurchaseOrders';
import Inventory from './components/Inventory';
import LandedCosts from './components/LandedCosts';
import CMSModule from './components/CMSModuleNew';
import Clients from './components/Clients';
import Sales from './components/Sales';
import InvoiceTracking from './components/InvoiceTracking';
import Consignments from './components/Consignments';

type Tab =
  | 'dashboard'
  | 'inventory-suite'
  | 'suppliers'
  | 'purchase-orders'
  | 'inventory'
  | 'landed-costs'
  | 'cms'
  | 'sales-suite'
  | 'clients'
  | 'sales'
  | 'invoice-tracking'
  | 'consignments';

/** Extra English keywords so search still matches common terms under any UI language */
const TAB_SEARCH_ALIASES: Partial<Record<Tab, string>> = {
  dashboard: 'home overview main metrics',
  suppliers: 'supplier vendors vendor sourcing',
  'purchase-orders': 'purchase order orders po buying procurement',
  inventory: 'inventory stock sku skus product products items warehouse ecuador',
  'landed-costs': 'landed cost costs shipping freight logistics import',
  cms: 'cms content media marketing website catalog',
  clients: 'clients customers contacts accounts crm',
  sales: 'sales invoices invoice orders revenue',
  'invoice-tracking': 'invoice invoices ar receivable tracking payments',
  consignments: 'consignment consign consigned',
};

type NavSearchEntry = { tab: Tab; title: string; path: string; haystack: string };

/** Active indicator (inset left bar) — SASA pink */
const SIDEBAR_ACCENT = '#515151';
/** Expanded sidebar width — compact */
const SIDEBAR_EXPANDED_PX = 192;

function IconDashboard({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

function IconCMS({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconWarehouse({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconTruck({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10h10zm0 0h2.586a1 1 0 00.707-.293l2.414-2.414a1 1 0 00.293-.707V9a1 1 0 00-1-1h-1m-8 0H7" />
    </svg>
  );
}

function IconClipboard({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function IconCube({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function IconCalculator({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function IconTrending({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function IconUsers({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function IconShopping({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function IconDocument({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconArchive({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  );
}

function IconChevronLeft({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevronDown({ className = 'w-4 h-4 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function IconSearch({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconUserOutline({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

const INVENTORY_TABS: Tab[] = ['suppliers', 'purchase-orders', 'inventory', 'landed-costs'];
const SALES_TABS: Tab[] = ['clients', 'sales', 'invoice-tracking', 'consignments'];

function AppContent() {
  const { user, logout, hasPermission, isLoading } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>(user?.role === 'marketing' ? 'cms' : 'dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [salesOpen, setSalesOpen] = useState(true);
  const [suiteFlyout, setSuiteFlyout] = useState<'inventory-suite' | 'sales-suite' | null>(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [navSearchQuery, setNavSearchQuery] = useState('');
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const [navSearchHighlight, setNavSearchHighlight] = useState(0);
  const navSearchRef = useRef<HTMLDivElement>(null);
  const navSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.role === 'marketing' && activeTab !== 'cms') {
      setActiveTab('cms');
    } else if (user?.role !== 'marketing' && activeTab === 'cms' && !hasPermission('cms.view')) {
      setActiveTab('dashboard');
    }
  }, [user?.role, activeTab, hasPermission]);

  useEffect(() => {
    if (INVENTORY_TABS.includes(activeTab)) setInventoryOpen(true);
    if (SALES_TABS.includes(activeTab)) setSalesOpen(true);
  }, [activeTab]);

  useEffect(() => {
    if (!suiteFlyout) return;
    const close = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setSuiteFlyout(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [suiteFlyout]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!navSearchOpen) return;
    const close = (e: MouseEvent) => {
      if (navSearchRef.current && !navSearchRef.current.contains(e.target as Node)) {
        setNavSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [navSearchOpen]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f9f9]">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#515151] mx-auto"
            aria-hidden
          />
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const getTabs = () => {
    if (user?.role === 'marketing') {
      return [{ id: 'cms' as Tab, label: t('navigation.cms'), permission: 'cms.view' }];
    }

    const baseTabs: { id: Tab; label: string; permission: string }[] = [
      { id: 'dashboard', label: t('navigation.dashboard'), permission: 'inventory.view' },
    ];

    if (user?.role === 'sales') {
      baseTabs.push(
        { id: 'inventory', label: t('navigation.inventoryEC'), permission: 'inventory.view.ecuador' },
        { id: 'clients', label: t('navigation.clients'), permission: 'clients.view.ecuador' },
        { id: 'sales', label: t('navigation.sales'), permission: 'sales.view' },
        { id: 'invoice-tracking', label: t('navigation.invoiceTracking'), permission: 'sales.view' }
      );
    } else {
      if (hasPermission('cms.view')) {
        baseTabs.push({ id: 'cms', label: t('navigation.cms'), permission: 'cms.view' });
      }
      if (
        hasPermission('inventory.view') ||
        hasPermission('suppliers.view') ||
        hasPermission('purchase.view') ||
        hasPermission('costs.view')
      ) {
        baseTabs.push({
          id: 'inventory-suite',
          label: t('navigation.inventorySuite'),
          permission: 'inventory.view',
        });
      }
      if (hasPermission('clients.view') || hasPermission('sales.view')) {
        baseTabs.push({
          id: 'sales-suite',
          label: t('navigation.salesSuite'),
          permission: 'sales.view',
        });
      }
    }

    return baseTabs.filter((tab) => hasPermission(tab.permission));
  };

  const tabs = getTabs();

  const isInventoryActive = INVENTORY_TABS.includes(activeTab);
  const isSalesActive = SALES_TABS.includes(activeTab);

  type SubNavItem = { id: Tab; label: string; IconEl: typeof IconTruck; visible: boolean };

  const inventorySubItems: SubNavItem[] = [
    { id: 'suppliers' as Tab, label: t('navigation.suppliers'), IconEl: IconTruck, visible: hasPermission('suppliers.view') },
    {
      id: 'purchase-orders' as Tab,
      label: t('navigation.purchaseOrders'),
      IconEl: IconClipboard,
      visible: hasPermission('purchase.view'),
    },
    {
      id: 'inventory' as Tab,
      label: t('navigation.inventory'),
      IconEl: IconCube,
      visible: hasPermission('inventory.view') || hasPermission('inventory.view.ecuador'),
    },
    {
      id: 'landed-costs' as Tab,
      label: t('navigation.landedCosts'),
      IconEl: IconCalculator,
      visible: hasPermission('costs.view'),
    },
  ].filter((item) => item.visible);

  const salesSubItems: SubNavItem[] = [
    {
      id: 'clients' as Tab,
      label: t('navigation.clients'),
      IconEl: IconUsers,
      visible: hasPermission('clients.view') || hasPermission('clients.view.ecuador'),
    },
    { id: 'sales' as Tab, label: t('navigation.sales'), IconEl: IconShopping, visible: hasPermission('sales.view') },
    {
      id: 'invoice-tracking' as Tab,
      label: t('navigation.invoiceTracking'),
      IconEl: IconDocument,
      visible: hasPermission('sales.view') || hasPermission('sales.invoice.create'),
    },
    {
      id: 'consignments' as Tab,
      label: t('navigation.consignments'),
      IconEl: IconArchive,
      visible: hasPermission('sales.view') || hasPermission('sales.create'),
    },
  ].filter((item) => item.visible);

  const invSuiteLabel = t('navigation.inventorySuite');
  const salesSuiteLabel = t('navigation.salesSuite');

  const navSearchEntries: NavSearchEntry[] = (() => {
    const out: NavSearchEntry[] = [];
    const pushEntry = (tab: Tab, title: string, path: string) => {
      const alias = TAB_SEARCH_ALIASES[tab] ?? '';
      const haystack = `${path} ${title} ${alias}`.toLowerCase().replace(/\s+/g, ' ');
      out.push({ tab, title, path, haystack });
    };
    for (const tab of tabs) {
      if (tab.id === 'inventory-suite') {
        for (const item of inventorySubItems) {
          pushEntry(item.id, item.label, `${invSuiteLabel} › ${item.label}`);
        }
      } else if (tab.id === 'sales-suite') {
        for (const item of salesSubItems) {
          pushEntry(item.id, item.label, `${salesSuiteLabel} › ${item.label}`);
        }
      } else {
        pushEntry(tab.id, tab.label, tab.label);
      }
    }
    return out;
  })();

  const navSearchQueryNorm = navSearchQuery.trim().toLowerCase();
  const navSearchResults =
    navSearchQueryNorm.length === 0
      ? []
      : navSearchEntries.filter((e) => e.haystack.includes(navSearchQueryNorm));

  const navSearchHi =
    navSearchResults.length === 0
      ? 0
      : Math.min(navSearchHighlight, navSearchResults.length - 1);

  const applyNavSearch = (entry: NavSearchEntry) => {
    setActiveTab(entry.tab);
    setNavSearchQuery('');
    setNavSearchOpen(false);
    setNavSearchHighlight(0);
    setSuiteFlyout(null);
    navSearchInputRef.current?.blur();
  };

  const navButtonClass = (active: boolean) =>
    `relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ${
      active ? 'bg-gray-100 text-[#515151]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`;

  const subButtonClass = (active: boolean) =>
    `relative flex w-full items-center gap-1.5 rounded py-1 pl-2 pr-1.5 text-left text-[11px] leading-snug font-normal transition-colors ${
      active ? 'bg-gray-50 text-[#515151]' : 'text-gray-500 hover:bg-gray-50/80 hover:text-gray-800'
    }`;

  const sidebarWidth = sidebarCollapsed ? 72 : SIDEBAR_EXPANDED_PX;

  const renderFlyout = (
    suite: 'inventory-suite' | 'sales-suite',
    items: { id: Tab; label: string; IconEl: typeof IconTruck }[]
  ) => {
    if (!sidebarCollapsed || suiteFlyout !== suite) return null;
    return (
      <div
        ref={flyoutRef}
        className="fixed z-[60] w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        style={{ left: sidebarWidth, top: Math.max(16, flyoutTop) }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActiveTab(item.id);
              setSuiteFlyout(null);
            }}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
              activeTab === item.id ? 'bg-gray-100 font-medium text-[#515151]' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <item.IconEl className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[#f9f9f9]">
      <aside
        className="flex min-h-0 shrink-0 flex-col border-r border-gray-200 bg-white text-gray-700 transition-[width] duration-200 ease-out"
        style={{ width: sidebarWidth }}
      >
        <div
          className={`flex h-12 shrink-0 items-center border-b border-gray-200 ${sidebarCollapsed ? 'justify-center px-1' : 'gap-2 px-2'}`}
        >
          <Image
            src="/sasa.png"
            alt="SASA"
            width={100}
            height={33}
            className={`w-auto object-contain ${sidebarCollapsed ? 'h-6 max-w-[36px]' : 'h-7 max-w-[88px]'}`}
            priority
          />
          {!sidebarCollapsed && (
            <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {t('common.businessHub')}
            </span>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-3">
          {tabs.map((tab) => {
            if (tab.id === 'inventory-suite') {
              return (
                <div key={tab.id} className="relative">
                  <button
                    type="button"
                    title={sidebarCollapsed ? tab.label : undefined}
                    onClick={(e) => {
                      if (sidebarCollapsed) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setFlyoutTop(rect.top);
                        setSuiteFlyout((s) => (s === 'inventory-suite' ? null : 'inventory-suite'));
                      } else {
                        setInventoryOpen((o) => !o);
                      }
                    }}
                    className={`${navButtonClass(isInventoryActive)} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                    style={
                      isInventoryActive
                        ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` }
                        : undefined
                    }
                  >
                    <IconWarehouse className="h-4 w-4 shrink-0 text-gray-500" />
                    {!sidebarCollapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>
                        <IconChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${inventoryOpen ? 'rotate-180' : ''}`}
                        />
                      </>
                    )}
                  </button>
                  {!sidebarCollapsed && inventoryOpen && (
                    <div className="mt-0.5 space-y-0 border-l border-gray-200 pl-1.5 ml-2.5">
                      {inventorySubItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={subButtonClass(activeTab === item.id)}
                          style={
                            activeTab === item.id
                              ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` }
                              : undefined
                          }
                        >
                          <item.IconEl className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span className="min-w-0 truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {renderFlyout('inventory-suite', inventorySubItems)}
                </div>
              );
            }
            if (tab.id === 'sales-suite') {
              return (
                <div key={tab.id} className="relative">
                  <button
                    type="button"
                    title={sidebarCollapsed ? tab.label : undefined}
                    onClick={(e) => {
                      if (sidebarCollapsed) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setFlyoutTop(rect.top);
                        setSuiteFlyout((s) => (s === 'sales-suite' ? null : 'sales-suite'));
                      } else {
                        setSalesOpen((o) => !o);
                      }
                    }}
                    className={`${navButtonClass(isSalesActive)} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                    style={
                      isSalesActive
                        ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` }
                        : undefined
                    }
                  >
                    <IconTrending className="h-4 w-4 shrink-0 text-gray-500" />
                    {!sidebarCollapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>
                        <IconChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${salesOpen ? 'rotate-180' : ''}`}
                        />
                      </>
                    )}
                  </button>
                  {!sidebarCollapsed && salesOpen && (
                    <div className="mt-0.5 space-y-0 border-l border-gray-200 pl-1.5 ml-2.5">
                      {salesSubItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={subButtonClass(activeTab === item.id)}
                          style={
                            activeTab === item.id
                              ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` }
                              : undefined
                          }
                        >
                          <item.IconEl className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span className="min-w-0 truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {renderFlyout('sales-suite', salesSubItems)}
                </div>
              );
            }

            const leafActive = activeTab === tab.id;
            const LeafIcon =
              tab.id === 'dashboard'
                ? IconDashboard
                : tab.id === 'cms'
                  ? IconCMS
                  : tab.id === 'inventory'
                    ? IconCube
                    : tab.id === 'clients'
                      ? IconUsers
                      : tab.id === 'sales'
                        ? IconShopping
                        : tab.id === 'invoice-tracking'
                          ? IconDocument
                          : IconDashboard;

            return (
              <button
                key={tab.id}
                type="button"
                title={sidebarCollapsed ? tab.label : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={`${navButtonClass(leafActive)} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                style={leafActive ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` } : undefined}
              >
                <LeafIcon className="h-4 w-4 shrink-0 text-gray-500" />
                {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-gray-200 px-1.5 py-2">
          <button
            type="button"
            onClick={() => {
              setSidebarCollapsed((c) => !c);
              setSuiteFlyout(null);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
            title={sidebarCollapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
          >
            <IconChevronLeft className={`h-4 w-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
            {!sidebarCollapsed && <span className="truncate">{t('common.collapseSidebar')}</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 lg:px-5">
          <div ref={navSearchRef} className="relative min-w-0 max-w-xl flex-1">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              ref={navSearchInputRef}
              type="search"
              value={navSearchQuery}
              placeholder={t('common.searchPlaceholder')}
              autoComplete="off"
              aria-expanded={navSearchOpen}
              aria-controls="nav-search-results"
              aria-activedescendant={
                navSearchOpen && navSearchResults[navSearchHi] ? `nav-search-opt-${navSearchHi}` : undefined
              }
              onChange={(e) => {
                const v = e.target.value;
                setNavSearchQuery(v);
                setNavSearchHighlight(0);
                setNavSearchOpen(v.trim().length > 0);
              }}
              onFocus={() => {
                if (navSearchQuery.trim().length > 0) setNavSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setNavSearchOpen(false);
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (navSearchResults.length === 0) return;
                  setNavSearchOpen(true);
                  setNavSearchHighlight((h) => Math.min(h + 1, navSearchResults.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (navSearchResults.length === 0) return;
                  setNavSearchOpen(true);
                  setNavSearchHighlight((h) => Math.max(h - 1, 0));
                  return;
                }
                if (e.key === 'Enter') {
                  const pick = navSearchResults[navSearchHi];
                  if (pick) {
                    e.preventDefault();
                    applyNavSearch(pick);
                  }
                }
              }}
              className="w-full rounded-full border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs text-gray-800 placeholder:text-gray-400 focus:border-[#515151]/40 focus:outline-none focus:ring-1 focus:ring-[#515151]/25"
              aria-label={t('common.searchPlaceholder')}
            />

            {navSearchOpen && navSearchQueryNorm.length > 0 && (
              <div
                id="nav-search-results"
                className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                role="listbox"
                aria-label={t('common.searchPlaceholder')}
              >
                {navSearchResults.length === 0 ? (
                  <p className="px-3 py-2.5 text-center text-xs text-gray-500">{t('common.searchNoResults')}</p>
                ) : (
                  navSearchResults.map((entry, idx) => (
                    <button
                      key={`${entry.tab}-${entry.path}-${idx}`}
                      type="button"
                      id={`nav-search-opt-${idx}`}
                      role="option"
                      aria-selected={idx === navSearchHi}
                      onMouseEnter={() => setNavSearchHighlight(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyNavSearch(entry)}
                      className={`flex w-full flex-col items-start gap-0.5 border-0 px-3 py-2 text-left transition-colors ${
                        idx === navSearchHi ? 'bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xs font-semibold text-gray-900">{entry.title}</span>
                      <span className="text-[10px] leading-snug text-gray-500">
                        <span className="font-medium text-gray-400">{t('common.searchLocation')}: </span>
                        {entry.path}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div ref={userMenuRef} className="relative ml-auto shrink-0">
            <button
              type="button"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setUserMenuOpen((o) => !o);
                setSuiteFlyout(null);
              }}
              className="flex max-w-[min(100vw-5rem,280px)] items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-300 text-gray-700">
                <IconUserOutline className="h-4 w-4" />
              </div>
              <div className="hidden min-w-0 items-center gap-2 sm:flex">
                <span className="truncate text-xs font-bold text-gray-900">{user.name}</span>
                <span
                  className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold capitalize leading-none text-gray-600"
                  title={user.role}
                >
                  {user.role}
                </span>
              </div>
              <IconChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {userMenuOpen && (
              <div
                className="absolute right-0 top-full z-[70] mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                role="menu"
              >
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('language.selectLanguage')}
                </p>
                {(
                  [
                    { code: 'en' as const, name: t('language.english') },
                    { code: 'es' as const, name: t('language.spanish') },
                  ] as const
                ).map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLocale(lang.code);
                      setUserMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                      locale === lang.code
                        ? 'bg-gray-50 font-medium text-[#515151]'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{lang.name}</span>
                    {locale === lang.code && (
                      <svg className="ml-auto h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
                <div className="my-1 border-t border-gray-100" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-red-50 hover:text-red-800"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  {t('common.logout')}
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            {activeTab === 'dashboard' && user?.role !== 'marketing' && (
              <Dashboard
                onNavigate={(tab, filters) => {
                  setActiveTab(tab as Tab);
                  if (filters) {
                    sessionStorage.setItem(`dashboardFilters_${tab}`, JSON.stringify(filters));
                  }
                }}
              />
            )}
            {activeTab === 'suppliers' && hasPermission('suppliers.view') && <Suppliers />}
            {activeTab === 'purchase-orders' && hasPermission('purchase.view') && <PurchaseOrders />}
            {activeTab === 'inventory' &&
              (hasPermission('inventory.view') || hasPermission('inventory.view.ecuador')) && <Inventory />}
            {activeTab === 'landed-costs' && hasPermission('costs.view') && <LandedCosts />}
            {activeTab === 'cms' && hasPermission('cms.view') && <CMSModule />}
            {activeTab === 'clients' &&
              (hasPermission('clients.view') || hasPermission('clients.view.ecuador')) && <Clients />}
            {activeTab === 'sales' && hasPermission('sales.view') && <Sales />}
            {activeTab === 'invoice-tracking' && hasPermission('sales.view') && <InvoiceTracking />}
            {activeTab === 'consignments' &&
              (hasPermission('sales.view') || hasPermission('sales.create')) && <Consignments />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Home() {
  return <AppContent />;
}

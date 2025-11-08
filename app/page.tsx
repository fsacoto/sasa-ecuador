'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from './context/AuthContext';
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

type Tab = 'dashboard' | 'inventory-suite' | 'suppliers' | 'purchase-orders' | 'inventory' | 'landed-costs' | 'cms' | 'sales-suite' | 'clients' | 'sales' | 'invoice-tracking';

function AppContent() {
  const { user, logout, hasPermission, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showSalesDropdown, setShowSalesDropdown] = useState(false);
  const [showInventoryDropdown, setShowInventoryDropdown] = useState(false);

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4f0c1b] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return <LoginForm />;
  }

  // Define tabs based on user role
  const getTabs = () => {
    const baseTabs = [
      { id: 'dashboard' as Tab, label: 'Dashboard', permission: 'inventory.view' },
    ];

    // Sales role specific tabs
    if (user?.role === 'sales') {
      baseTabs.push(
        { id: 'inventory' as Tab, label: 'Inventory (EC)', permission: 'inventory.view.ecuador' },
        { id: 'clients' as Tab, label: 'Clients', permission: 'clients.view.ecuador' },
        { id: 'sales' as Tab, label: 'Sales / Invoice', permission: 'sales.view' },
        { id: 'invoice-tracking' as Tab, label: 'Invoice Tracking', permission: 'sales.view' }
      );
    } else {
      // Admin and marketing roles
      if (hasPermission('cms.view')) {
        baseTabs.push({ id: 'cms' as Tab, label: 'CMS', permission: 'cms.view' });
      }
      
      // Add Inventory & Supply group for admin role
      if (hasPermission('inventory.view') || hasPermission('suppliers.view') || hasPermission('purchase.view') || hasPermission('costs.view')) {
        baseTabs.push({ id: 'inventory-suite' as Tab, label: 'Inventory & Supply', permission: 'inventory.view' });
      }

      // Add Sales & Invoicing group for admin role
      if (hasPermission('clients.view') || hasPermission('sales.view')) {
        baseTabs.push({ id: 'sales-suite' as Tab, label: 'Sales & Invoicing', permission: 'sales.view' });
      }
    }

    return baseTabs.filter(tab => hasPermission(tab.permission));
  };

  const tabs = getTabs();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <Image 
                src="/sasa.png" 
                alt="SASA Logo" 
                width={100} 
                height={33}
                className="h-8 w-auto"
                priority
              />
              <div className="h-6 w-px bg-gray-200"></div>
              <h1 className="text-sm font-medium text-gray-900">Business Hub</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{user?.name}</div>
                <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
              tab.id === 'inventory-suite' ? (
                <div key={tab.id} className="relative" onMouseEnter={() => setShowInventoryDropdown(true)} onMouseLeave={() => setShowInventoryDropdown(false)}>
                  <button
                    onClick={() => {/* Keep dropdown open on click */}}
                    className={`relative px-1 py-4 text-sm font-medium transition-colors ${
                      (activeTab === 'suppliers' || activeTab === 'purchase-orders' || activeTab === 'inventory' || activeTab === 'landed-costs')
                        ? 'text-[#4f0c1b]'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                    {(activeTab === 'suppliers' || activeTab === 'purchase-orders' || activeTab === 'inventory' || activeTab === 'landed-costs') && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4f0c1b]" />
                    )}
                  </button>
                  
                  {/* Dropdown Menu */}
                  {showInventoryDropdown && (
                    <div className="absolute top-full left-0 mt-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[200px]">
                      {hasPermission('suppliers.view') && (
                        <button
                          onClick={() => {
                            setActiveTab('suppliers' as Tab);
                            setShowInventoryDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Suppliers
                        </button>
                      )}
                      {hasPermission('purchase.view') && (
                        <button
                          onClick={() => {
                            setActiveTab('purchase-orders' as Tab);
                            setShowInventoryDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Purchase Orders
                        </button>
                      )}
                      {hasPermission('inventory.view') && (
                        <button
                          onClick={() => {
                            setActiveTab('inventory' as Tab);
                            setShowInventoryDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Inventory
                        </button>
                      )}
                      {hasPermission('costs.view') && (
                        <button
                          onClick={() => {
                            setActiveTab('landed-costs' as Tab);
                            setShowInventoryDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Landed Costs
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : tab.id === 'sales-suite' ? (
                <div key={tab.id} className="relative" onMouseEnter={() => setShowSalesDropdown(true)} onMouseLeave={() => setShowSalesDropdown(false)}>
                  <button
                    onClick={() => {/* Keep dropdown open on click */}}
                    className={`relative px-1 py-4 text-sm font-medium transition-colors ${
                      (activeTab === 'clients' || activeTab === 'sales' || activeTab === 'invoice-tracking')
                        ? 'text-[#4f0c1b]'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                    {(activeTab === 'clients' || activeTab === 'sales' || activeTab === 'invoice-tracking') && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4f0c1b]" />
                    )}
                  </button>
                  
                  {/* Dropdown Menu */}
                  {showSalesDropdown && (
                    <div className="absolute top-full left-0 mt-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[200px]">
                      {(hasPermission('clients.view') || hasPermission('clients.view.ecuador')) && (
                        <button
                          onClick={() => {
                            setActiveTab('clients' as Tab);
                            setShowSalesDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Clients
                        </button>
                      )}
                      {(hasPermission('sales.view') || hasPermission('sales.create')) && (
                        <button
                          onClick={() => {
                            setActiveTab('sales' as Tab);
                            setShowSalesDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Sales / Invoice
                        </button>
                      )}
                      {(hasPermission('sales.view') || hasPermission('sales.invoice.create')) && (
                        <button
                          onClick={() => {
                            setActiveTab('invoice-tracking' as Tab);
                            setShowSalesDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Invoice Tracking
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-1 py-4 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-[#4f0c1b]'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4f0c1b]" />
                  )}
                </button>
              )
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'suppliers' && hasPermission('suppliers.view') && <Suppliers />}
        {activeTab === 'purchase-orders' && hasPermission('purchase.view') && <PurchaseOrders />}
        {activeTab === 'inventory' && (hasPermission('inventory.view') || hasPermission('inventory.view.ecuador')) && <Inventory />}
        {activeTab === 'landed-costs' && hasPermission('costs.view') && <LandedCosts />}
        {activeTab === 'cms' && hasPermission('cms.view') && <CMSModule />}
        {activeTab === 'clients' && (hasPermission('clients.view') || hasPermission('clients.view.ecuador')) && <Clients />}
        {activeTab === 'sales' && hasPermission('sales.view') && <Sales />}
        {activeTab === 'invoice-tracking' && hasPermission('sales.view') && <InvoiceTracking />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
          <p className="text-center text-xs text-gray-500">
            © {new Date().getFullYear()} SASA Jewelry. All rights reserved.
          </p>
          <p className="text-center text-xs text-gray-400 mt-2">
            Exchange rates by{' '}
            <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600">
              Exchange Rate API
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return <AppContent />;
}
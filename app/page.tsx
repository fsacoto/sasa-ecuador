'use client';

import { useState } from 'react';
import Image from 'next/image';
import Dashboard from './components/Dashboard';
import Suppliers from './components/Suppliers';
import PurchaseOrders from './components/PurchaseOrders';
import Inventory from './components/Inventory';
import LandedCosts from './components/LandedCosts';

type Tab = 'dashboard' | 'suppliers' | 'purchase-orders' | 'inventory' | 'landed-costs';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Dashboard' },
    { id: 'suppliers' as Tab, label: 'Suppliers' },
    { id: 'purchase-orders' as Tab, label: 'Purchase Orders' },
    { id: 'inventory' as Tab, label: 'Inventory' },
    { id: 'landed-costs' as Tab, label: 'Landed Costs' },
  ];

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
              <h1 className="text-sm font-medium text-gray-900">Inventory Management</h1>
            </div>
            <div className="text-xs text-gray-500 font-medium">
              {new Date().toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
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
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'suppliers' && <Suppliers />}
        {activeTab === 'purchase-orders' && <PurchaseOrders />}
        {activeTab === 'inventory' && <Inventory />}
        {activeTab === 'landed-costs' && <LandedCosts />}
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
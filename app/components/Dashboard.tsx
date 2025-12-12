'use client';

import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';

interface DashboardProps {
  onNavigate?: (tab: string, filters?: Record<string, any>) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps = {}) {
  const { suppliers, purchaseOrders, inventory } = useInventory();
  const { hasPermission } = useAuth();
  const { t } = useTranslation();

  const handleNavigate = (tab: string, filters?: Record<string, any>) => {
    if (onNavigate) {
      onNavigate(tab, filters);
    }
  };

  const getInventoryValueByCountry = () => {
    let ecuadorValue = 0;
    let usaValue = 0;
    
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
        usaValue += avgCost * item.usaStock;
      }
    });
    
    return { ecuador: ecuadorValue, usa: usaValue, total: ecuadorValue + usaValue };
  };

  const getTotalInventoryValue = () => {
    return getInventoryValueByCountry().total;
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

  const getUSAStock = () => {
    return inventory.reduce((sum, item) => {
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
      
      if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return sum;
      if (!hasVerifiedOrder && !isStandaloneItem) return sum;
      
      return sum + item.usaStock;
    }, 0);
  };

  const getTotalStock = () => {
    return inventory.reduce((sum, item) => {
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      const isStandaloneItem = item.linkedPurchaseOrders.length === 0;
      
      if (item.linkedPurchaseOrders.length > 0 && !hasVerifiedOrder) return sum;
      if (!hasVerifiedOrder && !isStandaloneItem) return sum;
      
      return sum + item.ecuadorStock + item.usaStock;
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
      
      return (item.ecuadorStock + item.usaStock) < 10;
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
      
      const category = item.category || t('dashboard.uncategorized');
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    return categoryCounts;
  };

  const lowStockItems = getLowStockItems();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t('dashboard.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('dashboard.overview')}</p>
      </div>

      {/* Key Metrics - Clickable Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {hasPermission('suppliers.view') && (
          <button
            onClick={() => handleNavigate('suppliers')}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-[#4f0c1b] transition-all duration-200 text-left cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-[#4f0c1b] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('dashboard.totalSuppliers')}</div>
              <div className="text-3xl font-bold text-gray-900">{suppliers.length}</div>
            </div>
          </button>
        )}
        
        {hasPermission('purchase.view') && (
          <button
            onClick={() => handleNavigate('purchase-orders')}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-[#4f0c1b] transition-all duration-200 text-left cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-[#4f0c1b] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('dashboard.purchaseOrders')}</div>
              <div className="text-3xl font-bold text-gray-900">{purchaseOrders.length}</div>
            </div>
          </button>
        )}
        
        <button
          onClick={() => handleNavigate('inventory')}
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-[#4f0c1b] transition-all duration-200 text-left cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-400 group-hover:text-[#4f0c1b] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('dashboard.inventoryItems')}</div>
            <div className="text-3xl font-bold text-gray-900">{getVerifiedInventoryCount()}</div>
          </div>
        </button>
        
        <button
          onClick={() => handleNavigate('inventory')}
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-[#4f0c1b] transition-all duration-200 text-left cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
              <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-400 group-hover:text-[#4f0c1b] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('dashboard.totalStock')}</div>
            <div className="text-3xl font-bold text-gray-900">{getTotalStock()}</div>
          </div>
        </button>
      </div>

      {/* Low Stock Alert - Prominent and Clickable */}
      {lowStockItems.length > 0 && hasPermission('inventory.view') && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border-2 border-amber-300 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-amber-900">{t('dashboard.lowStockAlert')}</h3>
                <p className="text-sm text-amber-700">{lowStockItems.length} {lowStockItems.length === 1 ? t('dashboard.item') : t('dashboard.items')} {t('dashboard.needAttention')}</p>
              </div>
            </div>
            <button
              onClick={() => handleNavigate('inventory', { filterLowStock: true })}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium text-sm flex items-center gap-2"
            >
              {t('dashboard.viewAll')}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStockItems.slice(0, 6).map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigate('inventory', { searchQuery: item.sku })}
                className="bg-white rounded-lg border border-amber-200 p-4 hover:border-amber-400 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate group-hover:text-[#4f0c1b] transition-colors">{item.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-1">SKU: {item.sku}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="text-sm font-bold text-amber-600">
                    {item.ecuadorStock + item.usaStock} {t('dashboard.units')}
                  </div>
                  <div className="text-xs text-gray-500">
                    EC: {item.ecuadorStock} · USA: {item.usaStock}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {lowStockItems.length > 6 && (
            <div className="mt-4 text-center">
              <button
                onClick={() => handleNavigate('inventory', { filterLowStock: true })}
                className="text-sm text-amber-700 hover:text-amber-900 font-medium underline"
              >
                {t('dashboard.viewMoreItems', { count: lowStockItems.length - 6 })}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Charts and Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stock by Location - Clickable */}
        <button
          onClick={() => handleNavigate('inventory')}
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-[#4f0c1b] transition-all duration-200 text-left group"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900">{t('dashboard.stockByLocation')}</h3>
            </div>
            <svg className="w-5 h-5 text-gray-400 group-hover:text-[#4f0c1b] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#4f0c1b"
                  strokeWidth="8"
                  strokeDasharray={`${getTotalStock() > 0 ? (getEcuadorStock() / getTotalStock()) * 251.2 : 0} 251.2`}
                  strokeDashoffset="0"
                  className="transition-all duration-1000 ease-out"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="8"
                  strokeDasharray={`${getTotalStock() > 0 ? (getUSAStock() / getTotalStock()) * 251.2 : 0} 251.2`}
                  strokeDashoffset={`-${getTotalStock() > 0 ? (getEcuadorStock() / getTotalStock()) * 251.2 : 0}`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{getTotalStock()}</div>
                  <div className="text-xs text-gray-500">{t('dashboard.totalUnits')}</div>
                </div>
              </div>
            </div>
            
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#4f0c1b]"></div>
                  <span className="text-sm font-medium text-gray-700">🇪🇨 Ecuador</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{getEcuadorStock()} units</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-medium text-gray-700">🇺🇸 USA</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{getUSAStock()} units</span>
              </div>
              
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{t('dashboard.ecuador')}: {getTotalStock() > 0 ? ((getEcuadorStock() / getTotalStock()) * 100).toFixed(1) : 0}%</span>
                  <span>{t('dashboard.usa')}: {getTotalStock() > 0 ? ((getUSAStock() / getTotalStock()) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
            </div>
          </div>
        </button>

        {/* Inventory Value by Country - Clickable */}
        {hasPermission('costs.view') && (
          <button
            onClick={() => handleNavigate('landed-costs')}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-[#4f0c1b] transition-all duration-200 text-left group"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900">{t('dashboard.inventoryValueByCountry')}</h3>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-[#4f0c1b] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">🇪🇨 {t('dashboard.ecuador')}</span>
                  <span className="text-sm font-semibold text-gray-900">${getInventoryValueByCountry().ecuador.toFixed(2)}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-[#4f0c1b] to-[#6b1426] h-3 rounded-full transition-all duration-500"
                    style={{
                      width: `${getInventoryValueByCountry().total > 0 
                        ? (getInventoryValueByCountry().ecuador / getInventoryValueByCountry().total) * 100 
                        : 0}%`
                    }}
                  />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">🇺🇸 {t('dashboard.usa')}</span>
                  <span className="text-sm font-semibold text-gray-900">${getInventoryValueByCountry().usa.toFixed(2)}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
                    style={{
                      width: `${getInventoryValueByCountry().total > 0 
                        ? (getInventoryValueByCountry().usa / getInventoryValueByCountry().total) * 100 
                        : 0}%`
                    }}
                  />
                </div>
              </div>
              
              <div className="pt-3 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-gray-900">{t('dashboard.totalValueLabel')}</span>
                  <span className="text-lg font-bold text-[#4f0c1b]">${getTotalInventoryValue().toFixed(2)}</span>
                </div>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Additional Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Order Status Distribution - Clickable */}
        {hasPermission('purchase.view') && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900">{t('dashboard.orderStatusDistribution')}</h3>
              </div>
            </div>
            
            <div className="space-y-3">
              {Object.entries(getOrderStatusDistribution()).map(([status, count]) => {
                const total = purchaseOrders.length;
                const percentage = total > 0 ? (count / total) * 100 : 0;
                const colors = {
                  'Pending': 'bg-yellow-500',
                  'Verified': 'bg-green-500',
                  'Shipped': 'bg-blue-500',
                  'Delivered': 'bg-purple-500',
                  'Cancelled': 'bg-red-500'
                };
                const statusTranslations: { [key: string]: string } = {
                  'Pending': t('dashboard.pending'),
                  'Verified': t('dashboard.verified'),
                  'Shipped': t('dashboard.shipped'),
                  'Delivered': t('dashboard.delivered'),
                  'Cancelled': t('dashboard.cancelled')
                };
                
                return (
                  <button
                    key={status}
                    onClick={() => handleNavigate('purchase-orders', { filterStatus: status })}
                    className="w-full text-left hover:bg-gray-50 p-2 rounded-lg transition-colors group"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-700 group-hover:text-[#4f0c1b] transition-colors">{statusTranslations[status] || status}</span>
                      <span className="text-sm font-semibold text-gray-900">{isNaN(count) ? 0 : count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`${colors[status as keyof typeof colors]} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${isNaN(percentage) ? 0 : percentage}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Category Distribution - Clickable */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900">{t('dashboard.inventoryByCategory')}</h3>
            </div>
          </div>
          
          <div className="space-y-3">
            {Object.entries(getCategoryDistribution()).map(([category, count]) => {
              const total = getVerifiedInventoryCount();
              const percentage = total > 0 ? (count / total) * 100 : 0;
              
              return (
                <button
                  key={category}
                  onClick={() => handleNavigate('inventory', { filterCategory: category })}
                  className="w-full text-left hover:bg-gray-50 p-2 rounded-lg transition-colors group"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700 group-hover:text-[#4f0c1b] transition-colors">{category}</span>
                    <span className="text-sm font-semibold text-gray-900">{isNaN(count) ? 0 : count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-[#4f0c1b] to-[#6b1426] h-2 rounded-full transition-all duration-500"
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

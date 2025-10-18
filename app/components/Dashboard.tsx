'use client';

import { useInventory } from '../context/InventoryContext';

export default function Dashboard() {
  const { suppliers, purchaseOrders, inventory } = useInventory();

  const getInventoryValueByCountry = () => {
    let ecuadorValue = 0;
    let usaValue = 0;
    
    inventory.forEach(item => {
      // Only count items that have at least one verified purchase order
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      
      if (!hasVerifiedOrder) return;
      
      const linkedOrders = purchaseOrders.filter(order => 
        item.linkedPurchaseOrders.includes(order.id)
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

  const getTotalStock = () => {
    return inventory.reduce((sum, item) => {
      // Only count items that have at least one verified purchase order
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      
      if (!hasVerifiedOrder) return sum;
      
      return sum + item.ecuadorStock + item.usaStock;
    }, 0);
  };

  const getLowStockItems = () => {
    return inventory.filter(item => {
      // Only include items that have at least one verified purchase order
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      
      if (!hasVerifiedOrder) return false;
      
      return (item.ecuadorStock + item.usaStock) < 10;
    });
  };

  const getVerifiedInventoryCount = () => {
    return inventory.filter(item => {
      // Only count items that have at least one verified purchase order
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      
      return hasVerifiedOrder;
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
      statusCounts[order.status as keyof typeof statusCounts]++;
    });
    
    return statusCounts;
  };

  const getCategoryDistribution = () => {
    const categoryCounts: { [key: string]: number } = {};
    
    inventory.forEach(item => {
      // Only count items that have at least one verified purchase order
      const hasVerifiedOrder = item.linkedPurchaseOrders.some(orderId => {
        const order = purchaseOrders.find(o => o.id === orderId);
        return order && order.status === 'Verified';
      });
      
      if (!hasVerifiedOrder) return;
      
      const category = item.category || 'Uncategorized';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    return categoryCounts;
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Overview of your inventory operations</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Suppliers</div>
              <div className="text-2xl font-bold text-gray-900">{suppliers.length}</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Purchase Orders</div>
              <div className="text-2xl font-bold text-gray-900">{purchaseOrders.length}</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Inventory Items</div>
              <div className="text-2xl font-bold text-gray-900">{getVerifiedInventoryCount()}</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Stock</div>
              <div className="text-2xl font-bold text-gray-900">{getTotalStock()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stock Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900">Stock by Location</h3>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Pie Chart */}
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="8"
                />
                
                {/* Ecuador segment */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#4f0c1b"
                  strokeWidth="8"
                  strokeDasharray={`${getTotalStock() > 0 ? (inventory.reduce((sum, item) => sum + item.ecuadorStock, 0) / getTotalStock()) * 251.2 : 0} 251.2`}
                  strokeDashoffset="0"
                  className="transition-all duration-1000 ease-out"
                />
                
                {/* USA segment */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="8"
                  strokeDasharray={`${getTotalStock() > 0 ? (inventory.reduce((sum, item) => sum + item.usaStock, 0) / getTotalStock()) * 251.2 : 0} 251.2`}
                  strokeDashoffset={`-${getTotalStock() > 0 ? (inventory.reduce((sum, item) => sum + item.ecuadorStock, 0) / getTotalStock()) * 251.2 : 0}`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              
              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{getTotalStock()}</div>
                  <div className="text-xs text-gray-500">Total Units</div>
                </div>
              </div>
            </div>
            
            {/* Legend */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#4f0c1b]"></div>
                  <span className="text-sm font-medium text-gray-700">🇪🇨 Ecuador</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {inventory.reduce((sum, item) => sum + item.ecuadorStock, 0)} units
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-medium text-gray-700">🇺🇸 USA</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {inventory.reduce((sum, item) => sum + item.usaStock, 0)} units
                </span>
              </div>
              
              {/* Percentage breakdown */}
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Ecuador: {getTotalStock() > 0 ? ((inventory.reduce((sum, item) => sum + item.ecuadorStock, 0) / getTotalStock()) * 100).toFixed(1) : 0}%</span>
                  <span>USA: {getTotalStock() > 0 ? ((inventory.reduce((sum, item) => sum + item.usaStock, 0) / getTotalStock()) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900">Inventory Value by Country</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">🇪🇨 Ecuador</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  ${getInventoryValueByCountry().ecuador.toFixed(2)}
                </span>
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
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">🇺🇸 USA</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  ${getInventoryValueByCountry().usa.toFixed(2)}
                </span>
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
                <span className="text-base font-semibold text-gray-900">Total Value</span>
                <span className="text-lg font-bold text-[#4f0c1b]">
                  ${getTotalInventoryValue().toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {getLowStockItems().length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
          <h3 className="text-base font-semibold text-amber-900 mb-4">Low Stock Alert</h3>
          <div className="space-y-2">
            {getLowStockItems().map((item) => (
              <div key={item.id} className="flex justify-between items-center p-4 bg-white rounded-lg border border-amber-100">
                <div>
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">SKU: {item.sku}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-amber-600">
                    {item.ecuadorStock + item.usaStock} units
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    EC: {item.ecuadorStock} · USA: {item.usaStock}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Order Status Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900">Order Status Distribution</h3>
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
              
              return (
                <div key={status}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700">{status}</span>
                    <span className="text-sm font-semibold text-gray-900">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`${colors[status as keyof typeof colors]} h-2 rounded-full transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900">Inventory by Category</h3>
          </div>
          
          <div className="space-y-3">
            {Object.entries(getCategoryDistribution()).map(([category, count]) => {
              const total = getVerifiedInventoryCount();
              const percentage = total > 0 ? (count / total) * 100 : 0;
              
              return (
                <div key={category}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700">{category}</span>
                    <span className="text-sm font-semibold text-gray-900">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-[#4f0c1b] to-[#6b1426] h-2 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
'use client';

import { useInventory } from '../context/InventoryContext';

export default function Dashboard() {
  const { suppliers, purchaseOrders, inventory } = useInventory();

  const getTotalInventoryValue = () => {
    let total = 0;
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
        total += avgCost * (item.ecuadorStock + item.usaStock);
      }
    });
    return total;
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

  const getRecentPurchaseOrders = () => {
    return [...purchaseOrders]
      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
      .slice(0, 5);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Overview of your inventory operations</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Total Suppliers</div>
          <div className="text-3xl font-semibold text-gray-900">{suppliers.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Purchase Orders</div>
          <div className="text-3xl font-semibold text-gray-900">{purchaseOrders.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Inventory Items</div>
          <div className="text-3xl font-semibold text-gray-900">{getVerifiedInventoryCount()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Total Stock</div>
          <div className="text-3xl font-semibold text-gray-900">{getTotalStock()}</div>
        </div>
      </div>

      {/* Stock Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-5">Stock by Location</h3>
          <div className="space-y-5">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Ecuador</span>
                <span className="text-sm font-semibold text-gray-900">
                  {inventory.reduce((sum, item) => sum + item.ecuadorStock, 0)} units
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#4f0c1b] h-2 rounded-full transition-all"
                  style={{
                    width: `${getTotalStock() > 0 
                      ? (inventory.reduce((sum, item) => sum + item.ecuadorStock, 0) / getTotalStock()) * 100 
                      : 0}%`
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">USA</span>
                <span className="text-sm font-semibold text-gray-900">
                  {inventory.reduce((sum, item) => sum + item.usaStock, 0)} units
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#4f0c1b] h-2 rounded-full transition-all opacity-70"
                  style={{
                    width: `${getTotalStock() > 0 
                      ? (inventory.reduce((sum, item) => sum + item.usaStock, 0) / getTotalStock()) * 100 
                      : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-5">Estimated Inventory Value</h3>
          <div className="text-4xl font-semibold text-gray-900">
            ${getTotalInventoryValue().toFixed(2)}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Based on linked purchase order costs
          </p>
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

      {/* Recent Purchase Orders */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-5">Recent Purchase Orders</h3>
        {getRecentPurchaseOrders().length === 0 ? (
          <p className="text-sm text-gray-500">No purchase orders yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full">
              <thead className="text-xs font-medium text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left pb-3 px-6 uppercase tracking-wider">Invoice</th>
                  <th className="text-left pb-3 px-6 uppercase tracking-wider">Supplier</th>
                  <th className="text-left pb-3 px-6 uppercase tracking-wider">Description</th>
                  <th className="text-right pb-3 px-6 uppercase tracking-wider">Quantity</th>
                  <th className="text-right pb-3 px-6 uppercase tracking-wider">Cost (USD)</th>
                  <th className="text-right pb-3 px-6 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {getRecentPurchaseOrders().map((order) => {
                  const supplier = suppliers.find(s => s.id === order.supplierId);
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-6 text-gray-900">{order.invoice}</td>
                      <td className="py-3 px-6 text-gray-700">{supplier?.name || 'N/A'}</td>
                      <td className="py-3 px-6 text-gray-700">{order.description}</td>
                      <td className="py-3 px-6 text-right text-gray-700">{order.quantity}</td>
                      <td className="py-3 px-6 text-right font-medium text-gray-900">${order.costInUSD.toFixed(2)}</td>
                      <td className="py-3 px-6 text-right text-gray-500">
                        {new Date(order.purchaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
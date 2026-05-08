'use client';

import { Supplier } from '../types';
import { useInventory } from '../context/InventoryContext';
import { DataRelationships } from '../utils/relationships';

interface SupplierDetailPanelProps {
  supplier: Supplier;
  onClose: () => void;
}

export default function SupplierDetailPanel({ supplier, onClose }: SupplierDetailPanelProps) {
  const { purchaseOrders, inventory } = useInventory();
  
  const stats = DataRelationships.getSupplierStats(supplier.id, inventory, purchaseOrders);
  const orders = DataRelationships.getPurchaseOrdersBySupplier(supplier.id, purchaseOrders);
  const items = DataRelationships.getInventoryItemsBySupplier(supplier.id, inventory, purchaseOrders);

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-end z-50 animate-in fade-in duration-200">
      <div className="bg-white h-full sm:h-auto sm:max-h-[90vh] w-full sm:w-[500px] sm:rounded-l-2xl shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{supplier.name}</h2>
            <p className="text-sm text-gray-500">{supplier.country}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Contact Info */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Contact Information</h3>
            <div className="space-y-2 text-sm">
              {supplier.email && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Email:</span>
                  <a href={`mailto:${supplier.email}`} className="font-medium text-[#515151] hover:underline">
                    {supplier.email}
                  </a>
                </div>
              )}
              {supplier.phone && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Phone:</span>
                  <a href={`tel:${supplier.phone}`} className="font-medium text-[#515151] hover:underline">
                    {supplier.phone}
                  </a>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Currency:</span>
                <span className="font-medium text-gray-900">{supplier.currency}</span>
              </div>
            </div>
            {supplier.notes && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">{supplier.notes}</p>
              </div>
            )}
          </div>

          {/* Statistics */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Statistics</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-2xl font-semibold text-gray-900">{stats.orderCount}</div>
                <div className="text-xs text-gray-500 mt-1">Purchase Orders</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-2xl font-semibold text-gray-900">{stats.itemCount}</div>
                <div className="text-xs text-gray-500 mt-1">Inventory Items</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-2xl font-semibold text-gray-900">${stats.totalSpent.toFixed(0)}</div>
                <div className="text-xs text-gray-500 mt-1">Total Spent</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-2xl font-semibold text-gray-900">{stats.totalStock}</div>
                <div className="text-xs text-gray-500 mt-1">Units in Stock</div>
              </div>
            </div>
          </div>

          {/* Recent Orders */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Recent Purchase Orders</h3>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No purchase orders yet</p>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 5).map((order) => (
                  <div key={order.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm text-gray-900">{order.invoice}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{order.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm text-gray-900">${order.costInUSD.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">{order.quantity} units</div>
                      </div>
                    </div>
                  </div>
                ))}
                {orders.length > 5 && (
                  <p className="text-xs text-gray-500 text-center py-2">
                    +{orders.length - 5} more orders
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Inventory Items */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Inventory Items</h3>
            {items.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No inventory items yet</p>
            ) : (
              <div className="space-y-2">
                {items.slice(0, 5).map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">SKU: {item.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm text-gray-900">
                          {item.ecuadorStock + item.usaStock} units
                        </div>
                        <div className="text-xs text-gray-500">
                          EC: {item.ecuadorStock} · USA: {item.usaStock}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length > 5 && (
                  <p className="text-xs text-gray-500 text-center py-2">
                    +{items.length - 5} more items
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

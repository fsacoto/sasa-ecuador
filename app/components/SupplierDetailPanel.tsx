'use client';

import { useEffect } from 'react';
import { Supplier } from '../types';
import { useInventory } from '../context/InventoryContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { DataRelationships } from '../utils/relationships';
import ModalPortal from './ui/ModalPortal';

interface SupplierDetailPanelProps {
  supplier: Supplier;
  onClose: () => void;
}

export default function SupplierDetailPanel({ supplier, onClose }: SupplierDetailPanelProps) {
  const { purchaseOrders, inventory } = useInventory();
  const darkMode = useDarkMode();

  const stats = DataRelationships.getSupplierStats(supplier.id, inventory, purchaseOrders);
  const orders = DataRelationships.getPurchaseOrdersBySupplier(supplier.id, purchaseOrders);
  const items = DataRelationships.getInventoryItemsBySupplier(supplier.id, inventory, purchaseOrders);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-stretch justify-end backdrop-blur-sm animate-in fade-in duration-200`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="sasa-modal-panel flex h-full max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-none shadow-2xl animate-in slide-in-from-right duration-300 sm:max-w-[500px] sm:rounded-l-2xl"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-gray-900">{supplier.name}</h2>
              <p className="text-sm text-gray-500">{supplier.country}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            <div>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                Contact Information
              </h3>
              <div className="space-y-2 text-sm">
                {supplier.email && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-600">Email:</span>
                    <a
                      href={`mailto:${supplier.email}`}
                      className="font-medium text-[#515151] hover:underline"
                    >
                      {supplier.email}
                    </a>
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-600">Phone:</span>
                    <a
                      href={`tel:${supplier.phone}`}
                      className="font-medium text-[#515151] hover:underline"
                    >
                      {supplier.phone}
                    </a>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-gray-600">Currency:</span>
                  <span className="font-medium text-gray-900">{supplier.currency}</span>
                </div>
              </div>
              {supplier.notes && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <p className="text-sm text-gray-700">{supplier.notes}</p>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                Statistics
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-900">{stats.orderCount}</div>
                  <div className="mt-1 text-xs text-gray-500">Purchase Orders</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-900">{stats.itemCount}</div>
                  <div className="mt-1 text-xs text-gray-500">Inventory Items</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-900">
                    ${stats.totalSpent.toFixed(0)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">Total Spent</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-900">{stats.totalStock}</div>
                  <div className="mt-1 text-xs text-gray-500">Units in Stock</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                Recent Purchase Orders
              </h3>
              {orders.length === 0 ? (
                <p className="py-4 text-sm text-gray-500">No purchase orders yet</p>
              ) : (
                <div className="space-y-2">
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{order.invoice}</div>
                          <div className="mt-0.5 truncate text-xs text-gray-500">
                            {order.description}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-medium text-gray-900">
                            ${order.costInUSD.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">{order.quantity} units</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {orders.length > 5 && (
                    <p className="py-2 text-center text-xs text-gray-500">
                      +{orders.length - 5} more orders
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                Inventory Items
              </h3>
              {items.length === 0 ? (
                <p className="py-4 text-sm text-gray-500">No inventory items yet</p>
              ) : (
                <div className="space-y-2">
                  {items.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{item.name}</div>
                          <div className="mt-0.5 text-xs text-gray-500">SKU: {item.sku}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {item.ecuadorStock} units
                          </div>
                          <div className="text-xs text-gray-500">Stock: {item.ecuadorStock}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {items.length > 5 && (
                    <p className="py-2 text-center text-xs text-gray-500">
                      +{items.length - 5} more items
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

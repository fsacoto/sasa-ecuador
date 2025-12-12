'use client';

import { useState } from 'react';
import { InventoryItem, Supplier } from '../types';
import { useInventory } from '../context/InventoryContext';
import { DataRelationships } from '../utils/relationships';
import SupplierDetailPanel from './SupplierDetailPanel';

interface InventoryDetailPanelProps {
  item: InventoryItem;
  onClose: () => void;
}

export default function InventoryDetailPanel({ item, onClose }: InventoryDetailPanelProps) {
  const { purchaseOrders, inventory, suppliers } = useInventory();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  const linkedOrders = DataRelationships.getPurchaseOrdersForItem(item.id, inventory, purchaseOrders);
  const itemSuppliers = DataRelationships.getSuppliersForItem(item.id, inventory, purchaseOrders, suppliers);
  
  const totalStock = item.ecuadorStock + item.usaStock;
  const avgCost = linkedOrders.length > 0
    ? linkedOrders.reduce((sum, order) => sum + order.costPerUnitWithDiscount, 0) / linkedOrders.length
    : 0;
  const totalValue = avgCost * totalStock;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-end z-50 animate-in fade-in duration-200">
        <div className="bg-white h-full sm:h-auto sm:max-h-[90vh] w-full sm:w-[500px] sm:rounded-l-2xl shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
              <p className="text-sm text-gray-500">SKU: {item.sku}</p>
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
            {/* Images Gallery */}
            {item.images && item.images.length > 0 && (
              <div>
                {/* Main Image */}
                <div className="mb-3">
                  <img 
                    src={item.images[0]} 
                    alt={item.name} 
                    className="w-full rounded-lg border border-gray-200 object-cover"
                  />
                </div>
                {/* Thumbnail Grid */}
                {item.images.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {item.images.slice(1).map((image, index) => (
                      <img
                        key={index}
                        src={image}
                        alt={`${item.name} ${index + 2}`}
                        className="w-full h-16 object-cover rounded border border-gray-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Barcode */}
            {item.barcode && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Barcode</h3>
                <div className="bg-gray-50 rounded-lg p-4 flex justify-center">
                  <img 
                    src={item.barcode} 
                    alt={`Barcode for ${item.sku}`}
                    className="h-20 w-auto"
                  />
                </div>
              </div>
            )}

            {/* Basic Info */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Product Information</h3>
              <div className="space-y-2 text-sm">
                {item.description && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-gray-700">{item.description}</p>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Category:</span>
                  <span className="font-medium text-gray-900">{item.category || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Line:</span>
                  <span className="font-medium text-gray-900">{item.line || 'N/A'}</span>
                </div>
                {item.supplierSKU && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Supplier SKU:</span>
                    <span className="font-medium text-gray-900">{item.supplierSKU}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stock Information */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Stock Levels</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-2xl font-semibold text-gray-900">{item.ecuadorStock}</div>
                  <div className="text-xs text-gray-500 mt-1">Ecuador</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-2xl font-semibold text-gray-900">{item.usaStock}</div>
                  <div className="text-xs text-gray-500 mt-1">USA</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-2xl font-semibold text-gray-900">{totalStock}</div>
                  <div className="text-xs text-gray-500 mt-1">Total</div>
                </div>
              </div>
            </div>

            {/* Value Information */}
            {avgCost > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Valuation</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xl font-semibold text-gray-900">${avgCost.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 mt-1">Avg. Cost/Unit</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xl font-semibold text-gray-900">${totalValue.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 mt-1">Total Value</div>
                  </div>
                </div>
              </div>
            )}

            {/* Suppliers */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Suppliers</h3>
              {itemSuppliers.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No suppliers linked</p>
              ) : (
                <div className="space-y-2">
                  {itemSuppliers.map((supplier) => (
                    <button
                      key={supplier.id}
                      onClick={() => setSelectedSupplier(supplier)}
                      className="w-full bg-gray-50 rounded-lg p-3 text-left hover:bg-gray-100 transition-colors"
                    >
                      <div className="font-medium text-sm text-[#4f0c1b]">{supplier.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {supplier.country} · {supplier.currency}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Linked Purchase Orders */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Purchase History ({linkedOrders.length})
              </h3>
              {linkedOrders.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No purchase orders linked</p>
              ) : (
                <div className="space-y-2">
                  {linkedOrders.map((order) => {
                    const supplier = suppliers.find(s => s.id === order.supplierId);
                    return (
                      <div key={order.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-sm text-gray-900">{order.invoice}</div>
                            {supplier && (
                              <button
                                onClick={() => setSelectedSupplier(supplier)}
                                className="text-xs text-[#4f0c1b] hover:underline"
                              >
                                {supplier.name}
                              </button>
                            )}
                            {order.invoiceLink && (
                              <a
                                href={order.invoiceLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                View Invoice
                              </a>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-900">
                              ${order.costPerUnitWithDiscount.toFixed(2)}/unit
                            </div>
                            <div className="text-xs text-gray-500">{order.quantity} units</div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(order.purchaseDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })} · {order.destinationStock}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Nested Supplier Detail Panel */}
      {selectedSupplier && (
        <SupplierDetailPanel
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
        />
      )}
    </>
  );
}

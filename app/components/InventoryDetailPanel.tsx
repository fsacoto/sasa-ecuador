'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { InventoryItem, Supplier } from '../types';
import { useInventory } from '../context/InventoryContext';
import { useCMS } from '../context/CMSContext';
import { useTranslation } from '../context/TranslationContext';
import { DataRelationships } from '../utils/relationships';
import {
  getConsignmentReturnProblemQty,
  reconcileVerificationIssuesForItem,
} from '../utils/syncUpdates';
import {
  buildMergedGalleryUrls,
  collectPurchaseOrderImagesForSku,
  isGalleryVideoUrl,
} from '../utils/inventoryMediaGallery';
import SupplierDetailPanel from './SupplierDetailPanel';

interface InventoryDetailPanelProps {
  item: InventoryItem;
  onClose: () => void;
}

export default function InventoryDetailPanel({ item, onClose }: InventoryDetailPanelProps) {
  const { purchaseOrders, inventory, suppliers } = useInventory();
  const { content, refreshCMS } = useCMS();
  const { t } = useTranslation();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [inventoryMediaUrls, setInventoryMediaUrls] = useState<string[]>([]);

  const latestItem = useMemo(
    () => inventory.find((i) => i.id === item.id) ?? item,
    [inventory, item]
  );

  useEffect(() => {
    void refreshCMS();
  }, [item.id, refreshCMS]);

  useEffect(() => {
    let cancelled = false;
    const sku = latestItem.sku?.trim();
    if (!sku) {
      setInventoryMediaUrls([]);
      return;
    }
    (async () => {
      try {
        const { getMediaBySKU } = await import('../services/inventoryMediaService');
        const row = await getMediaBySKU(sku);
        if (!cancelled) setInventoryMediaUrls(row?.images?.filter(Boolean) ?? []);
      } catch {
        if (!cancelled) setInventoryMediaUrls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latestItem.sku]);

  const purchaseOrderImageUrls = useMemo(
    () => collectPurchaseOrderImagesForSku(latestItem, purchaseOrders),
    [latestItem.linkedPurchaseOrders, latestItem.sku, purchaseOrders]
  );

  const galleryUrls = useMemo(
    () =>
      buildMergedGalleryUrls(latestItem.images, latestItem.sku, content, {
        inventoryMediaImages: inventoryMediaUrls,
        purchaseOrderImages: purchaseOrderImageUrls,
      }),
    [latestItem.images, latestItem.sku, content, inventoryMediaUrls, purchaseOrderImageUrls]
  );

  useEffect(() => {
    setActiveIndex(0);
    setLightboxOpen(false);
  }, [latestItem.id]);

  useEffect(() => {
    if (galleryUrls.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= galleryUrls.length) {
      setActiveIndex(galleryUrls.length - 1);
    }
  }, [galleryUrls.length, activeIndex]);

  const goPrev = useCallback(() => {
    setActiveIndex((i) => (galleryUrls.length ? (i - 1 + galleryUrls.length) % galleryUrls.length : 0));
  }, [galleryUrls.length]);

  const goNext = useCallback(() => {
    setActiveIndex((i) => (galleryUrls.length ? (i + 1) % galleryUrls.length : 0));
  }, [galleryUrls.length]);

  useEffect(() => {
    if (!lightboxOpen && galleryUrls.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
        return;
      }
      if (!galleryUrls.length) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, galleryUrls.length, goPrev, goNext]);

  const liveVerificationIssues = reconcileVerificationIssuesForItem(
    { linkedPurchaseOrders: latestItem.linkedPurchaseOrders ?? [] },
    purchaseOrders
  );
  const totalProblemQty =
    liveVerificationIssues.reduce((s, v) => s + v.quantityProblem, 0) +
    getConsignmentReturnProblemQty(latestItem);

  const linkedOrders = DataRelationships.getPurchaseOrdersForItem(latestItem.id, inventory, purchaseOrders);
  const itemSuppliers = DataRelationships.getSuppliersForItem(
    latestItem.id,
    inventory,
    purchaseOrders,
    suppliers
  );

  const avgCost =
    linkedOrders.length > 0
      ? linkedOrders.reduce((sum, order) => sum + order.costPerUnitWithDiscount, 0) / linkedOrders.length
      : 0;
  const totalValue = avgCost * latestItem.ecuadorStock;

  const currentUrl = galleryUrls[activeIndex];
  const currentIsVideo = currentUrl ? isGalleryVideoUrl(currentUrl) : false;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-end z-50 animate-in fade-in duration-200">
        <div className="bg-white h-full sm:h-auto sm:max-h-[90vh] w-full sm:w-[500px] sm:rounded-l-2xl shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{latestItem.name}</h2>
              <p className="text-sm text-gray-500">SKU: {latestItem.sku}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={t('common.close')}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Gallery: inventory + CMS (merged in app from Firestore; no extra Firebase link table). */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                {t('inventory.gallery')}
                {galleryUrls.length > 0 ? (
                  <span className="font-normal text-gray-400 normal-case"> — {galleryUrls.length}</span>
                ) : null}
              </h3>
              <p className="text-xs text-gray-400 mb-3">{t('inventory.galleryHint')}</p>
              {galleryUrls.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">{t('inventory.noGalleryMedia')}</p>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden group">
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#515151] focus-visible:ring-offset-2 rounded-xl"
                      aria-label={t('inventory.galleryOpenFullscreen')}
                    >
                      <div className="relative w-full max-h-72 min-h-[200px] flex items-center justify-center bg-gray-100">
                        {currentIsVideo ? (
                          <video
                            key={currentUrl}
                            src={currentUrl}
                            className="max-h-72 w-full object-contain"
                            controls
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={currentUrl}
                            alt=""
                            className="max-h-72 w-full object-contain"
                          />
                        )}
                      </div>
                    </button>
                    {galleryUrls.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            goPrev();
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50 hover:text-[#515151] z-10"
                          aria-label={t('inventory.galleryPrevious')}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            goNext();
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50 hover:text-[#515151] z-10"
                          aria-label={t('inventory.galleryNext')}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 px-0.5">
                    <span>
                      {activeIndex + 1} / {galleryUrls.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="text-[#515151] font-medium hover:underline"
                    >
                      {t('inventory.galleryOpenFullscreen')}
                    </button>
                  </div>
                  <div
                    className="flex gap-2 overflow-x-auto pb-2 pt-1 -mx-1 px-1 border-t border-gray-100"
                    role="list"
                    aria-label={t('inventory.galleryThumbnails')}
                  >
                    {galleryUrls.map((url, index) => {
                      const vid = isGalleryVideoUrl(url);
                      return (
                        <button
                          key={`${url}-${index}`}
                          type="button"
                          onClick={() => setActiveIndex(index)}
                          className={`relative shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden bg-gray-100 transition-colors ${
                            index === activeIndex
                              ? 'border-[#515151] ring-2 ring-[#515151]/20'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          aria-label={`${t('inventory.gallery')} ${index + 1}`}
                        >
                          {vid ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
                              <svg className="w-6 h-6 opacity-90" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                            </div>
                          ) : (
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Barcode */}
            {latestItem.barcode && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Barcode</h3>
                <div className="bg-gray-50 rounded-lg p-4 flex justify-center">
                  <img
                    src={latestItem.barcode}
                    alt={`Barcode for ${latestItem.sku}`}
                    className="h-20 w-auto"
                  />
                </div>
              </div>
            )}

            {/* Basic Info */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Product Information</h3>
              <div className="space-y-2 text-sm">
                {latestItem.description && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-gray-700">{latestItem.description}</p>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Category:</span>
                  <span className="font-medium text-gray-900">{latestItem.category || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Line:</span>
                  <span className="font-medium text-gray-900">{latestItem.line || 'N/A'}</span>
                </div>
                {latestItem.supplierSKU && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Supplier SKU:</span>
                    <span className="font-medium text-gray-900">{latestItem.supplierSKU}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stock Information */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Stock Levels</h3>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-2xl font-semibold text-gray-900">{latestItem.ecuadorStock}</div>
                <div className="text-xs text-gray-500 mt-1">Stock (Ecuador hub)</div>
              </div>
            </div>

            {totalProblemQty > 0 && (
              <div>
                <h3 className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t('inventory.verificationProblemTitle')} ({totalProblemQty})
                </h3>
                <p className="text-xs text-gray-500 mb-3">{t('inventory.verificationProblemIntro')}</p>
                <div className="space-y-3">
                  {liveVerificationIssues.map((issue) => {
                    const po = purchaseOrders.find((o) => o.id === issue.purchaseOrderId);
                    return (
                      <div
                        key={issue.purchaseOrderId}
                        className="border border-amber-200 bg-amber-50/80 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <span className="font-semibold text-amber-950">{po?.invoice ?? t('inventory.purchaseOrder')}</span>
                        </div>
                        {issue.quantityGoodAtVerification !== undefined ? (
                          <p className="text-sm font-semibold text-gray-900">
                            {t('inventory.verificationBreakdownLine')
                              .replace('{{good}}', String(issue.quantityGoodAtVerification))
                              .replace('{{problem}}', String(issue.quantityProblem))}
                          </p>
                        ) : (
                          <p className="text-sm font-bold text-amber-900">
                            {t('inventory.problemQtyLabel')}: {issue.quantityProblem}
                          </p>
                        )}
                        {issue.comment ? (
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{issue.comment}</p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">{t('inventory.noVerificationComment')}</p>
                        )}
                        {issue.mediaUrls && issue.mediaUrls.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {issue.mediaUrls.map((url) => {
                              const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
                              return (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block shrink-0"
                                >
                                  {isVideo ? (
                                    <video
                                      src={url}
                                      className="h-16 w-16 object-cover rounded-lg border border-amber-200"
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : (
                                    <img
                                      src={url}
                                      alt=""
                                      className="h-16 w-16 object-cover rounded-lg border border-amber-200"
                                    />
                                  )}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(latestItem.consignmentReturnIssues?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t('inventory.consignmentReturnsSection') || 'Devoluciones consignación (incidencias)'}
                </h3>
                <div className="space-y-3">
                  {(latestItem.consignmentReturnIssues ?? []).map((issue, idx) => (
                    <div
                      key={`${issue.consignmentFirestoreId}-${issue.sku}-${idx}`}
                      className="border border-amber-200 bg-amber-50/80 rounded-lg p-3 space-y-2"
                    >
                      <div className="text-sm font-semibold text-amber-950">
                        {issue.consignmentNumber} · {issue.sku}
                      </div>
                      <p className="text-sm text-gray-900">
                        {t('inventory.problemQtyLabel')}: {issue.quantityProblem}
                      </p>
                      {issue.comment ? (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{issue.comment}</p>
                      ) : null}
                      {issue.mediaUrls && issue.mediaUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {issue.mediaUrls.map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <img
                                src={url}
                                alt=""
                                className="h-16 w-16 object-cover rounded-lg border border-amber-200"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                      <div className="font-medium text-sm text-[#515151]">{supplier.name}</div>
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
                    const supplier = suppliers.find((s) => s.id === order.supplierId);
                    return (
                      <div key={order.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-sm text-gray-900">{order.invoice}</div>
                            {supplier && (
                              <button
                                onClick={() => setSelectedSupplier(supplier)}
                                className="text-xs text-[#515151] hover:underline"
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
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
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
                            year: 'numeric',
                          })}
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

      {/* Fullscreen lightbox */}
      {lightboxOpen && galleryUrls.length > 0 && currentUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/92 p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={t('inventory.gallery')}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/90 hover:text-white p-2 rounded-lg hover:bg-white/10"
            onClick={() => setLightboxOpen(false)}
            aria-label={t('inventory.galleryClose')}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {galleryUrls.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                aria-label={t('inventory.galleryPrevious')}
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                aria-label={t('inventory.galleryNext')}
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
          <div
            className="max-w-[min(100vw-2rem,1200px)] max-h-[85vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {currentIsVideo ? (
              <video
                key={currentUrl}
                src={currentUrl}
                className="max-h-[80vh] w-auto max-w-full rounded-lg"
                controls
                playsInline
                autoPlay
              />
            ) : (
              <img
                src={currentUrl}
                alt=""
                className="max-h-[80vh] w-auto max-w-full object-contain rounded-lg"
              />
            )}
            <p className="text-white/80 text-sm">
              {activeIndex + 1} / {galleryUrls.length}
            </p>
          </div>
        </div>
      )}

      {/* Nested Supplier Detail Panel */}
      {selectedSupplier && (
        <SupplierDetailPanel supplier={selectedSupplier} onClose={() => setSelectedSupplier(null)} />
      )}
    </>
  );
}

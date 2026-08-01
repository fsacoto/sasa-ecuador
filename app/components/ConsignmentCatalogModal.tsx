'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { Client, Consignment, InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import POModalShell from './ui/POModalShell';
import { formatDateDMY } from '../utils/formatDate';
import { displayCategory } from '../utils/merchandiseLabels';
import { isMaterialCategory } from '../utils/materials';
import { normalizeSalePrice } from '../utils/salePrice';
import { generateCatalogPDF } from '../utils/catalogPdfDownload';

type PhotosMode = 'all' | 'with';
type PriceMode = 'with' | 'without';

interface ConsignmentCatalogModalProps {
  consignments: Consignment[];
  clients: Client[];
  inventory: InventoryItem[];
  onClose: () => void;
  onError: (message: string) => void;
}

function formatTemplate(template: string, vars: Record<string, string>) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

function statusLabel(
  status: Consignment['status'],
  t: (key: string) => string
): string {
  if (status === 'Open') return t('consignments.statusOpen');
  if (status === 'Partially Closed') return t('consignments.statusPartiallyClosed');
  return t('consignments.statusClosed');
}

function buildCatalogProductsFromConsignments(
  selected: Consignment[],
  inventory: InventoryItem[],
  photosMode: PhotosMode
): InventoryItem[] {
  const priceBySku = new Map<string, number>();
  const metaBySku = new Map<string, { category?: string; line?: string; description?: string }>();
  const skuOrder: string[] = [];
  const seen = new Set<string>();

  for (const consignment of selected) {
    for (const line of consignment.items || []) {
      const sku = (line.sku || '').trim();
      if (!sku) continue;
      if ((Number(line.quantityDelivered) || 0) <= 0) continue;

      if (!seen.has(sku)) {
        seen.add(sku);
        skuOrder.push(sku);
      }

      const unit = normalizeSalePrice(line.unitPrice);
      if (unit !== undefined && !priceBySku.has(sku)) {
        priceBySku.set(sku, unit);
      }

      const prev = metaBySku.get(sku) || {};
      metaBySku.set(sku, {
        category: prev.category || line.category,
        line: prev.line || line.line,
        description: prev.description || line.description,
      });
    }
  }

  const invBySku = new Map(
    inventory.map((item) => [item.sku.trim(), item] as const)
  );

  const products: InventoryItem[] = [];
  for (const sku of skuOrder) {
    const inv = invBySku.get(sku);
    if (inv && isMaterialCategory(inv.category)) continue;

    const meta = metaBySku.get(sku);
    const consignmentPrice = priceBySku.get(sku);

    if (inv) {
      const hasPhotos = (inv.images?.length || 0) > 0;
      if (photosMode === 'with' && !hasPhotos) continue;
      products.push({
        ...inv,
        ...(consignmentPrice !== undefined ? { salePrice: consignmentPrice } : {}),
        ...(meta?.category && !inv.category ? { category: meta.category } : {}),
        ...(meta?.line && !inv.line ? { line: meta.line } : {}),
      });
      continue;
    }

    // SKU on consignment but missing from inventory — still include a stub card
    if (photosMode === 'with') continue;
    products.push({
      id: `consignment-sku-${sku}`,
      sku,
      name: meta?.description || sku,
      description: meta?.description || sku,
      supplierSKU: '',
      linkedPurchaseOrders: [],
      category: meta?.category || '',
      line: meta?.line || '',
      ecuadorStock: 0,
      images: [],
      createdAt: new Date(),
      ...(consignmentPrice !== undefined ? { salePrice: consignmentPrice } : {}),
    });
  }

  return products;
}

function sortProductsForCatalog(
  products: InventoryItem[],
  categorySeparators: boolean
): InventoryItem[] {
  const bySku = (a: InventoryItem, b: InventoryItem) =>
    (a.sku || '').localeCompare(b.sku || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    });

  return [...products].sort((a, b) => {
    if (categorySeparators) {
      const byCat = displayCategory(a.category).localeCompare(
        displayCategory(b.category),
        undefined,
        { sensitivity: 'base' }
      );
      if (byCat !== 0) return byCat;
    }
    return bySku(a, b);
  });
}

export default function ConsignmentCatalogModal({
  consignments,
  clients,
  inventory,
  onClose,
  onError,
}: ConsignmentCatalogModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [photosMode, setPhotosMode] = useState<PhotosMode>('all');
  const [priceMode, setPriceMode] = useState<PriceMode>('with');
  const [categorySeparators, setCategorySeparators] = useState(true);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [catalogTitle, setCatalogTitle] = useState(() => t('consignments.catalogModalDefaultTitle'));
  const [busy, setBusy] = useState(false);
  const [imageProgress, setImageProgress] = useState<{ completed: number; total: number } | null>(
    null
  );

  const sorted = useMemo(() => {
    return [...consignments].sort((a, b) => {
      const da = a.dateCreated instanceof Date ? a.dateCreated : new Date(a.dateCreated);
      const db = b.dateCreated instanceof Date ? b.dateCreated : new Date(b.dateCreated);
      return db.getTime() - da.getTime();
    });
  }, [consignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((c) => {
      if (clientId && c.clientId !== clientId) return false;
      if (!q) return true;
      return (
        c.consignmentId.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        (c.clientAddress || '').toLowerCase().includes(q)
      );
    });
  }, [sorted, search, clientId]);

  const selectedForCatalog = useMemo(
    () => sorted.filter((c) => selectedIds.has(c.id)),
    [sorted, selectedIds]
  );

  const previewProducts = useMemo(() => {
    const built = buildCatalogProductsFromConsignments(
      selectedForCatalog,
      inventory,
      photosMode
    );
    return sortProductsForCatalog(built, categorySeparators);
  }, [selectedForCatalog, inventory, photosMode, categorySeparators]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const c of filtered) next.delete(c.id);
        return next;
      }
      const next = new Set(prev);
      for (const c of filtered) next.add(c.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleGenerate = async () => {
    if (busy || selectedForCatalog.length === 0 || previewProducts.length === 0) return;
    setBusy(true);
    setImageProgress({ completed: 0, total: previewProducts.length });
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const safeTitle = (catalogTitle || 'catalogo')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .slice(0, 60);
      await generateCatalogPDF({
        products: previewProducts,
        catalogTitle: catalogTitle.trim() || t('consignments.catalogModalDefaultTitle'),
        includeStock: false,
        includePrice: priceMode === 'with',
        orientation,
        categorySeparators,
        fileName: `catalogo-consignaciones-${safeTitle || stamp}.pdf`,
        onImageProgress: (completed, total) => setImageProgress({ completed, total }),
      });
    } catch (error) {
      console.error('Consignment catalog error:', error);
      onError(t('inventory.catalog.catalogGenerationFailed'));
    } finally {
      setBusy(false);
      setImageProgress(null);
    }
  };

  const optionCard = (
    selected: boolean,
    label: string,
    hint: string,
    children: ReactNode
  ) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        selected
          ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
          : 'border-transparent hover:border-gray-200'
      }`}
    >
      {children}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );

  return (
    <POModalShell
      title={t('consignments.catalogModalTitle')}
      titleId="consignment-catalog-modal-title"
      maxWidthClass="max-w-4xl"
      onClose={busy ? () => undefined : onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
        <p className="text-sm text-gray-600">{t('consignments.catalogModalIntro')}</p>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="sasa-modal-section rounded-xl border border-gray-200 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">
              {t('inventory.filterPhotos') || 'Fotos'}
            </p>
            <div className="space-y-1.5" role="radiogroup">
              {optionCard(
                photosMode === 'all',
                t('inventory.filterPhotosAll') || 'Todos',
                t('consignments.catalogPhotosAllHint'),
                <input
                  type="radio"
                  name="catalog-photos"
                  checked={photosMode === 'all'}
                  onChange={() => setPhotosMode('all')}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-[#515151] focus:ring-[#515151]"
                />
              )}
              {optionCard(
                photosMode === 'with',
                t('inventory.filterPhotosWith') || 'Con fotos',
                t('consignments.catalogPhotosWithHint'),
                <input
                  type="radio"
                  name="catalog-photos"
                  checked={photosMode === 'with'}
                  onChange={() => setPhotosMode('with')}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-[#515151] focus:ring-[#515151]"
                />
              )}
            </div>
          </div>

          <div className="sasa-modal-section rounded-xl border border-gray-200 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">
              {t('inventory.catalog.priceDisplayLabel')}
            </p>
            <div className="space-y-1.5" role="radiogroup">
              {optionCard(
                priceMode === 'with',
                t('inventory.catalog.withPrice'),
                t('consignments.catalogPriceWithHint'),
                <input
                  type="radio"
                  name="catalog-price"
                  checked={priceMode === 'with'}
                  onChange={() => setPriceMode('with')}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-[#515151] focus:ring-[#515151]"
                />
              )}
              {optionCard(
                priceMode === 'without',
                t('inventory.catalog.withoutPrice'),
                t('consignments.catalogPriceWithoutHint'),
                <input
                  type="radio"
                  name="catalog-price"
                  checked={priceMode === 'without'}
                  onChange={() => setPriceMode('without')}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-[#515151] focus:ring-[#515151]"
                />
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
              categorySeparators
                ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                : darkMode
                  ? 'border-white/15 hover:bg-white/5'
                  : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={categorySeparators}
              onChange={(e) => setCategorySeparators(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#515151] focus:ring-[#515151]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900">
                {t('inventory.catalog.categorySeparatorsLabel')}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {t('consignments.catalogSeparatorsHint')}
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-gray-200 px-4 py-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('inventory.catalog.orientationLabel')}
            </label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
              disabled={busy}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151] disabled:opacity-60"
            >
              <option value="landscape">{t('inventory.catalog.landscape')}</option>
              <option value="portrait">{t('inventory.catalog.portrait')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            {t('inventory.catalog.catalogTitleLabel')}
          </label>
          <input
            type="text"
            value={catalogTitle}
            onChange={(e) => setCatalogTitle(e.target.value)}
            disabled={busy}
            placeholder={t('inventory.catalog.catalogTitlePlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151] disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('consignments.printModalSearch')}
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('consignments.printModalSearchPh')}
              disabled={busy}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151] disabled:opacity-60"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('consignments.client')}
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151] disabled:opacity-60"
            >
              <option value="">{t('salesNotes.allClients')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            {formatTemplate(t('consignments.catalogModalSelectionSummary'), {
              selected: String(selectedForCatalog.length),
              products: String(previewProducts.length),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleFiltered}
              disabled={busy || filtered.length === 0}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {allFilteredSelected
                ? t('consignments.printModalDeselectVisible')
                : t('consignments.printModalSelectVisible')}
            </button>
            {selectedForCatalog.length > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                disabled={busy}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('consignments.clearSelection')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200">
          <div className="max-h-[min(36vh,320px)] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                {t('consignments.printModalNoMatch')}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const checked = selectedIds.has(c.id);
                  const units = c.items.reduce((sum, item) => sum + item.quantityDelivered, 0);
                  const skuCount = c.items.length;
                  return (
                    <li key={c.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
                          checked ? 'bg-[#515151]/[0.04]' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(c.id)}
                          disabled={busy}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-[#515151] focus:ring-[#515151]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-[#515151]">
                              {c.consignmentId}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                              {statusLabel(c.status, t)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-sm text-gray-900">{c.clientName}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {formatDateDMY(c.dateCreated)}
                            {' · '}
                            {formatTemplate(t('consignments.catalogModalSkuCount'), {
                              skus: String(skuCount),
                              units: String(units),
                            })}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy || selectedForCatalog.length === 0 || previewProducts.length === 0}
            className="sasa-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {imageProgress
                  ? formatTemplate(t('consignments.catalogGeneratingProgress'), {
                      completed: String(imageProgress.completed),
                      total: String(imageProgress.total),
                    })
                  : t('consignments.catalogGenerating')}
              </>
            ) : (
              <>
                {t('consignments.catalogGenerate')}
                {previewProducts.length > 0 ? (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                    {previewProducts.length}
                  </span>
                ) : null}
              </>
            )}
          </button>
        </div>
      </div>
    </POModalShell>
  );
}

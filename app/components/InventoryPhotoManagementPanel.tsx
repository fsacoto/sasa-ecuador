'use client';

import { useMemo, useState } from 'react';
import { InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { deleteMediaFile } from '../services/inventoryMediaService';

type GroupMode = 'item' | 'category' | 'line';

type PhotoEntry = {
  key: string;
  item: InventoryItem;
  url: string;
  index: number;
};

interface InventoryPhotoManagementPanelProps {
  inventory: InventoryItem[];
  canDeleteMedia: boolean;
  onUpdateInventoryItem: (id: string, update: Partial<InventoryItem>) => Promise<void>;
}

export default function InventoryPhotoManagementPanel({
  inventory,
  canDeleteMedia,
  onUpdateInventoryItem,
}: InventoryPhotoManagementPanelProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [line, setLine] = useState('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('item');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<{ removed: number; storageErrors: number } | null>(
    null
  );

  const categories = useMemo(
    () =>
      [...new Set(inventory.map((item) => item.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [inventory]
  );
  const lines = useMemo(
    () =>
      [...new Set(inventory.map((item) => item.line).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [inventory]
  );

  const allPhotos = useMemo<PhotoEntry[]>(
    () =>
      inventory.flatMap((item) =>
        (item.images ?? []).map((url, index) => ({
          key: `${item.id}::${url}`,
          item,
          url,
          index,
        }))
      ),
    [inventory]
  );

  const filteredPhotos = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return allPhotos.filter(({ item }) => {
      const matchesSearch =
        !query ||
        item.sku.toLocaleLowerCase().includes(query) ||
        item.name.toLocaleLowerCase().includes(query) ||
        item.supplierSKU?.toLocaleLowerCase().includes(query);
      return (
        matchesSearch &&
        (category === 'all' || item.category === category) &&
        (line === 'all' || item.line === line)
      );
    });
  }, [allPhotos, category, line, search]);

  const hasActiveFilters =
    search.trim().length > 0 || category !== 'all' || line !== 'all' || groupMode !== 'item';

  const clearFilters = () => {
    setSearch('');
    setCategory('all');
    setLine('all');
    setGroupMode('item');
  };

  const groupedPhotos = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; photos: PhotoEntry[] }>();
    for (const photo of filteredPhotos) {
      const key =
        groupMode === 'category'
          ? photo.item.category || t('inventory.bulkImages.noCategory')
          : groupMode === 'line'
            ? photo.item.line || t('inventory.bulkImages.noLine')
            : photo.item.id;
      const label =
        groupMode === 'item'
          ? `${photo.item.sku} · ${photo.item.name}`
          : key;
      const group = groups.get(key);
      if (group) group.photos.push(photo);
      else groups.set(key, { key, label, photos: [photo] });
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredPhotos, groupMode, t]);

  const togglePhoto = (key: string) => {
    setResult(null);
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelected((current) => {
      const next = new Set(current);
      filteredPhotos.forEach((photo) => next.add(photo.key));
      return next;
    });
    setResult(null);
    setConfirming(false);
  };

  const deleteSelected = async () => {
    if (!canDeleteMedia || selected.size === 0 || deleting) return;
    setDeleting(true);
    setConfirming(false);
    setResult(null);

    const selectedEntries = allPhotos.filter((photo) => selected.has(photo.key));
    const byItem = new Map<string, { item: InventoryItem; photos: PhotoEntry[] }>();
    for (const photo of selectedEntries) {
      const existing = byItem.get(photo.item.id);
      if (existing) existing.photos.push(photo);
      else byItem.set(photo.item.id, { item: photo.item, photos: [photo] });
    }

    let removed = 0;
    let storageErrors = 0;
    const successfullyRemoved = new Set<string>();

    for (const { item, photos } of byItem.values()) {
      // Delete from Storage FIRST so we only unlink from the item what is truly
      // gone. If a file cannot be deleted we keep it visible (nothing ends up
      // stored-but-hidden) and it can be retried.
      const deletionResults = await Promise.allSettled(
        photos.map((photo) => deleteMediaFile(photo.url))
      );
      const urlsToRemove = new Set<string>();
      photos.forEach((photo, i) => {
        if (deletionResults[i].status === 'fulfilled') {
          urlsToRemove.add(photo.url);
          successfullyRemoved.add(photo.key);
        } else {
          storageErrors += 1;
          console.error(
            `Could not delete photo from storage for ${item.sku}:`,
            (deletionResults[i] as PromiseRejectedResult).reason
          );
        }
      });

      if (urlsToRemove.size === 0) continue;

      try {
        await onUpdateInventoryItem(item.id, {
          images: (item.images ?? []).filter((url) => !urlsToRemove.has(url)),
        });
        removed += urlsToRemove.size;
      } catch (error) {
        console.error(`Could not update inventory item ${item.sku}:`, error);
      }
    }

    setSelected((current) => {
      const next = new Set(current);
      successfullyRemoved.forEach((key) => next.delete(key));
      return next;
    });
    setResult({ removed, storageErrors });
    setDeleting(false);
  };

  return (
    <div className="space-y-4">
      {!canDeleteMedia && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('inventory.bulkImages.deletePermissionRequired')}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('inventory.bulkImages.searchPhotos')}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#515151] focus:ring-1 focus:ring-[#515151]"
            />
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#515151] focus:ring-1 focus:ring-[#515151]"
          >
            <option value="all">{t('inventory.allCategories')}</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={line}
            onChange={(event) => setLine(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#515151] focus:ring-1 focus:ring-[#515151]"
          >
            <option value="all">{t('inventory.allLines')}</option>
            {lines.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={groupMode}
            onChange={(event) => setGroupMode(event.target.value as GroupMode)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#515151] focus:ring-1 focus:ring-[#515151]"
          >
            <option value="item">{t('inventory.bulkImages.groupByItem')}</option>
            <option value="category">{t('inventory.bulkImages.groupByCategory')}</option>
            <option value="line">{t('inventory.bulkImages.groupByLine')}</option>
          </select>
        </div>
        {hasActiveFilters && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              {t('inventory.bulkImages.clearPhotoFilters')}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-gray-600">
          {t('inventory.bulkImages.photosFound')
            .replace('{count}', String(filteredPhotos.length))
            .replace('{selected}', String(selected.size))}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectFiltered}
            disabled={!canDeleteMedia || filteredPhotos.length === 0 || deleting}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('inventory.bulkImages.selectFiltered')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setConfirming(false);
            }}
            disabled={selected.size === 0 || deleting}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('inventory.bulkImages.clearSelection')}
          </button>
        </div>
      </div>

      {groupedPhotos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
          {t('inventory.bulkImages.noPhotosFound')}
        </div>
      ) : (
        <div className="max-h-[52dvh] space-y-4 overflow-y-auto pr-1">
          {groupedPhotos.map((group) => (
            <section key={group.key} className="rounded-xl border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="truncate text-sm font-semibold text-gray-900">{group.label}</h4>
                <span className="shrink-0 text-xs text-gray-500">{group.photos.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {group.photos.map((photo) => {
                  const checked = selected.has(photo.key);
                  return (
                    <button
                      key={photo.key}
                      type="button"
                      disabled={!canDeleteMedia || deleting}
                      onClick={() => togglePhoto(photo.key)}
                      className={`group relative overflow-hidden rounded-lg border text-left transition-all disabled:cursor-default ${
                        checked
                          ? 'border-[#515151] ring-2 ring-[#515151]/25'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <img
                        src={photo.url}
                        alt={`${photo.item.sku} ${photo.index + 1}`}
                        className="aspect-square w-full object-cover"
                      />
                      <span
                        className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${
                          checked
                            ? 'border-[#515151] bg-[#515151] text-white'
                            : 'border-white bg-black/50 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      {groupMode !== 'item' && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-[10px] font-medium text-white">
                          {photo.item.sku}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {confirming && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <div>
            <p className="font-semibold text-gray-900">
              {t('inventory.bulkImages.deleteConfirmTitle').replace(
                '{count}',
                String(selected.size)
              )}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {t('inventory.bulkImages.deleteConfirmHint')}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 transition hover:bg-gray-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void deleteSelected()}
              className="rounded-lg bg-[#515151] px-3 py-2 font-semibold text-white transition hover:bg-black"
            >
              {t('inventory.bulkImages.confirmDelete')}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.storageErrors > 0
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-green-200 bg-green-50 text-green-900'
          }`}
        >
          {t('inventory.bulkImages.deleteResult')
            .replace('{removed}', String(result.removed))
            .replace('{errors}', String(result.storageErrors))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canDeleteMedia || selected.size === 0 || deleting || confirming}
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#515151] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 7h12m-1 0-.6 12H7.6L7 7m3 4v5m4-5v5m-5-9 .8-2h4.4l.8 2" />
          </svg>
          {deleting
            ? t('inventory.bulkImages.deleting')
            : t('inventory.bulkImages.deleteSelected').replace(
                '{count}',
                String(selected.size)
              )}
        </button>
      </div>
    </div>
  );
}

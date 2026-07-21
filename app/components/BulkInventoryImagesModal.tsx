'use client';

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { handleMultipleImageUpload } from '../utils/imageUpload';
import { deleteMediaFile } from '../services/inventoryMediaService';
import {
  INVENTORY_BULK_IMAGE_MAX_FILES,
  INVENTORY_BULK_IMAGE_MAX_SIZE_BYTES,
  INVENTORY_BULK_IMAGE_MAX_SIZE_MB,
  matchInventorySkuFromImageFilename,
} from '../utils/inventoryBulkImageFilename';
import POModalShell from './ui/POModalShell';
import InventoryPhotoManagementPanel from './InventoryPhotoManagementPanel';

type PreparedFile = {
  id: string;
  file: File;
  item?: InventoryItem;
  sequence?: number;
  status: 'ready' | 'invalid' | 'unknown' | 'duplicate';
  message: string;
};

type UploadResult = {
  uploaded: number;
  failed: number;
  errors: string[];
};

interface BulkInventoryImagesModalProps {
  inventory: InventoryItem[];
  canDeleteMedia: boolean;
  onClose: () => void;
  onUpdateInventoryItem: (id: string, update: Partial<InventoryItem>) => Promise<void>;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIdentity(file: File): string {
  return `${file.name.trim().toLocaleLowerCase()}|${file.size}|${file.lastModified}`;
}

export default function BulkInventoryImagesModal({
  inventory,
  canDeleteMedia,
  onClose,
  onUpdateInventoryItem,
}: BulkInventoryImagesModalProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'manage'>('upload');
  const [uploadStep, setUploadStep] = useState<'select' | 'mapping' | 'result'>('select');
  const [files, setFiles] = useState<File[]>([]);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [completedFiles, setCompletedFiles] = useState(0);
  const [limitWarning, setLimitWarning] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);

  const preparedFiles = useMemo<PreparedFile[]>(() => {
    const inventorySkus = inventory.map((item) => item.sku);
    const itemBySku = new Map(
      inventory.map((item) => [item.sku.trim().toLocaleLowerCase(), item])
    );
    const seen = new Set<string>();

    return files
      .map((file): PreparedFile => {
        const id = fileIdentity(file);
        const duplicateKey = `${file.name.trim().toLocaleLowerCase()}|${file.size}`;
        if (seen.has(duplicateKey)) {
          return {
            id,
            file,
            status: 'duplicate',
            message: t('inventory.bulkImages.statusDuplicate'),
          };
        }
        seen.add(duplicateKey);

        if (!file.type.startsWith('image/')) {
          return {
            id,
            file,
            status: 'invalid',
            message: t('inventory.bulkImages.statusNotImage'),
          };
        }
        if (file.size > INVENTORY_BULK_IMAGE_MAX_SIZE_BYTES) {
          return {
            id,
            file,
            status: 'invalid',
            message: t('inventory.bulkImages.statusTooLarge').replace(
              '{size}',
              String(INVENTORY_BULK_IMAGE_MAX_SIZE_MB)
            ),
          };
        }

        const match = matchInventorySkuFromImageFilename(file.name, inventorySkus);
        const automaticItem = match
          ? itemBySku.get(match.sku.trim().toLocaleLowerCase())
          : undefined;
        const overrideId = mappingOverrides[id];
        const item =
          overrideId === undefined
            ? automaticItem
            : inventory.find((candidate) => candidate.id === overrideId);
        if (!item) {
          return {
            id,
            file,
            status: 'unknown',
            message: t('inventory.bulkImages.statusUnknownSku'),
          };
        }

        return {
          id,
          file,
          item,
          sequence: match?.sequence ?? 1,
          status: 'ready',
          message: t('inventory.bulkImages.statusReady'),
        };
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'ready' ? -1 : 1;
        const skuCompare = (a.item?.sku ?? '').localeCompare(b.item?.sku ?? '');
        if (skuCompare !== 0) return skuCompare;
        return (a.sequence ?? 0) - (b.sequence ?? 0);
      });
  }, [files, inventory, mappingOverrides, t]);

  const readyFiles = preparedFiles.filter((entry) => entry.status === 'ready');
  const ignoredFiles = preparedFiles.length - readyFiles.length;

  const addFiles = (incoming: File[]) => {
    if (uploading) return;
    setUploadStep('select');
    setResult(null);
    setCompletedFiles(0);
    setFiles((current) => {
      const remaining = Math.max(0, INVENTORY_BULK_IMAGE_MAX_FILES - current.length);
      const accepted = incoming.slice(0, remaining);
      if (incoming.length > remaining) {
        setLimitWarning(
          t('inventory.bulkImages.fileLimitReached').replace(
            '{count}',
            String(INVENTORY_BULK_IMAGE_MAX_FILES)
          )
        );
      } else {
        setLimitWarning('');
      }
      return [...current, ...accepted];
    });
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const removeFile = (target: File) => {
    if (uploading) return;
    setFiles((current) => current.filter((file) => file !== target));
    setMappingOverrides((current) => {
      const next = { ...current };
      delete next[fileIdentity(target)];
      return next;
    });
    setResult(null);
  };

  const handleUpload = async () => {
    if (readyFiles.length === 0 || uploading) return;
    setUploading(true);
    setCompletedFiles(0);
    setResult(null);

    const groups = new Map<string, { item: InventoryItem; entries: PreparedFile[] }>();
    for (const entry of readyFiles) {
      if (!entry.item) continue;
      const existing = groups.get(entry.item.id);
      if (existing) existing.entries.push(entry);
      else groups.set(entry.item.id, { item: entry.item, entries: [entry] });
    }

    const groupList = Array.from(groups.values());
    let uploaded = 0;
    let failed = 0;
    const errors: string[] = [];

    const uploadGroup = async ({ item, entries }: (typeof groupList)[number]) => {
      let uploadedUrls: string[] = [];
      try {
        const orderedEntries = [...entries].sort(
          (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
        );
        uploadedUrls = await handleMultipleImageUpload(
          orderedEntries.map((entry) => entry.file),
          'images/inventory/',
          undefined,
          { sku: item.sku }
        );
        await onUpdateInventoryItem(item.id, {
          images: [...(item.images ?? []), ...uploadedUrls],
        });
        uploaded += entries.length;
      } catch (error) {
        failed += entries.length;
        errors.push(
          `${item.sku}: ${error instanceof Error ? error.message : t('inventory.bulkImages.unknownError')}`
        );
        if (uploadedUrls.length > 0) {
          await Promise.allSettled(uploadedUrls.map((url) => deleteMediaFile(url)));
        }
      } finally {
        setCompletedFiles((count) => count + entries.length);
      }
    };

    // Limit concurrent SKU groups so a 50-image batch does not saturate the browser.
    for (let index = 0; index < groupList.length; index += 3) {
      await Promise.all(groupList.slice(index, index + 3).map(uploadGroup));
    }

    setResult({ uploaded, failed, errors });
    setUploadStep('result');
    setUploading(false);
  };

  const resetUpload = () => {
    setFiles([]);
    setMappingOverrides({});
    setCompletedFiles(0);
    setLimitWarning('');
    setResult(null);
    setUploadStep('select');
  };

  const safeClose = () => {
    if (!uploading) onClose();
  };

  const progress =
    readyFiles.length > 0 ? Math.round((completedFiles / readyFiles.length) * 100) : 0;

  return (
    <POModalShell
      title={t('inventory.bulkImages.title')}
      titleId="bulk-inventory-images-title"
      maxWidthClass="max-w-6xl"
      panelMaxHeightClass="max-h-[92dvh]"
      onClose={safeClose}
    >
      <div className="flex shrink-0 border-b border-gray-200 px-6">
        {(['upload', 'manage'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            disabled={uploading}
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-[#515151] text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab === 'upload'
              ? t('inventory.bulkImages.uploadTab')
              : t('inventory.bulkImages.manageTab')}
          </button>
        ))}
      </div>

      {activeTab === 'manage' ? (
        <div className="p-6">
          <InventoryPhotoManagementPanel
            inventory={inventory}
            canDeleteMedia={canDeleteMedia}
            onUpdateInventoryItem={onUpdateInventoryItem}
          />
        </div>
      ) : (
        <>
          <div className="space-y-5 p-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
              <span className={uploadStep === 'select' ? 'text-[#515151]' : ''}>
                1. {t('inventory.bulkImages.stepSelect')}
              </span>
              <span>→</span>
              <span className={uploadStep === 'mapping' ? 'text-[#515151]' : ''}>
                2. {t('inventory.bulkImages.stepMap')}
              </span>
              <span>→</span>
              <span className={uploadStep === 'result' ? 'text-[#515151]' : ''}>
                3. {t('inventory.bulkImages.stepResult')}
              </span>
            </div>

            {uploadStep === 'select' && (
              <>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold">{t('inventory.bulkImages.namingTitle')}</p>
                  <p className="mt-1">{t('inventory.bulkImages.namingHint')}</p>
                  <p className="mt-1 text-xs text-blue-700">
                    {t('inventory.bulkImages.limits')
                      .replace('{count}', String(INVENTORY_BULK_IMAGE_MAX_FILES))
                      .replace('{size}', String(INVENTORY_BULK_IMAGE_MAX_SIZE_MB))}
                  </p>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!uploading) setDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setDragging(false);
                    }
                  }}
                  onDrop={handleDrop}
                  className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                    dragging
                      ? 'border-[#515151] bg-[#515151]/10'
                      : 'border-gray-300 bg-gray-50 hover:border-[#515151]'
                  }`}
                >
                  <svg className="mx-auto h-9 w-9 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5V21h18v-4.5M12 3v13.5m0-13.5L7.5 7.5M12 3l4.5 4.5" />
                  </svg>
                  <p className="mt-2 font-semibold text-gray-900">
                    {dragging
                      ? t('inventory.bulkImages.dropHere')
                      : t('inventory.bulkImages.selectOrDrop')}
                  </p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleInputChange}
                    className="hidden"
                  />
                </div>

                {limitWarning && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {limitWarning}
                  </p>
                )}

                {files.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm">
                    <span>
                      {t('inventory.bulkImages.selectedFiles').replace(
                        '{count}',
                        String(files.length)
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={resetUpload}
                      className="font-medium text-gray-500 hover:text-gray-800"
                    >
                      {t('inventory.bulkImages.clear')}
                    </button>
                  </div>
                )}
              </>
            )}

            {uploadStep === 'mapping' && (
              <>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <p className="font-semibold">{t('inventory.bulkImages.mappingTitle')}</p>
                  <p className="mt-1 text-xs">{t('inventory.bulkImages.mappingHint')}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="font-medium text-gray-800">
                    {t('inventory.bulkImages.summary')
                      .replace('{ready}', String(readyFiles.length))
                      .replace('{ignored}', String(ignoredFiles))}
                  </p>
                </div>
                <div className="max-h-[52dvh] overflow-y-auto rounded-xl border border-gray-200">
                  <ul className="divide-y divide-gray-100">
                    {preparedFiles.map((entry, index) => (
                      <li
                        key={`${entry.id}-${index}`}
                        className="grid items-center gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)_auto]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{entry.file.name}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {formatFileSize(entry.file.size)} · {entry.message}
                          </p>
                        </div>
                        <select
                          value={entry.item?.id ?? ''}
                          disabled={entry.status === 'invalid' || entry.status === 'duplicate'}
                          onChange={(event) =>
                            setMappingOverrides((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            entry.item ? 'border-green-300' : 'border-amber-300'
                          }`}
                        >
                          <option value="">{t('inventory.bulkImages.unmapped')}</option>
                          {inventory
                            .slice()
                            .sort((a, b) => a.sku.localeCompare(b.sku))
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.sku} · {item.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeFile(entry.file)}
                          className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          aria-label={t('common.delete')}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                {uploading && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs font-medium text-gray-600">
                      <span>{t('inventory.bulkImages.uploading')}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-[#515151] transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </>
            )}

            {uploadStep === 'result' && result && (
              <div className={`rounded-xl border p-5 text-sm ${
                result.failed === 0
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}>
                <p className="font-semibold">
                  {t('inventory.bulkImages.result')
                    .replace('{uploaded}', String(result.uploaded))
                    .replace('{failed}', String(result.failed))}
                </p>
                {result.errors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {result.errors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="sasa-modal-footer flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
            {uploadStep === 'select' && (
              <>
                <button type="button" onClick={safeClose} className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200">
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => setUploadStep('mapping')}
                  disabled={files.length === 0}
                  className="rounded-lg bg-[#515151] px-4 py-2 font-medium text-white hover:bg-black disabled:opacity-50"
                >
                  {t('inventory.bulkImages.reviewMapping')}
                </button>
              </>
            )}
            {uploadStep === 'mapping' && (
              <>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setUploadStep('select')}
                  className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  {t('common.back')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={uploading || readyFiles.length === 0}
                  className="rounded-lg bg-[#515151] px-4 py-2 font-medium text-white hover:bg-black disabled:opacity-50"
                >
                  {uploading
                    ? t('inventory.bulkImages.uploading')
                    : t('inventory.bulkImages.confirmUpload').replace(
                        '{count}',
                        String(readyFiles.length)
                      )}
                </button>
              </>
            )}
            {uploadStep === 'result' && (
              <>
                <button type="button" onClick={safeClose} className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200">
                  {t('common.close')}
                </button>
                <button type="button" onClick={resetUpload} className="rounded-lg bg-[#515151] px-4 py-2 font-medium text-white hover:bg-black">
                  {t('inventory.bulkImages.uploadMore')}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </POModalShell>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdditionalCost, InventoryItem, PurchaseOrder } from '../types';
import { useTranslation } from '../context/TranslationContext';
import {
  PREDEFINED_CATEGORIES_ES,
  PREDEFINED_LINES_ES,
  MATERIAL_CATEGORY_ES,
  MATERIAL_UNITS_ES,
} from '../constants/merchandise';
import { allKnownCategoryKeys, allKnownLineKeys } from '../constants/merchandise';
import {
  isMaterialCategory,
  formatMaterialStock,
  normalizeMaterialUnit,
  roundMaterialQty,
  type MaterialUnit,
} from '../utils/materials';
import {
  buildBomSignature,
  calculateBuildUnitCost,
  collectComponentSourceImages,
  findInventoryByBomSignature,
  getBuildableInventory,
  mergeSourceImages,
  mergeUnitCost,
  toBillOfMaterialsLines,
  validateBuild,
  type BuildComponentInput,
} from '../utils/productBuild';
import {
  collectUsedSkus,
  generateUniqueSKU,
  resolveInternalSku,
} from '../utils/skuGenerator';

type Props = {
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  additionalCosts: AdditionalCost[];
  existingCategories: string[];
  existingLines: string[];
  onCancel: () => void;
  onBuilt: () => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => Promise<string>;
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>;
};

type ComponentRow = {
  inventoryId: string;
  quantityPerUnit: string;
  searchQuery: string;
  unitOfMeasure: MaterialUnit | '';
};

const emptyComponentRow = (): ComponentRow => ({
  inventoryId: '',
  quantityPerUnit: '',
  searchQuery: '',
  unitOfMeasure: '',
});

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent';

function materialDisplayLabel(item: InventoryItem): string {
  return `${item.sku} · ${item.name || item.description}`;
}

export default function InventoryBuildProductForm({
  inventory,
  purchaseOrders,
  additionalCosts,
  existingCategories,
  existingLines,
  onCancel,
  onBuilt,
  addInventoryItem,
  updateInventoryItem,
}: Props) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [line, setLine] = useState('');
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select');
  const [lineMode, setLineMode] = useState<'select' | 'new'>('select');
  const [sku, setSku] = useState('');
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [quantityProduced, setQuantityProduced] = useState('1');
  const [components, setComponents] = useState<ComponentRow[]>([emptyComponentRow()]);
  const [openSearchIndex, setOpenSearchIndex] = useState<number | null>(null);
  const [matchedExisting, setMatchedExisting] = useState<InventoryItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const materialsSectionRef = useRef<HTMLDivElement>(null);

  const materials = useMemo(() => getBuildableInventory(inventory), [inventory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        materialsSectionRef.current &&
        !materialsSectionRef.current.contains(event.target as Node)
      ) {
        setOpenSearchIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sellableCategories = useMemo(
    () =>
      [...PREDEFINED_CATEGORIES_ES].filter((c) => c !== MATERIAL_CATEGORY_ES),
    []
  );

  const parsedComponents: BuildComponentInput[] = useMemo(() => {
    const raw = components
      .map((row) => {
        const item = inventory.find((i) => i.id === row.inventoryId);
        const qty = parseFloat((row.quantityPerUnit || '').replace(',', '.'));
        if (!item || !Number.isFinite(qty) || qty <= 0) return null;
        return {
          inventoryId: item.id,
          sku: item.sku,
          quantityPerUnit: roundMaterialQty(qty),
        };
      })
      .filter((c): c is BuildComponentInput => c != null);

    const merged = new Map<string, BuildComponentInput>();
    for (const c of raw) {
      const prev = merged.get(c.inventoryId);
      if (prev) {
        merged.set(c.inventoryId, {
          ...prev,
          quantityPerUnit: roundMaterialQty(prev.quantityPerUnit + c.quantityPerUnit),
        });
      } else {
        merged.set(c.inventoryId, c);
      }
    }
    return [...merged.values()];
  }, [components, inventory]);

  const bomSignature = useMemo(
    () => buildBomSignature(parsedComponents),
    [parsedComponents]
  );

  const costResult = useMemo(
    () =>
      calculateBuildUnitCost(
        parsedComponents,
        inventory,
        purchaseOrders,
        additionalCosts
      ),
    [parsedComponents, inventory, purchaseOrders, additionalCosts]
  );

  const qtyProducedNum = Math.max(0, parseFloat((quantityProduced || '').replace(',', '.')) || 0);

  useEffect(() => {
    if (!bomSignature) {
      setMatchedExisting(null);
      return;
    }
    const existing = findInventoryByBomSignature(inventory, bomSignature);
    setMatchedExisting(existing ?? null);
    if (existing && !skuManuallyEdited) {
      setSku(existing.sku);
      if (!description.trim()) {
        setDescription(existing.description || existing.name);
      }
      if (!category) setCategory(existing.category);
      if (!line) setLine(existing.line);
    }
  }, [bomSignature, inventory, skuManuallyEdited]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skuManuallyEdited || matchedExisting) return;
    if (!category || !line) return;
    const resolved = resolveInternalSku({
      category,
      line,
      inventory,
      purchaseOrders,
    });
    setSku(resolved);
  }, [category, line, inventory, purchaseOrders, skuManuallyEdited, matchedExisting]);

  const addComponentRow = () => {
    setComponents((prev) => [...prev, emptyComponentRow()]);
  };

  const removeComponentRow = (index: number) => {
    setComponents((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
    setOpenSearchIndex(null);
  };

  const selectMaterial = (index: number, material: InventoryItem) => {
    const uom = isMaterialCategory(material.category)
      ? normalizeMaterialUnit(material.unitOfMeasure) || 'unidad'
      : 'unidad';
    setComponents((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        inventoryId: material.id,
        searchQuery: materialDisplayLabel(material),
        unitOfMeasure: uom,
        quantityPerUnit: next[index].quantityPerUnit || '1',
      };
      return next;
    });
    setOpenSearchIndex(null);
    setSkuManuallyEdited(false);
  };

  const filterMaterialsForRow = (row: ComponentRow, index: number) => {
    const selectedIds = new Set(
      components.map((c, i) => (i !== index && c.inventoryId ? c.inventoryId : '')).filter(Boolean)
    );
    const available = materials.filter((m) => !selectedIds.has(m.id) || m.id === row.inventoryId);
    const q = row.searchQuery.trim().toLowerCase();
    if (!q) return available;
    const selected = inventory.find((i) => i.id === row.inventoryId);
    // While a material is selected and the input shows its label, keep full list for browsing.
    if (selected && materialDisplayLabel(selected).toLowerCase() === q) {
      return available;
    }
    return available.filter(
      (m) =>
        m.sku.toLowerCase().includes(q) ||
        (m.name || '').toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q) ||
        (m.line || '').toLowerCase().includes(q)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validation = validateBuild(
      parsedComponents,
      qtyProducedNum,
      inventory,
      category,
      line
    );
    if (validation) {
      if (validation.code === 'no_components') {
        setError(t('inventory.buildNoComponents') || 'Agregue al menos un componente.');
      } else if (validation.code === 'invalid_qty_produced') {
        setError(t('inventory.buildInvalidQty') || 'Indique cuántas unidades producir.');
      } else if (validation.code === 'missing_category_line') {
        setError(t('inventory.buildNeedCategoryLine') || 'Indique categoría y línea del producto.');
      } else if (validation.code === 'insufficient_stock') {
        setError(
          (
            t('inventory.buildInsufficientStock') ||
            'Stock insuficiente de {sku}: necesita {needed}, hay {available}.'
          )
            .replace('{sku}', validation.sku)
            .replace('{needed}', String(validation.needed))
            .replace('{available}', String(validation.available))
        );
      }
      return;
    }

    if (isMaterialCategory(category)) {
      setError(
        t('inventory.buildCategoryCannotBeMaterial') ||
          'El producto terminado no puede tener categoría Materiales.'
      );
      return;
    }

    const productLabel = description.trim();
    if (!productLabel) {
      setError(t('inventory.buildNeedDescription') || 'Indique la descripción del producto.');
      return;
    }

    setSubmitting(true);
    try {
      const bomLines = toBillOfMaterialsLines(parsedComponents, costResult.lines);
      const unitCost = costResult.unitCost;
      const sourceImages = collectComponentSourceImages(parsedComponents, inventory);
      const existing =
        matchedExisting ||
        (bomSignature ? findInventoryByBomSignature(inventory, bomSignature) : undefined);

      // Deduct every component from inventory (materials, cadenas, aretes, etc.)
      for (const c of parsedComponents) {
        const item = inventory.find((i) => i.id === c.inventoryId);
        if (!item) continue;
        const deduct = roundMaterialQty(c.quantityPerUnit * qtyProducedNum);
        const nextStock = roundMaterialQty((item.ecuadorStock ?? 0) - deduct);
        const patch: Partial<InventoryItem> = {
          ecuadorStock: Math.max(0, nextStock),
        };
        if (isMaterialCategory(item.category)) {
          const rowUom = components.find((r) => r.inventoryId === c.inventoryId)?.unitOfMeasure;
          patch.unitOfMeasure =
            normalizeMaterialUnit(rowUom) ||
            normalizeMaterialUnit(item.unitOfMeasure) ||
            'unidad';
        }
        await updateInventoryItem(item.id, patch);
      }

      if (existing) {
        const nextStock = roundMaterialQty((existing.ecuadorStock ?? 0) + qtyProducedNum);
        const nextUnitCost = mergeUnitCost(
          existing.ecuadorStock ?? 0,
          existing.unitCost,
          qtyProducedNum,
          unitCost
        );
        const mergedSourceImages = mergeSourceImages(existing.sourceImages, sourceImages);
        await updateInventoryItem(existing.id, {
          ecuadorStock: nextStock,
          ...(nextUnitCost != null ? { unitCost: nextUnitCost } : {}),
          billOfMaterials: bomLines,
          bomSignature,
          name: productLabel,
          description: productLabel,
          category,
          line,
          // Keep principal gallery empty of component photos; only merge reference photos.
          ...(mergedSourceImages.length > 0 ? { sourceImages: mergedSourceImages } : {}),
        });
      } else {
        const pool = collectUsedSkus(inventory, purchaseOrders);
        const finalSku =
          (sku || '').trim() || generateUniqueSKU(category, line, pool);
        await addInventoryItem({
          name: productLabel,
          supplierSKU: '',
          linkedPurchaseOrders: [],
          sku: finalSku,
          description: productLabel,
          category,
          line,
          ecuadorStock: qtyProducedNum,
          consignmentStock: 0,
          // New built product: no display photo. Component photos go to sourceImages only.
          images: [],
          ...(sourceImages.length > 0 ? { sourceImages } : {}),
          ...(unitCost != null ? { unitCost } : {}),
          billOfMaterials: bomLines,
          bomSignature,
        });
      }

      onBuilt();
    } catch (err) {
      console.error('Error building product:', err);
      setError(t('inventory.buildError') || 'No se pudo construir el producto.');
    } finally {
      setSubmitting(false);
    }
  };

  const knownCats = allKnownCategoryKeys();
  const knownLines = allKnownLineKeys();
  const otherCats = existingCategories.filter((c) => !knownCats.has(c) && !isMaterialCategory(c));
  const otherLines = existingLines.filter((l) => !knownLines.has(l));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-500">
        {t('inventory.buildIntro') ||
          'Elija artículos del inventario (materiales, cadenas, aretes, etc.), la cantidad por unidad terminada y cuántas unidades producir. Se descontará el stock de cada componente y se creará o actualizará el producto.'}
      </p>

      {matchedExisting && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {(
            t('inventory.buildMatchedExisting') ||
            'Misma receta que {sku} — se sumará stock a ese artículo.'
          ).replace('{sku}', matchedExisting.sku)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('inventory.description')} *
          </label>
          <input
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              t('inventory.buildDescriptionPlaceholder') ||
              'Ej. Cadena con dije y broche'
            }
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('inventory.buildDescriptionHint') ||
              'Misma descripción que usas en órdenes de compra / inventario.'}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('inventory.buildQtyToProduce') || 'Cantidad a producir'}
          </label>
          <input
            type="number"
            min={0.001}
            step="any"
            required
            value={quantityProduced}
            onChange={(e) => setQuantityProduced(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('inventory.categoryRequired')}
          </label>
          {categoryMode === 'select' ? (
            <select
              required
              value={category}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setCategoryMode('new');
                  setCategory('');
                } else {
                  setCategory(e.target.value);
                }
              }}
              className={inputClass}
            >
              <option value="">{t('inventory.selectCategory')}</option>
              {sellableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              {otherCats.length > 0 && (
                <optgroup label={t('inventory.otherCategories')}>
                  {otherCats.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="__new__">{t('inventory.addNewCategory')}</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`flex-1 ${inputClass}`}
                autoFocus
              />
              <button type="button" onClick={() => setCategoryMode('select')} className="text-sm text-gray-600">
                {t('inventory.cancel')}
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('inventory.lineRequired')}
          </label>
          {lineMode === 'select' ? (
            <select
              required
              value={line}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setLineMode('new');
                  setLine('');
                } else {
                  setLine(e.target.value);
                }
              }}
              className={inputClass}
            >
              <option value="">{t('inventory.selectLine')}</option>
              {[...PREDEFINED_LINES_ES].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              {otherLines.length > 0 && (
                <optgroup label={t('inventory.otherLines')}>
                  {otherLines.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="__new__">{t('inventory.addNewLine')}</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={line}
                onChange={(e) => setLine(e.target.value)}
                className={`flex-1 ${inputClass}`}
                autoFocus
              />
              <button type="button" onClick={() => setLineMode('select')} className="text-sm text-gray-600">
                {t('inventory.cancel')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">SKU</label>
        <input
          type="text"
          value={sku}
          onChange={(e) => {
            setSkuManuallyEdited(true);
            setSku(e.target.value);
          }}
          className={inputClass}
          disabled={!!matchedExisting}
        />
        <p className="mt-1 text-xs text-gray-500">
          {matchedExisting
            ? t('inventory.buildSkuFromRecipe') ||
              'SKU tomado de un producto con la misma receta de materiales.'
            : t('inventory.buildSkuHint') ||
              'Se sugiere con la lógica de categoría + línea; si la receta ya existía, se reutiliza ese SKU.'}
        </p>
      </div>

      <div ref={materialsSectionRef} className="space-y-3 rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-900">
            {t('inventory.buildMaterialsTitle') || 'Componentes por unidad terminada'}
          </h4>
          <button
            type="button"
            onClick={addComponentRow}
            className="text-sm font-medium text-[#515151] hover:text-black"
          >
            + {t('inventory.buildAddMaterial') || 'Componente'}
          </button>
        </div>

        {materials.length === 0 ? (
          <p className="text-sm text-amber-700">
            {t('inventory.buildNoMaterialsInStock') ||
              'No hay artículos con stock en inventario para usar como componentes.'}
          </p>
        ) : (
          components.map((row, index) => {
            const selected = inventory.find((i) => i.id === row.inventoryId);
            const selectedIsMaterial = selected ? isMaterialCategory(selected.category) : false;
            const filtered = filterMaterialsForRow(row, index);
            const costLine = costResult.lines.find((l) => l.inventoryId === row.inventoryId);
            const showDropdown = openSearchIndex === index;

            return (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                <div className="relative sm:col-span-5">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t('inventory.buildMaterial') || 'Artículo'}
                  </label>
                  <input
                    type="text"
                    value={row.searchQuery}
                    placeholder={
                      t('inventory.buildSearchMaterial') ||
                      'Escriba SKU o nombre (material, cadena, arete…)'
                    }
                    onChange={(e) => {
                      const next = [...components];
                      next[index] = {
                        ...next[index],
                        searchQuery: e.target.value,
                        inventoryId: '',
                        unitOfMeasure: '',
                      };
                      setComponents(next);
                      setOpenSearchIndex(index);
                      setSkuManuallyEdited(false);
                    }}
                    onFocus={() => setOpenSearchIndex(index)}
                    className={inputClass}
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    value={row.inventoryId}
                    required
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none absolute h-0 w-0 opacity-0"
                    onChange={() => {}}
                  />
                  {showDropdown && (
                    <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
                      {filtered.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">
                          {t('inventory.buildNoMaterialMatch') || 'Sin resultados'}
                        </div>
                      ) : (
                        filtered.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => selectMaterial(index, m)}
                            className="w-full border-b border-gray-100 px-4 py-2 text-left last:border-b-0 hover:bg-gray-100"
                          >
                            <div className="font-mono text-sm font-semibold text-[#515151]">
                              {m.sku}
                            </div>
                            <div className="text-sm text-gray-600">
                              {m.name || m.description}
                            </div>
                            <div className="text-xs text-gray-500">
                              {t('inventory.ecuadorStockLabel') || 'Stock'}:{' '}
                              {formatMaterialStock(m.ecuadorStock, m.unitOfMeasure)}
                              {' · '}
                              {m.category}
                              {' · '}
                              {m.line}
                              {m.unitOfMeasure && isMaterialCategory(m.category)
                                ? ` · ${t(`inventory.materialUnit.${m.unitOfMeasure}`) || m.unitOfMeasure}`
                                : ''}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t('inventory.buildQtyPerUnit') || 'Cant. por unidad'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={row.quantityPerUnit}
                    onChange={(e) => {
                      const next = [...components];
                      next[index] = { ...next[index], quantityPerUnit: e.target.value };
                      setComponents(next);
                      setSkuManuallyEdited(false);
                    }}
                    className={inputClass}
                    required
                    disabled={!row.inventoryId}
                    placeholder={
                      row.unitOfMeasure === 'metro' || row.unitOfMeasure === 'gramo' ? '0.5' : '1'
                    }
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t('inventory.unitOfMeasure') || 'Unidad de medida'}
                  </label>
                  {selectedIsMaterial ? (
                    <select
                      value={row.unitOfMeasure || ''}
                      onChange={(e) => {
                        const next = [...components];
                        next[index] = {
                          ...next[index],
                          unitOfMeasure: e.target.value as MaterialUnit,
                        };
                        setComponents(next);
                      }}
                      className={inputClass}
                      required={!!row.inventoryId}
                      disabled={!row.inventoryId}
                    >
                      <option value="">
                        {t('inventory.buildSelectUnit') || 'Seleccionar…'}
                      </option>
                      {MATERIAL_UNITS_ES.map((u) => (
                        <option key={u} value={u}>
                          {t(`inventory.materialUnit.${u}`) || u}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-600">
                      {row.inventoryId
                        ? t('inventory.materialUnit.unidad') || 'Unidades'
                        : '—'}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t('inventory.buildLineCost') || 'Costo'}
                  </label>
                  <div className="px-3 py-2 text-sm tabular-nums text-gray-700">
                    {costLine?.lineCost != null ? `$${costLine.lineCost.toFixed(4)}` : '—'}
                  </div>
                </div>

                <div className="sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => removeComponentRow(index)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    {t('common.delete') || 'Eliminar'}
                  </button>
                </div>

                {selected && (
                  <p className="sm:col-span-12 -mt-1 text-xs text-gray-500">
                    {t('inventory.buildMaterialStockHint') || 'Disponible'}:{' '}
                    {formatMaterialStock(
                      selected.ecuadorStock,
                      row.unitOfMeasure || selected.unitOfMeasure
                    )}
                    {costLine?.unitCost != null
                      ? ` · ${t('inventory.buildMaterialUnitCost') || 'Costo unitario'}: $${costLine.unitCost.toFixed(4)}`
                      : ''}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>{t('inventory.buildUnitCost') || 'Costo por unidad terminada'}</span>
          <span className="text-lg font-semibold tabular-nums text-gray-900">
            {costResult.unitCost != null ? `$${costResult.unitCost.toFixed(4)}` : '—'}
          </span>
        </div>
        {qtyProducedNum > 0 && costResult.unitCost != null && (
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>
              {t('inventory.buildTotalCost') || 'Costo total del lote'} ({qtyProducedNum} ud)
            </span>
            <span className="tabular-nums">
              ${(costResult.unitCost * qtyProducedNum).toFixed(4)}
            </span>
          </div>
        )}
        {costResult.missingCostSkus.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {(
              t('inventory.buildMissingCosts') ||
              'Sin costo de desembarque para: {skus}. El producto se creará igual; el costo quedará pendiente.'
            ).replace('{skus}', costResult.missingCostSkus.join(', '))}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={submitting || materials.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#515151] px-5 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {t('inventory.buildSubmitting') || 'Construyendo…'}
            </>
          ) : (
            t('inventory.buildSubmit') || 'Construir producto'
          )}
        </button>
      </div>
    </form>
  );
}

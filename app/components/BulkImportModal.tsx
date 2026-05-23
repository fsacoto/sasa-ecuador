'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { parseCSV, detectColumnMapping, cleanNumericValue, ParsedRow } from '../utils/csvParser';
import { useInventory } from '../context/InventoryContext';
import { attachBarcodesToPurchaseOrdersBulk } from '../utils/syncUpdates';
import { resolveInternalSku, collectUsedSkus, findInternalSkuBySupplierSku } from '../utils/skuGenerator';
import { PurchaseOrder, InventoryItem } from '../types';
import { getExchangeRates, getExchangeRate, type ExchangeRateResponse } from '../utils/currencyApi';
import { PREDEFINED_CATEGORIES_ES, PREDEFINED_LINES_ES } from '../constants/merchandise';
import { canonicalCategory, canonicalLine } from '../utils/merchandiseLabels';
import { useTranslation } from '../context/TranslationContext';
import { upsertBulkImportSession, loadBulkImportSession, deleteBulkImportSession, findBulkImportSessionByLabel } from '../utils/bulkImportDraftStorage';
import {
  BULK_IMPORT_EDIT_COLUMNS,
  getPurchaseOrdersForBulkImportGroup,
  isLegacyBulkImportGroupId,
} from '../utils/bulkImportSystem';
import { cleanupInventoryAfterOrderDeletion } from '../utils/syncUpdates';
import POModalShell from './ui/POModalShell';

type BulkImportDbField =
  | 'invoice'
  | 'supplierSKU'
  | 'supplier'
  | 'description'
  | 'quantity'
  | 'costPerUnit'
  | 'totalCost'
  | 'category'
  | 'line';

const BULK_IMPORT_TABLE_FIELD_ORDER: BulkImportDbField[] = [
  'invoice',
  'supplierSKU',
  'supplier',
  'description',
  'quantity',
  'costPerUnit',
  'totalCost',
  'category',
  'line',
];

const NUMERIC_IMPORT_FIELDS = new Set<BulkImportDbField>(['quantity', 'costPerUnit', 'totalCost']);

interface BulkImportModalProps {
  onClose: () => void;
  /** Resume a local draft (new import only, not shown in «Editar importación masiva»). */
  pendingId?: string | null;
  /** Edit a bulk import already saved in the system (group id from listBulkImportGroups). */
  editBulkImportId?: string | null;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';

export default function BulkImportModal({
  onClose,
  pendingId = null,
  editBulkImportId = null,
}: BulkImportModalProps) {
  const { t } = useTranslation();
  const {
    addPurchaseOrdersBulk,
    deletePurchaseOrdersBulk,
    inventory,
    purchaseOrders,
    suppliers,
    addSupplier,
    updatePurchaseOrder,
    updateInventoryItem,
  } = useInventory();
  const isSystemEdit = Boolean(editBulkImportId);
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<{ [key: string]: string }>({});
  const [defaultSupplier, setDefaultSupplier] = useState<string>('');
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [exchangeRateManuallySet, setExchangeRateManuallySet] = useState<boolean>(false);
  const [invoicePrefix, setInvoicePrefix] = useState<string>('');
  const [invoiceLink, setInvoiceLink] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [importResults, setImportResults] = useState<{ success: number; warnings: number; autoLinked?: number }>({ success: 0, warnings: 0, autoLinked: 0 });
  const [initialLoading, setInitialLoading] = useState(() => Boolean(pendingId || editBulkImportId));
  const [orderIdsByRow, setOrderIdsByRow] = useState<(string | null)[]>([]);
  const hydrateConsumedRef = useRef(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState('');
  const activeSessionIdRef = useRef<string | null>(null);

  // Cache to track suppliers being created during import to prevent duplicates
  const supplierCacheRef = useRef<Map<string, Promise<string>>>(new Map());
  const suppliersSnapshotRef = useRef(suppliers);
  const importInFlightRef = useRef(false);
  const [importTrigger, setImportTrigger] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    suppliersSnapshotRef.current = suppliers;
  }, [suppliers]);

  const mapFieldLabel = (dbField: string) => {
    const key = `bulkImport.mapField_${dbField}`;
    const label = t(key);
    return label === key ? dbField : label;
  };

  const mapFieldTableLabel = (dbField: BulkImportDbField) => {
    const shortKey = `bulkImport.mapFieldShort_${dbField}`;
    const short = t(shortKey);
    if (short !== shortKey) return short;
    return mapFieldLabel(dbField);
  };

  const mappedTableColumns = useMemo(() => {
    if (isSystemEdit) {
      return BULK_IMPORT_EDIT_COLUMNS.map((field) => ({
        dbField: field as BulkImportDbField,
        csvColumn: field,
        label: mapFieldTableLabel(field as BulkImportDbField),
      }));
    }
    const csvByField = new Map<BulkImportDbField, string>();
    for (const [csvColumn, dbField] of Object.entries(columnMapping)) {
      if (!dbField || dbField === 'sku') continue;
      const field = dbField as BulkImportDbField;
      if (!BULK_IMPORT_TABLE_FIELD_ORDER.includes(field)) continue;
      if (!csvByField.has(field)) csvByField.set(field, csvColumn);
    }
    return BULK_IMPORT_TABLE_FIELD_ORDER.filter((field) => csvByField.has(field)).map((field) => ({
      dbField: field,
      csvColumn: csvByField.get(field)!,
      label: mapFieldTableLabel(field),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnMapping, t, isSystemEdit]);

  const updateImportCell = useCallback((rowIndex: number, csvColumn: string, value: string) => {
    setParsedData((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [csvColumn]: value };
      return next;
    });
  }, []);

  // Exchange rates state
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateResponse | null>(null);

  // Fetch exchange rates when component mounts
  useEffect(() => {
    const fetchRates = async () => {
      const rates = await getExchangeRates('USD');
      if (rates) {
        setExchangeRates(rates);
      }
    };
    fetchRates();
  }, []);

  // Auto-update exchange rate when currency changes (only if rate hasn't been manually set)
  useEffect(() => {
    if (exchangeRates && defaultCurrency !== 'USD' && !exchangeRateManuallySet) {
      const rate = getExchangeRate(defaultCurrency, 'USD', exchangeRates);
      setExchangeRate(rate);
    } else if (defaultCurrency === 'USD' && !exchangeRateManuallySet) {
      // Reset to 1 for USD if not manually set
      setExchangeRate(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCurrency, exchangeRates, exchangeRateManuallySet]);

  useEffect(() => {
    if (!editBulkImportId) return;
    if (hydrateConsumedRef.current) return;
    hydrateConsumedRef.current = true;

    const orders = getPurchaseOrdersForBulkImportGroup(purchaseOrders, editBulkImportId);
    if (orders.length === 0) {
      alert(t('bulkImport.groupNotFound'));
      onClose();
      setInitialLoading(false);
      return;
    }

    supplierCacheRef.current.clear();
    const identityMapping: Record<string, string> = {};
    for (const col of BULK_IMPORT_EDIT_COLUMNS) {
      identityMapping[col] = col;
    }

    const rows = orders.map((po) => {
      const supplierName = suppliers.find((s) => s.id === po.supplierId)?.name ?? '';
      return {
        invoice: po.invoice,
        supplierSKU: po.supplierSKU,
        supplier: supplierName,
        description: po.description,
        quantity: po.quantity,
        costPerUnit: po.costPerUnit,
        totalCost: po.totalCost,
        category: po.category,
        line: po.line,
      };
    });

    const first = orders[0];
    setHeaders([...BULK_IMPORT_EDIT_COLUMNS]);
    setParsedData(rows);
    setColumnMapping(identityMapping);
    setOrderIdsByRow(orders.map((o) => o.id));
    setSessionLabel(first.bulkImportLabel?.trim() || first.invoice);
    setInvoiceLink(first.invoiceLink ?? '');
    setInvoicePrefix('');
    setPurchaseDate(
      first.purchaseDate
        ? first.purchaseDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
    );
    setDefaultSupplier(first.supplierId ?? '');
    setDefaultCurrency(first.currency || 'USD');
    setExchangeRate(typeof first.exchangeRate === 'number' && !Number.isNaN(first.exchangeRate) ? first.exchangeRate : 1);
    setExchangeRateManuallySet(true);
    setImportResults({ success: 0, warnings: 0, autoLinked: 0 });
    setStep('mapping');
    setInitialLoading(false);
  }, [editBulkImportId, purchaseOrders, suppliers, onClose, t]);

  useEffect(() => {
    if (editBulkImportId) return;
    if (!pendingId) {
      setInitialLoading(false);
      return;
    }
    if (hydrateConsumedRef.current) return;
    hydrateConsumedRef.current = true;

    const draft = loadBulkImportSession(pendingId);
    if (!draft) {
      alert(t('bulkImport.sessionNotFound'));
      onClose();
      setInitialLoading(false);
      return;
    }

    supplierCacheRef.current.clear();
    setActiveSessionId(draft.id);
    activeSessionIdRef.current = draft.id;
    setSessionLabel(draft.label);
    setHeaders(draft.headers);
    setParsedData(draft.parsedData);
    setColumnMapping(draft.columnMapping);
    setInvoicePrefix(draft.invoicePrefix ?? '');
    setInvoiceLink(draft.invoiceLink ?? '');
    setPurchaseDate(draft.purchaseDate || new Date().toISOString().split('T')[0]);
    setDefaultSupplier(draft.defaultSupplier ?? '');
    setDefaultCurrency(draft.defaultCurrency || 'USD');
    setExchangeRate(typeof draft.exchangeRate === 'number' && !Number.isNaN(draft.exchangeRate) ? draft.exchangeRate : 1);
    setExchangeRateManuallySet(Boolean(draft.exchangeRateManuallySet));
    setImportResults({ success: 0, warnings: 0, autoLinked: 0 });
    setStep('mapping');
    setInitialLoading(false);
  }, [pendingId, editBulkImportId, onClose, t]);

  const savePending = useCallback(() => {
    if (isSystemEdit) return null;
    if (step !== 'mapping' || parsedData.length === 0) return null;
    const label = sessionLabel.trim() || t('bulkImport.defaultSessionLabel');
    return upsertBulkImportSession({
      id: activeSessionIdRef.current ?? undefined,
      label,
      headers,
      parsedData,
      columnMapping,
      invoicePrefix,
      invoiceLink,
      purchaseDate,
      defaultSupplier,
      defaultCurrency,
      exchangeRate,
      exchangeRateManuallySet,
    });
  }, [
    step,
    sessionLabel,
    t,
    headers,
    parsedData,
    columnMapping,
    invoicePrefix,
    invoiceLink,
    purchaseDate,
    defaultSupplier,
    defaultCurrency,
    exchangeRate,
    exchangeRateManuallySet,
    isSystemEdit,
  ]);

  useEffect(() => {
    if (isSystemEdit) return;
    if (initialLoading) return;
    if (step !== 'mapping' || parsedData.length === 0) return;
    const nextId = upsertBulkImportSession({
      id: activeSessionIdRef.current ?? undefined,
      label: sessionLabel.trim() || t('bulkImport.defaultSessionLabel'),
      headers,
      parsedData,
      columnMapping,
      invoicePrefix,
      invoiceLink,
      purchaseDate,
      defaultSupplier,
      defaultCurrency,
      exchangeRate,
      exchangeRateManuallySet,
    });
    if (nextId) {
      activeSessionIdRef.current = nextId;
      if (nextId !== activeSessionId) setActiveSessionId(nextId);
    }
  }, [
    initialLoading,
    step,
    activeSessionId,
    sessionLabel,
    t,
    headers,
    parsedData,
    columnMapping,
    invoicePrefix,
    invoiceLink,
    purchaseDate,
    defaultSupplier,
    defaultCurrency,
    exchangeRate,
    exchangeRateManuallySet,
    isSystemEdit,
  ]);

  const addEditRow = useCallback(() => {
    const empty: ParsedRow = {};
    for (const col of BULK_IMPORT_EDIT_COLUMNS) {
      empty[col] = col === 'invoice' ? parsedData[0]?.invoice ?? '' : '';
    }
    setParsedData((prev) => [...prev, empty]);
    setOrderIdsByRow((prev) => [...prev, null]);
  }, [parsedData]);

  const removeEditRow = useCallback((rowIndex: number) => {
    setParsedData((prev) => prev.filter((_, i) => i !== rowIndex));
    setOrderIdsByRow((prev) => prev.filter((_, i) => i !== rowIndex));
  }, []);

  const handleRequestClose = useCallback(() => {
    savePending();
    onClose();
  }, [savePending, onClose]);

  // Helper functions to match values with database
  const findMatchingSupplier = async (supplierName: string, currency: string = 'USD'): Promise<string> => {
    if (!supplierName || supplierName.trim() === '') return defaultSupplier;

    const displayName = supplierName.trim();
    const key = displayName.toLowerCase();

    if (supplierCacheRef.current.has(key)) {
      return await supplierCacheRef.current.get(key)!;
    }

    const exactLocal = suppliers.find((s) => s.name.trim().toLowerCase() === key);
    if (exactLocal) {
      supplierCacheRef.current.set(key, Promise.resolve(exactLocal.id));
      return exactLocal.id;
    }

    const supplierPromise = (async () => {
      try {
        const exactDb = suppliersSnapshotRef.current.find(
          (s) => s.name.trim().toLowerCase() === key
        );
        if (exactDb) {
          return exactDb.id;
        }

        const newId = await addSupplier({
          name: displayName,
          email: '',
          phone: '',
          country: '',
          currency: currency || 'USD',
          notes: 'Auto-created from bulk import',
        });
        suppliersSnapshotRef.current = [
          ...suppliersSnapshotRef.current,
          {
            id: newId,
            name: displayName,
            email: '',
            phone: '',
            country: '',
            currency: currency || 'USD',
            notes: 'Auto-created from bulk import',
            createdAt: new Date(),
          },
        ];
        return newId;
      } catch (error) {
        console.error('Error resolving supplier:', error);
        return defaultSupplier;
      }
    })();

    supplierCacheRef.current.set(key, supplierPromise);

    return await supplierPromise;
  };

  const findMatchingCategory = (
    categoryName: string,
    existingCategories: string[] = [...new Set(inventory.map((item) => item.category))]
  ): string => {
    if (!categoryName) return '';
    const canon = canonicalCategory(categoryName.trim());
    const predefined: string[] = [...PREDEFINED_CATEGORIES_ES];
    if (predefined.includes(canon)) return canon;

    const lower = categoryName.toLowerCase();
    const partialMatch = predefined.find(
      (cat) => cat.toLowerCase().includes(lower) || lower.includes(cat.toLowerCase())
    );
    if (partialMatch) return partialMatch;

    const existingMatch = existingCategories.find(
      (cat) => cat && cat.toLowerCase() === categoryName.toLowerCase()
    );
    if (existingMatch) return canonicalCategory(existingMatch);

    return categoryName;
  };

  const findMatchingLine = (
    lineName: string,
    existingLines: string[] = [...new Set(inventory.map((item) => item.line))]
  ): string => {
    if (!lineName) return '';
    const canon = canonicalLine(lineName.trim());
    const predefinedLines: string[] = [...PREDEFINED_LINES_ES];
    if (predefinedLines.includes(canon)) return canon;

    const lower = lineName.toLowerCase();
    const partialMatch = predefinedLines.find(
      (line) => line.toLowerCase().includes(lower) || lower.includes(line.toLowerCase())
    );
    if (partialMatch) return partialMatch;

    const existingMatch = existingLines.find(
      (line) => line && line.toLowerCase() === lineName.toLowerCase()
    );
    if (existingMatch) return canonicalLine(existingMatch);

    return lineName;
  };

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processSelectedFile = (file: File) => {
    if (!file) return;

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      alert(t('bulkImport.excelExportCsv'));
      resetFileInput();
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;

      if (text.includes('PK!') || text.includes('<?xml')) {
        alert(t('bulkImport.excelBinary'));
        resetFileInput();
        return;
      }

      const rows = parseCSV(text);

      if (rows.length > 0) {
        const fileHeaders = Object.keys(rows[0]);
        setHeaders(fileHeaders);
        setParsedData(rows);

        const detectedMapping = detectColumnMapping(fileHeaders);
        const sanitizedMapping = Object.fromEntries(
          Object.entries(detectedMapping).filter(([, v]) => v !== 'sku')
        );

        console.log('CSV Headers detected:', fileHeaders);
        console.log('Auto-detected mapping:', sanitizedMapping);

        setColumnMapping(sanitizedMapping);
        setSessionLabel(file.name);

        const existingDraft = findBulkImportSessionByLabel(file.name);
        const savedId = upsertBulkImportSession({
          id: existingDraft?.id ?? activeSessionIdRef.current ?? undefined,
          label: file.name,
          headers: fileHeaders,
          parsedData: rows,
          columnMapping: sanitizedMapping,
          invoicePrefix: '',
          invoiceLink: '',
          purchaseDate: new Date().toISOString().split('T')[0],
          defaultSupplier: '',
          defaultCurrency: 'USD',
          exchangeRate: 1,
          exchangeRateManuallySet: false,
        });
        if (savedId) {
          activeSessionIdRef.current = savedId;
          setActiveSessionId(savedId);
        } else {
          activeSessionIdRef.current = null;
          setActiveSessionId(null);
        }

        setStep('mapping');
      } else {
        alert(t('bulkImport.parseError'));
        resetFileInput();
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as HTMLElement).contains(next)) return;
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const executeBulkImport = async () => {
    supplierCacheRef.current.clear();

    try {
      const { getSuppliers } = await import('../services/suppliersService');
      suppliersSnapshotRef.current = await getSuppliers();
    } catch {
      suppliersSnapshotRef.current = suppliers;
    }

    let warningCount = 0;
    let autoLinkedCount = 0;
    const timestamp = Date.now();
    const bulkImportId = crypto.randomUUID();
    const bulkImportLabel = sessionLabel.trim() || t('bulkImport.defaultSessionLabel');
    const ordersToAdd: Omit<PurchaseOrder, 'id' | 'createdAt'>[] = [];

    const invoicesFromCSV: string[] = [];
    parsedData.forEach((row) => {
      const mappedData: Record<string, string | number> = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mappedData[dbField] = row[csvColumn];
      });
      if (mappedData.invoice) {
        invoicesFromCSV.push(String(mappedData.invoice));
      }
    });

    let batchInvoiceNumber = '';
    if (invoicesFromCSV.length > 0) {
      const uniqueInvoices = [...new Set(invoicesFromCSV)];
      if (uniqueInvoices.length > 1) {
        alert(t('bulkImport.invoiceMismatchError').replace('{invoices}', uniqueInvoices.join(', ')));
        setStep('mapping');
        return;
      }
      batchInvoiceNumber = uniqueInvoices[0];
    } else {
      batchInvoiceNumber = invoicePrefix
        ? `${invoicePrefix}-${timestamp}`
        : `IMPORT-${timestamp}`;
    }

    const inventoryBySupplierSku = new Map<string, InventoryItem>();
    for (const item of inventory) {
      const key = (item.supplierSKU || '').trim().toLowerCase();
      if (key) inventoryBySupplierSku.set(key, item);
    }

    const existingCategories = [...new Set(inventory.map((item) => item.category))];
    const existingLines = [...new Set(inventory.map((item) => item.line))];
    const allocatedSkus: string[] = [];
    const batchSkuBySupplier = new Map<string, string>();

    const supplierNamesToResolve = new Set<string>();
    for (const row of parsedData) {
      const mapped: Record<string, string | number> = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mapped[dbField] = row[csvColumn];
      });
      const name = String(mapped.supplier || '').trim();
      if (name) supplierNamesToResolve.add(name);
    }
    await Promise.all(
      [...supplierNamesToResolve].map((name) =>
        findMatchingSupplier(name, defaultCurrency || 'USD')
      )
    );

    for (let index = 0; index < parsedData.length; index++) {
      const row = parsedData[index];
      const mappedData: Record<string, string | number> = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mappedData[dbField] = row[csvColumn];
      });

      const description = String(mappedData.description || 'Imported Item');
      const quantity = cleanNumericValue(String(mappedData.quantity || 1));
      let costPerUnit = cleanNumericValue(String(mappedData.costPerUnit || 0));
      const totalCostRow = cleanNumericValue(String(mappedData.totalCost || 0));
      if (costPerUnit <= 0 && totalCostRow > 0 && quantity > 0) {
        costPerUnit = totalCostRow / quantity;
      }
      const supplierSKU = (mappedData.supplierSKU as string) || '';
      const rawCategory = (mappedData.category as string) || '';
      const rawLine = (mappedData.line as string) || '';
      const rawSupplier = (mappedData.supplier as string) || '';
      const currency = defaultCurrency || 'USD';

      const matchedCategory = findMatchingCategory(rawCategory, existingCategories);
      const matchedLine = findMatchingLine(rawLine, existingLines);

      const supKey = supplierSKU.trim().toLowerCase();
      const matchedInventoryItem = supKey
        ? inventoryBySupplierSku.get(supKey)
        : undefined;

      let autoLinked = false;
      const categoryForSku =
        matchedInventoryItem?.category || matchedCategory || '';
      const lineForSku = matchedInventoryItem?.line || matchedLine || '';

      let internalSku = '';

      if (categoryForSku && lineForSku) {
        internalSku = resolveInternalSku({
          category: categoryForSku,
          line: lineForSku,
          supplierSKU,
          inventory,
          purchaseOrders,
          extraUsedSkus: allocatedSkus,
          batchReservations: batchSkuBySupplier,
        });
        if (matchedInventoryItem) {
          autoLinked = true;
          autoLinkedCount++;
        }
      } else if (supplierSKU.trim()) {
        const linked =
          findInternalSkuBySupplierSku(supplierSKU, inventory, purchaseOrders) ||
          (supKey ? batchSkuBySupplier.get(supKey) : undefined);
        if (linked) {
          internalSku = linked;
          if (supKey) batchSkuBySupplier.set(supKey, linked);
        } else {
          internalSku = `IMP${timestamp.toString().slice(-5)}${String(index).padStart(3, '0')}`;
          if (supKey) batchSkuBySupplier.set(supKey, internalSku);
        }
      } else {
        internalSku = `IMP${timestamp.toString().slice(-5)}${String(index).padStart(3, '0')}`;
      }

      allocatedSkus.push(internalSku);

      const categoryNeedsReview = !autoLinked && !matchedCategory && rawCategory;
      const lineNeedsReview = !autoLinked && !matchedLine && rawLine;

      const matchedSupplier = rawSupplier.trim()
        ? await findMatchingSupplier(rawSupplier, currency)
        : defaultSupplier;
      const supplierIdResolved = (matchedSupplier || defaultSupplier || '').trim();
      const finalCategoryForOrder =
        autoLinked && matchedInventoryItem
          ? matchedInventoryItem.category
          : categoryNeedsReview
            ? '⚠️ NEEDS REVIEW'
            : matchedCategory;

      const orderShowsNeedsReviewInTab =
        (finalCategoryForOrder || '').includes('NEEDS REVIEW') || !supplierIdResolved;

      const costPerUnitInUSD = costPerUnit * exchangeRate;
      const totalCostInUSD = quantity * costPerUnitInUSD;

      ordersToAdd.push({
        invoice: batchInvoiceNumber,
        invoiceLink: invoiceLink || '',
        supplierId: matchedSupplier || defaultSupplier || '',
        supplierSKU: supplierSKU,
        description: autoLinked && matchedInventoryItem ? matchedInventoryItem.name : description,
        sku: internalSku,
        category:
          autoLinked && matchedInventoryItem
            ? matchedInventoryItem.category
            : categoryNeedsReview
              ? '⚠️ NEEDS REVIEW'
              : matchedCategory,
        line:
          autoLinked && matchedInventoryItem
            ? matchedInventoryItem.line
            : lineNeedsReview
              ? '⚠️ NEEDS REVIEW'
              : matchedLine,
        images: autoLinked && matchedInventoryItem ? matchedInventoryItem.images : [],
        quantity: quantity,
        currency: defaultCurrency,
        costPerUnit: costPerUnit,
        totalCost: quantity * costPerUnit,
        discountPerUnit: 0,
        totalDiscount: 0,
        costPerUnitWithDiscount: costPerUnit,
        totalCostWithDiscount: quantity * costPerUnit,
        exchangeRate: exchangeRate,
        costInUSD: totalCostInUSD,
        shippingCost: 0,
        tariffCost: 0,
        otherFees: 0,
        totalLandedCost: totalCostInUSD,
        landedCostPerUnit: costPerUnitInUSD,
        purchaseDate: new Date(purchaseDate),
        status: 'Ordered' as const,
        bulkImportId,
        bulkImportLabel,
      });

      if (orderShowsNeedsReviewInTab) {
        warningCount++;
      }

      if (index > 0 && index % 15 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const newOrders = await addPurchaseOrdersBulk(ordersToAdd);
    await attachBarcodesToPurchaseOrdersBulk(
      newOrders,
      updatePurchaseOrder,
      inventory,
      purchaseOrders
    );

    setImportResults({
      success: ordersToAdd.length,
      warnings: warningCount,
      autoLinked: autoLinkedCount,
    });

    const sessionId = activeSessionIdRef.current;
    if (sessionId) {
      deleteBulkImportSession(sessionId);
      activeSessionIdRef.current = null;
      setActiveSessionId(null);
    }

    setStep('complete');
  };

  const executeBulkImportUpdate = async () => {
    if (!editBulkImportId) return;

    supplierCacheRef.current.clear();

    try {
      const { getSuppliers } = await import('../services/suppliersService');
      suppliersSnapshotRef.current = await getSuppliers();
    } catch {
      suppliersSnapshotRef.current = suppliers;
    }

    let warningCount = 0;
    let autoLinkedCount = 0;
    const timestamp = Date.now();
    const bulkImportId = isLegacyBulkImportGroupId(editBulkImportId)
      ? crypto.randomUUID()
      : editBulkImportId;
    const bulkImportLabel = sessionLabel.trim() || parsedData[0]?.invoice?.toString() || 'Importación masiva';
    const ordersToAdd: Omit<PurchaseOrder, 'id' | 'createdAt'>[] = [];
    const keptOrderIds = new Set<string>();
    const initialOrderIds = orderIdsByRow.filter((id): id is string => Boolean(id));

    const invoicesFromCSV: string[] = [];
    parsedData.forEach((row) => {
      const mappedData: Record<string, string | number> = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mappedData[dbField] = row[csvColumn];
      });
      if (mappedData.invoice) {
        invoicesFromCSV.push(String(mappedData.invoice));
      }
    });

    let batchInvoiceNumber = '';
    if (invoicesFromCSV.length > 0) {
      const uniqueInvoices = [...new Set(invoicesFromCSV)];
      if (uniqueInvoices.length > 1) {
        alert(t('bulkImport.invoiceMismatchError').replace('{invoices}', uniqueInvoices.join(', ')));
        setStep('mapping');
        return;
      }
      batchInvoiceNumber = uniqueInvoices[0];
    } else {
      batchInvoiceNumber = invoicePrefix
        ? `${invoicePrefix}-${timestamp}`
        : `IMPORT-${timestamp}`;
    }

    const inventoryBySupplierSku = new Map<string, InventoryItem>();
    for (const item of inventory) {
      const key = (item.supplierSKU || '').trim().toLowerCase();
      if (key) inventoryBySupplierSku.set(key, item);
    }

    const existingCategories = [...new Set(inventory.map((item) => item.category))];
    const existingLines = [...new Set(inventory.map((item) => item.line))];
    const allocatedSkus: string[] = collectUsedSkus(inventory, purchaseOrders);
    const batchSkuBySupplier = new Map<string, string>();

    const supplierNamesToResolve = new Set<string>();
    for (const row of parsedData) {
      const mapped: Record<string, string | number> = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mapped[dbField] = row[csvColumn];
      });
      const name = String(mapped.supplier || '').trim();
      if (name) supplierNamesToResolve.add(name);
    }
    await Promise.all(
      [...supplierNamesToResolve].map((name) =>
        findMatchingSupplier(name, defaultCurrency || 'USD')
      )
    );

    for (let index = 0; index < parsedData.length; index++) {
      const row = parsedData[index];
      const mappedData: Record<string, string | number> = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mappedData[dbField] = row[csvColumn];
      });

      const description = String(mappedData.description || 'Imported Item');
      const quantity = cleanNumericValue(String(mappedData.quantity || 1));
      let costPerUnit = cleanNumericValue(String(mappedData.costPerUnit || 0));
      const totalCostRow = cleanNumericValue(String(mappedData.totalCost || 0));
      if (costPerUnit <= 0 && totalCostRow > 0 && quantity > 0) {
        costPerUnit = totalCostRow / quantity;
      }
      const supplierSKU = (mappedData.supplierSKU as string) || '';
      const rawCategory = (mappedData.category as string) || '';
      const rawLine = (mappedData.line as string) || '';
      const rawSupplier = (mappedData.supplier as string) || '';
      const currency = defaultCurrency || 'USD';

      const matchedCategory = findMatchingCategory(rawCategory, existingCategories);
      const matchedLine = findMatchingLine(rawLine, existingLines);

      const supKey = supplierSKU.trim().toLowerCase();
      const matchedInventoryItem = supKey
        ? inventoryBySupplierSku.get(supKey)
        : undefined;

      let autoLinked = false;
      const categoryForSku =
        matchedInventoryItem?.category || matchedCategory || '';
      const lineForSku = matchedInventoryItem?.line || matchedLine || '';

      let internalSku = '';
      const existingOrder = orderIdsByRow[index]
        ? purchaseOrders.find((o) => o.id === orderIdsByRow[index])
        : undefined;

      if (existingOrder?.sku) {
        internalSku = existingOrder.sku;
      } else if (categoryForSku && lineForSku) {
        internalSku = resolveInternalSku({
          category: categoryForSku,
          line: lineForSku,
          supplierSKU,
          inventory,
          purchaseOrders,
          extraUsedSkus: allocatedSkus,
          batchReservations: batchSkuBySupplier,
        });
        if (matchedInventoryItem) {
          autoLinked = true;
          autoLinkedCount++;
        }
      } else if (supplierSKU.trim()) {
        const linked =
          findInternalSkuBySupplierSku(supplierSKU, inventory, purchaseOrders) ||
          (supKey ? batchSkuBySupplier.get(supKey) : undefined);
        if (linked) {
          internalSku = linked;
          if (supKey) batchSkuBySupplier.set(supKey, linked);
        } else {
          internalSku = `IMP${timestamp.toString().slice(-5)}${String(index).padStart(3, '0')}`;
          if (supKey) batchSkuBySupplier.set(supKey, internalSku);
        }
      } else {
        internalSku = `IMP${timestamp.toString().slice(-5)}${String(index).padStart(3, '0')}`;
      }

      allocatedSkus.push(internalSku);

      const categoryNeedsReview = !autoLinked && !matchedCategory && rawCategory;
      const lineNeedsReview = !autoLinked && !matchedLine && rawLine;

      const matchedSupplier = rawSupplier.trim()
        ? await findMatchingSupplier(rawSupplier, currency)
        : defaultSupplier;
      const supplierIdResolved = (matchedSupplier || defaultSupplier || '').trim();
      const finalCategoryForOrder =
        autoLinked && matchedInventoryItem
          ? matchedInventoryItem.category
          : categoryNeedsReview
            ? '⚠️ NEEDS REVIEW'
            : matchedCategory;

      const orderShowsNeedsReviewInTab =
        (finalCategoryForOrder || '').includes('NEEDS REVIEW') || !supplierIdResolved;

      const costPerUnitInUSD = costPerUnit * exchangeRate;
      const totalCostInUSD = quantity * costPerUnitInUSD;

      const orderPayload: Omit<PurchaseOrder, 'id' | 'createdAt'> = {
        invoice: batchInvoiceNumber,
        invoiceLink: invoiceLink || '',
        supplierId: matchedSupplier || defaultSupplier || '',
        supplierSKU: supplierSKU,
        description: autoLinked && matchedInventoryItem ? matchedInventoryItem.name : description,
        sku: internalSku,
        category:
          autoLinked && matchedInventoryItem
            ? matchedInventoryItem.category
            : categoryNeedsReview
              ? '⚠️ NEEDS REVIEW'
              : matchedCategory,
        line:
          autoLinked && matchedInventoryItem
            ? matchedInventoryItem.line
            : lineNeedsReview
              ? '⚠️ NEEDS REVIEW'
              : matchedLine,
        images: autoLinked && matchedInventoryItem ? matchedInventoryItem.images : existingOrder?.images ?? [],
        quantity: quantity,
        currency: defaultCurrency,
        costPerUnit: costPerUnit,
        totalCost: quantity * costPerUnit,
        discountPerUnit: existingOrder?.discountPerUnit ?? 0,
        totalDiscount: existingOrder?.totalDiscount ?? 0,
        costPerUnitWithDiscount: costPerUnit,
        totalCostWithDiscount: quantity * costPerUnit,
        exchangeRate: exchangeRate,
        costInUSD: totalCostInUSD,
        shippingCost: existingOrder?.shippingCost ?? 0,
        tariffCost: existingOrder?.tariffCost ?? 0,
        otherFees: existingOrder?.otherFees ?? 0,
        totalLandedCost: totalCostInUSD,
        landedCostPerUnit: costPerUnitInUSD,
        purchaseDate: new Date(purchaseDate),
        status: existingOrder?.status ?? ('Ordered' as const),
        bulkImportId,
        bulkImportLabel,
      };

      if (orderShowsNeedsReviewInTab) {
        warningCount++;
      }

      const existingId = orderIdsByRow[index];
      if (existingId) {
        await updatePurchaseOrder(existingId, orderPayload);
        keptOrderIds.add(existingId);
      } else {
        ordersToAdd.push(orderPayload);
      }

      if (index > 0 && index % 15 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const removedIds = initialOrderIds.filter((id) => !keptOrderIds.has(id));
    if (removedIds.length > 0) {
      await cleanupInventoryAfterOrderDeletion(
        removedIds,
        inventory,
        updateInventoryItem,
        purchaseOrders
      );
      await deletePurchaseOrdersBulk(removedIds);
    }

    if (ordersToAdd.length > 0) {
      const newOrders = await addPurchaseOrdersBulk(ordersToAdd);
      await attachBarcodesToPurchaseOrdersBulk(
        newOrders,
        updatePurchaseOrder,
        inventory,
        purchaseOrders
      );
    }

    setImportResults({
      success: keptOrderIds.size + ordersToAdd.length,
      warnings: warningCount,
      autoLinked: autoLinkedCount,
    });

    setStep('complete');
  };

  useEffect(() => {
    if (step !== 'preview' || importTrigger === 0) return;
    if (importInFlightRef.current) return;
    importInFlightRef.current = true;

    void (async () => {
      try {
        if (isSystemEdit) {
          await executeBulkImportUpdate();
        } else {
          await executeBulkImport();
        }
      } catch (error) {
        console.error('Error during bulk import:', error);
        alert(t('bulkImport.importError'));
        setStep('mapping');
      } finally {
        importInFlightRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importTrigger, step, isSystemEdit]);

  const handleImport = () => {
    setStep('preview');
    setImportTrigger((n) => n + 1);
  };


  const stepSubtitle =
    step === 'mapping'
      ? t('bulkImport.stepMapping')
      : step === 'preview'
        ? t('bulkImport.stepPreview')
        : step === 'complete'
          ? t('bulkImport.stepComplete')
          : null;

  return (
    <POModalShell
      title={isSystemEdit ? t('bulkImport.editTitle') : t('bulkImport.title')}
      titleId="bulk-import-title"
      maxWidthClass={step === 'upload' ? 'max-w-md' : 'max-w-5xl'}
      zIndexClass="z-50"
      onClose={handleRequestClose}
      headerExtra={
        stepSubtitle ? (
          <p className="mt-1 text-sm text-gray-500">{stepSubtitle}</p>
        ) : undefined
      }
    >
      <div className="relative">
        {initialLoading && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-[2px]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#515151] border-t-transparent" aria-hidden />
            <p className="text-sm text-gray-600">{t('bulkImport.loadingDraft')}</p>
          </div>
        )}

        <div className="overflow-y-auto max-h-[calc(90vh-8rem)] p-6">
          {step === 'upload' && (
            <div
              role="button"
              tabIndex={0}
              aria-label={t('bulkImport.uploadAria')}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors ${
                isDragging
                  ? 'border-[#515151] bg-[#515151]/10'
                  : 'border-gray-300 hover:border-[#515151]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="block cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
              >
                <svg
                  className="mx-auto mb-4 h-10 w-10 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <p className="text-base font-medium text-gray-900">
                  {isDragging ? t('bulkImport.uploadDrop') : t('bulkImport.uploadClick')}
                </p>
                <p className="mt-1.5 text-sm text-gray-500">{t('bulkImport.csvOnly')}</p>
              </label>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div className="space-y-6">
              {/* Default Values */}
              <div className="sasa-modal-section space-y-4 p-4">
                <h4 className="text-sm font-semibold text-gray-900">
                  {t('bulkImport.orderInfoTitle').replace('{count}', String(parsedData.length))}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">{t('bulkImport.invoicePrefix')}</label>
                    <input
                      type="text"
                      value={invoicePrefix}
                      onChange={(e) => setInvoicePrefix(e.target.value)}
                      placeholder={t('bulkImport.invoicePrefixPlaceholder')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {Object.values(columnMapping).includes('invoice')
                        ? t('bulkImport.invoiceFromCsv')
                        : t('bulkImport.invoiceAuto').replace(
                            '{hint}',
                            `${invoicePrefix || 'IMPORT-###'}-${Date.now().toString().slice(-6)}`
                          )}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">{t('bulkImport.purchaseDate')}</label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">
                    {t('bulkImport.invoiceLink')}{' '}
                    <span className="text-gray-400 font-normal">({t('bulkImport.optional')})</span>
                  </label>
                  <input
                    type="url"
                    value={invoiceLink}
                    onChange={(e) => setInvoiceLink(e.target.value)}
                    placeholder={t('bulkImport.invoiceLinkPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('bulkImport.invoiceLinkHint')}</p>
                </div>
                <div className="mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">{t('bulkImport.defaultSupplier')}</label>
                    <select
                      value={defaultSupplier}
                      onChange={(e) => setDefaultSupplier(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                    >
                      <option value="">{t('bulkImport.defaultSupplierNone')}</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <h5 className="text-sm font-semibold text-gray-900">{t('bulkImport.currencyExchangeTitle')}</h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">
                        {t('bulkImport.currency')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={defaultCurrency}
                        onChange={(e) => {
                          setDefaultCurrency(e.target.value);
                          setExchangeRateManuallySet(false); // Reset manual flag when currency changes
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                      >
                        <option value="USD">USD - US Dollar</option>
                        <option value="COP">COP - Colombian Peso</option>
                        <option value="BRL">BRL - Brazilian Real</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="CNY">CNY - Chinese Yuan</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('bulkImport.currencyHint').replace('{currency}', defaultCurrency)}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">
                        {t('bulkImport.exchangeRate').replace('{from}', defaultCurrency)}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.000001"
                          value={exchangeRate}
                          onChange={(e) => {
                            setExchangeRate(parseFloat(e.target.value) || 1);
                            setExchangeRateManuallySet(true);
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                          placeholder="1.0"
                        />
                        {!exchangeRateManuallySet && exchangeRates && defaultCurrency !== 'USD' && (
                          <button
                            type="button"
                            onClick={() => {
                              const rate = getExchangeRate(defaultCurrency, 'USD', exchangeRates);
                              setExchangeRate(rate);
                              setExchangeRateManuallySet(true);
                            }}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-50"
                            title={t('bulkImport.exchangeRateMarketTitle')}
                          >
                            {t('bulkImport.exchangeRateMarket')}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {defaultCurrency === 'USD'
                          ? t('bulkImport.noConversion')
                          : t('bulkImport.conversionLine')
                              .replace('{currency}', defaultCurrency)
                              .replace('{rate}', exchangeRate.toFixed(6))}
                      </p>
                    </div>
                  </div>
                  {defaultCurrency !== 'USD' && (
                    <p className="text-xs text-gray-500">{t('bulkImport.fxNote')}</p>
                  )}
                </div>
              </div>

              {!isSystemEdit && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('bulkImport.mapColumnsTitle')}</h4>
                <p className="text-xs text-gray-500 mb-4">{t('bulkImport.mapColumnsHint')}</p>
                <div className="space-y-3">
                  {headers.map((header) => (
                    <div key={header} className="flex items-center gap-4">
                      <div className="sasa-modal-chip flex-1 rounded-lg px-3 py-2 text-sm font-mono">
                        {header}
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      <select
                        value={columnMapping[header] || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'sku') return;
                          setColumnMapping({ ...columnMapping, [header]: v });
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] text-sm"
                      >
                        <option value="">{t('bulkImport.skipColumn')}</option>
                        <option value="invoice">{mapFieldLabel('invoice')}</option>
                        <option value="supplierSKU">{mapFieldLabel('supplierSKU')}</option>
                        <option value="supplier">{mapFieldLabel('supplier')}</option>
                        <option value="description">{mapFieldLabel('description')}</option>
                        <option value="quantity">{mapFieldLabel('quantity')}</option>
                        <option value="costPerUnit">{mapFieldLabel('costPerUnit')}</option>
                        <option value="totalCost">{mapFieldLabel('totalCost')}</option>
                        <option value="category">{mapFieldLabel('category')}</option>
                        <option value="line">{mapFieldLabel('line')}</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {parsedData.length > 0 && (
                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {t('bulkImport.itemsTableTitle').replace('{count}', String(parsedData.length))}
                    </h4>
                    {isSystemEdit && (
                      <button
                        type="button"
                        onClick={addEditRow}
                        className="text-sm font-medium text-[#515151] hover:text-black"
                      >
                        + {t('bulkImport.addRow')}
                      </button>
                    )}
                  </div>
                  <p className="mb-3 text-xs text-gray-500">{t('bulkImport.itemsTableHint')}</p>
                  {mappedTableColumns.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('bulkImport.itemsTableEmpty')}</p>
                  ) : (
                    <div className="sasa-modal-section overflow-hidden">
                      <div className="max-h-80 overflow-auto">
                        <table className="w-full min-w-max text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="sasa-modal-chip sticky left-0 z-[2] min-w-[2.5rem] px-3 py-2 text-left text-xs font-medium text-gray-500">
                                {t('bulkImport.itemsTableRow')}
                              </th>
                              {mappedTableColumns.map((col) => (
                                <th
                                  key={col.dbField}
                                  className="sasa-modal-chip whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500"
                                >
                                  {col.label}
                                </th>
                              ))}
                              {isSystemEdit && (
                                <th className="sasa-modal-chip min-w-[4rem] px-2 py-2 text-xs font-medium text-gray-500" />
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {parsedData.map((row, rowIndex) => (
                              <tr key={rowIndex} className="border-b border-gray-200 last:border-0">
                                <td className="sasa-modal-chip sticky left-0 z-[1] px-3 py-1.5 text-xs text-gray-500">
                                  {rowIndex + 1}
                                </td>
                                {mappedTableColumns.map((col) => (
                                  <td key={col.dbField} className="px-2 py-1">
                                    <input
                                      type={NUMERIC_IMPORT_FIELDS.has(col.dbField) ? 'number' : 'text'}
                                      step={col.dbField === 'quantity' ? '1' : 'any'}
                                      value={String(row[col.csvColumn] ?? '')}
                                      onChange={(e) =>
                                        updateImportCell(rowIndex, col.csvColumn, e.target.value)
                                      }
                                      className={`w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#515151] ${
                                        col.dbField === 'description' ? 'min-w-[220px]' : 'min-w-[7rem]'
                                      }`}
                                    />
                                  </td>
                                ))}
                                {isSystemEdit && (
                                  <td className="px-2 py-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeEditRow(rowIndex)}
                                      className="text-xs text-red-600 hover:text-red-800"
                                      title={t('bulkImport.removeRow')}
                                    >
                                      {t('bulkImport.removeRow')}
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview (Import happens here) */}
          {step === 'preview' && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div
                  className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#515151] border-t-transparent"
                  aria-hidden
                />
                <div className="text-lg font-medium text-gray-900">
                  {isSystemEdit
                    ? t('bulkImport.savingChanges').replace('{count}', String(parsedData.length))
                    : t('bulkImport.importing').replace('{count}', String(parsedData.length))}
                </div>
                <div className="text-sm text-gray-500 mt-1">{t('bulkImport.importingWait')}</div>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="text-center py-8">
              <div
                className="sasa-import-success-icon mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50"
                aria-hidden
              >
                <svg
                  className="sasa-import-success-icon-check h-6 w-6 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">
                {isSystemEdit ? t('bulkImport.saveCompleteTitle') : t('bulkImport.completeTitle')}
              </h4>
              <div className="space-y-2 text-sm">
                <p className="text-gray-700">
                  {isSystemEdit
                    ? t('bulkImport.saveSuccessCount').replace('{count}', String(importResults.success))
                    : t('bulkImport.successCount').replace('{count}', String(importResults.success))}
                </p>
                {(importResults.autoLinked ?? 0) > 0 && (
                  <p className="text-green-600 font-medium">
                    {importResults.autoLinked === 1
                      ? t('bulkImport.autoLinkedOne')
                      : t('bulkImport.autoLinkedMany').replace('{count}', String(importResults.autoLinked))}
                  </p>
                )}
                {importResults.warnings > 0 && (
                  <p className="text-amber-600">
                    {t('bulkImport.warnings').replace('{count}', String(importResults.warnings))}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="mt-6 bg-[#515151] hover:bg-[#000000] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm"
              >
                {t('bulkImport.done')}
              </button>
            </div>
          )}
        </div>

        {step === 'mapping' && (
          <div className="sasa-modal-footer sticky bottom-0 flex gap-3 border-t border-gray-200 px-6 py-4">
            {!isSystemEdit && (
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="flex-1 rounded-xl border border-gray-300 px-6 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-50"
              >
                {t('common.back')}
              </button>
            )}
            <button
              type="button"
              onClick={handleImport}
              className={`${isSystemEdit ? 'w-full' : 'flex-1'} rounded-xl bg-[#515151] px-6 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-[#000000] hover:shadow active:scale-95`}
            >
              {isSystemEdit
                ? t('bulkImport.saveChanges')
                : t('bulkImport.importNItems').replace('{count}', String(parsedData.length))}
            </button>
          </div>
        )}
      </div>
    </POModalShell>
  );
}

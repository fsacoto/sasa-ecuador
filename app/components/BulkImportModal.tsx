'use client';

import { useState, useRef, useEffect } from 'react';
import { parseCSV, detectColumnMapping, cleanNumericValue, ParsedRow } from '../utils/csvParser';
import { useInventory } from '../context/InventoryContext';
import { attachBarcodeToPurchaseOrderIfNeeded } from '../utils/syncUpdates';
import { generateUniqueSKU, collectUsedSkus } from '../utils/skuGenerator';
import { PurchaseOrder, InventoryItem } from '../types';
import { getExchangeRates, getExchangeRate, type ExchangeRateResponse } from '../utils/currencyApi';
import { PREDEFINED_CATEGORIES_ES, PREDEFINED_LINES_ES } from '../constants/merchandise';
import { canonicalCategory, canonicalLine } from '../utils/merchandiseLabels';
import { useTranslation } from '../context/TranslationContext';
import { upsertBulkImportSession, loadBulkImportSession } from '../utils/bulkImportDraftStorage';

export type BulkImportModalMode = 'new' | 'resume';

interface BulkImportModalProps {
  onClose: () => void;
  /** `resume` loads a saved CSV session (mapping, invoice link, etc.) from this browser. */
  mode?: BulkImportModalMode;
  /** Required when `mode` is `resume`: session id from the picker. */
  resumeSessionId?: string | null;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';

export default function BulkImportModal({
  onClose,
  mode = 'new',
  resumeSessionId = null,
}: BulkImportModalProps) {
  const { t } = useTranslation();
  const { addPurchaseOrdersBulk, inventory, purchaseOrders, suppliers, addSupplier, updatePurchaseOrder } =
    useInventory();
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
  const [resumeLoading, setResumeLoading] = useState(() => mode === 'resume');
  const resumeHydrateConsumedRef = useRef(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState('');
  const activeSessionIdRef = useRef<string | null>(null);

  // Cache to track suppliers being created during import to prevent duplicates
  const supplierCacheRef = useRef<Map<string, Promise<string>>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const mapFieldLabel = (dbField: string) => {
    const key = `bulkImport.mapField_${dbField}`;
    const label = t(key);
    return label === key ? dbField : label;
  };

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
    if (mode !== 'resume') {
      setResumeLoading(false);
      return;
    }
    if (resumeHydrateConsumedRef.current) {
      return;
    }
    resumeHydrateConsumedRef.current = true;

    if (!resumeSessionId) {
      alert(t('bulkImport.sessionNotFound'));
      onClose();
      setResumeLoading(false);
      return;
    }

    const draft = loadBulkImportSession(resumeSessionId);
    if (!draft) {
      alert(t('bulkImport.noDraftSaved'));
      onClose();
      setResumeLoading(false);
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
    setResumeLoading(false);
  }, [mode, resumeSessionId, onClose, t]);

  useEffect(() => {
    if (resumeLoading) return;
    if ((step !== 'mapping' && step !== 'complete') || parsedData.length === 0) return;
    const label = sessionLabel.trim() || t('bulkImport.defaultSessionLabel');
    const idArg = activeSessionIdRef.current;
    const nextId = upsertBulkImportSession({
      id: idArg ?? undefined,
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
    if (nextId) {
      activeSessionIdRef.current = nextId;
    }
    if (nextId && nextId !== activeSessionId) {
      setActiveSessionId(nextId);
    }
  }, [
    resumeLoading,
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
  ]);

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
        const { getSuppliers } = await import('../services/suppliersService');
        let allSuppliers = await getSuppliers();
        const exactDb = allSuppliers.find((s) => s.name.trim().toLowerCase() === key);
        if (exactDb) {
          return exactDb.id;
        }

        return await addSupplier({
          name: displayName,
          email: '',
          phone: '',
          country: '',
          currency: currency || 'USD',
          notes: 'Auto-created from bulk import',
        });
      } catch (error) {
        console.error('Error resolving supplier:', error);
        try {
          const { getSuppliers } = await import('../services/suppliersService');
          const allSuppliers = await getSuppliers();
          const match = allSuppliers.find((s) => s.name.trim().toLowerCase() === key);
          if (match) {
            return match.id;
          }
        } catch (retryError) {
          console.error('Error retrying supplier lookup:', retryError);
        }
        return defaultSupplier;
      }
    })();

    supplierCacheRef.current.set(key, supplierPromise);

    return await supplierPromise;
  };

  const findMatchingCategory = (categoryName: string): string => {
    if (!categoryName) return '';
    const canon = canonicalCategory(categoryName.trim());
    const predefined: string[] = [...PREDEFINED_CATEGORIES_ES];
    if (predefined.includes(canon)) return canon;

    const lower = categoryName.toLowerCase();
    const partialMatch = predefined.find(
      (cat) => cat.toLowerCase().includes(lower) || lower.includes(cat.toLowerCase())
    );
    if (partialMatch) return partialMatch;

    const existingCategories = [...new Set(inventory.map((item) => item.category))];
    const existingMatch = existingCategories.find(
      (cat) => cat && cat.toLowerCase() === categoryName.toLowerCase()
    );
    if (existingMatch) return canonicalCategory(existingMatch);

    return categoryName;
  };

  const findMatchingLine = (lineName: string): string => {
    if (!lineName) return '';
    const canon = canonicalLine(lineName.trim());
    const predefinedLines: string[] = [...PREDEFINED_LINES_ES];
    if (predefinedLines.includes(canon)) return canon;

    const lower = lineName.toLowerCase();
    const partialMatch = predefinedLines.find(
      (line) => line.toLowerCase().includes(lower) || lower.includes(line.toLowerCase())
    );
    if (partialMatch) return partialMatch;

    const existingLines = [...new Set(inventory.map((item) => item.line))];
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
        setActiveSessionId(null);
        activeSessionIdRef.current = null;

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

  const handleImport = async () => {
    setStep('preview');
    
    // Clear supplier cache at the start of each import
    supplierCacheRef.current.clear();
    
    let warningCount = 0;
    let autoLinkedCount = 0;
    const timestamp = Date.now();
    
    // Collect all orders to add in bulk
    const ordersToAdd: Omit<PurchaseOrder, 'id' | 'createdAt'>[] = [];

    // First, determine the invoice number for the entire batch
    let batchInvoiceNumber = '';
    const invoicesFromCSV: string[] = [];
    
    // Check if invoice numbers are provided in CSV
    parsedData.forEach((row) => {
      const mappedData: Record<string, string | number> = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mappedData[dbField] = row[csvColumn];
      });
      
      if (mappedData.invoice) {
        invoicesFromCSV.push(String(mappedData.invoice));
      }
    });

    if (invoicesFromCSV.length > 0) {
      // Validate that all invoice numbers are the same
      const uniqueInvoices = [...new Set(invoicesFromCSV)];
      if (uniqueInvoices.length > 1) {
        alert(t('bulkImport.invoiceMismatchError').replace('{invoices}', uniqueInvoices.join(', ')));
        return;
      }
      batchInvoiceNumber = uniqueInvoices[0];
    } else {
      // Generate one invoice number for the entire batch
      batchInvoiceNumber = invoicePrefix 
        ? `${invoicePrefix}-${timestamp}`
        : `IMPORT-${timestamp}`;
    }

    const baseExistingSkus = collectUsedSkus(inventory, purchaseOrders);
    const allocatedSkus: string[] = [];
    /** Same supplier SKU → same internal SKU within this import and vs DB (by supplier SKU). */
    const internalSkuBySupplierSkuKey = new Map<string, string>();

    const findInternalSkuFromExistingPurchaseOrders = (supplierSkuRaw: string): string | undefined => {
      const needle = supplierSkuRaw.trim().toLowerCase();
      if (!needle) return undefined;
      const hits = purchaseOrders.filter(
        (o) =>
          (o.supplierSKU || '').trim().toLowerCase() === needle && String(o.sku || '').trim() !== ''
      );
      if (hits.length === 0) return undefined;
      hits.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return String(hits[0].sku).trim();
    };

    // Process rows and create suppliers as needed
    for (let index = 0; index < parsedData.length; index++) {
      const row = parsedData[index];
      // Extract mapped fields
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
      // Use the selected currency from the form, not from CSV
      const currency = defaultCurrency || 'USD';
      
      // Match values with database (await supplier creation if needed)
      const matchedSupplier = await findMatchingSupplier(rawSupplier, currency);
      const matchedCategory = findMatchingCategory(rawCategory);
      const matchedLine = findMatchingLine(rawLine);

      // SMART LINKING: Try to find existing inventory item by supplier SKU
      let matchedInventoryItem: InventoryItem | undefined;
      if (supplierSKU) {
        matchedInventoryItem = inventory.find(item => 
          item.supplierSKU && item.supplierSKU.toLowerCase() === supplierSKU.toLowerCase()
        );
      }

      const supKey = supplierSKU.trim().toLowerCase();

      // Internal SKU: inventory → reuse by supplier SKU (same batch / existing POs) → generate → placeholder
      let internalSku = '';
      let autoLinked = false;

      if (matchedInventoryItem) {
        internalSku = matchedInventoryItem.sku;
        autoLinked = true;
        autoLinkedCount++;
        if (supKey) internalSkuBySupplierSkuKey.set(supKey, internalSku);
      } else if (supKey && internalSkuBySupplierSkuKey.has(supKey)) {
        internalSku = internalSkuBySupplierSkuKey.get(supKey)!;
      } else {
        const poSku = findInternalSkuFromExistingPurchaseOrders(supplierSKU);
        if (poSku) {
          internalSku = poSku;
          if (supKey) internalSkuBySupplierSkuKey.set(supKey, internalSku);
        } else if (matchedCategory && matchedLine) {
          const existingSkus = [...baseExistingSkus, ...allocatedSkus];
          internalSku = generateUniqueSKU(
            matchedCategory,
            matchedLine,
            supplierSKU.trim() || 'NOSKU',
            existingSkus
          );
          if (supKey) internalSkuBySupplierSkuKey.set(supKey, internalSku);
        } else {
          internalSku = `IMP${timestamp.toString().slice(-5)}${String(index).padStart(3, '0')}`;
          if (supKey) internalSkuBySupplierSkuKey.set(supKey, internalSku);
        }
      }

      allocatedSkus.push(internalSku);

      const categoryNeedsReview = !autoLinked && !matchedCategory && rawCategory;
      const lineNeedsReview = !autoLinked && !matchedLine && rawLine;

      const supplierIdResolved = (matchedSupplier || defaultSupplier || '').trim();
      const finalCategoryForOrder =
        autoLinked && matchedInventoryItem
          ? matchedInventoryItem.category
          : categoryNeedsReview
            ? '⚠️ NEEDS REVIEW'
            : matchedCategory;

      // Same rule as PurchaseOrders table: category ⚠️ or missing supplier
      const orderShowsNeedsReviewInTab =
        (finalCategoryForOrder || '').includes('NEEDS REVIEW') || !supplierIdResolved;

      // Debug logging
      if (rawCategory || rawLine) {
        console.log(`Row ${index + 1}:`, {
          rawCategory,
          matchedCategory,
          rawLine,
          matchedLine,
          columnMapping,
          orderShowsNeedsReviewInTab,
          categoryNeedsReview,
          lineNeedsReview,
          autoLinked,
          supplierSKU,
          generatedSku: internalSku,
          finalCategory: autoLinked && matchedInventoryItem ? matchedInventoryItem.category : (categoryNeedsReview ? '⚠️ NEEDS REVIEW' : matchedCategory),
          finalLine: autoLinked && matchedInventoryItem ? matchedInventoryItem.line : (lineNeedsReview ? '⚠️ NEEDS REVIEW' : matchedLine)
        });
      }

      // Each row is a SEPARATE purchase order
      // Use the batch invoice number for all items
      const invoiceNumber = batchInvoiceNumber;

      // All cost values are in the selected currency
      // Convert to USD using the selected exchange rate
      const costPerUnitInUSD = costPerUnit * exchangeRate;
      const totalCostInUSD = quantity * costPerUnitInUSD;

      // Create individual purchase order
      // Use existing item's info if auto-linked
      const orderData = {
        invoice: invoiceNumber,
        invoiceLink: invoiceLink || '', // Use the invoice link from the form
        supplierId: matchedSupplier || defaultSupplier || '',
        supplierSKU: supplierSKU,
        description: autoLinked && matchedInventoryItem ? matchedInventoryItem.name : description,
        sku: internalSku,
        category: autoLinked && matchedInventoryItem ? matchedInventoryItem.category : (categoryNeedsReview ? '⚠️ NEEDS REVIEW' : matchedCategory),
        line: autoLinked && matchedInventoryItem ? matchedInventoryItem.line : (lineNeedsReview ? '⚠️ NEEDS REVIEW' : matchedLine),
        images: autoLinked && matchedInventoryItem ? matchedInventoryItem.images : [],
        quantity: quantity,
        currency: defaultCurrency, // Store the original currency
        costPerUnit: costPerUnit, // Store cost in original currency
        totalCost: quantity * costPerUnit, // Store total in original currency
        discountPerUnit: 0,
        totalDiscount: 0,
        costPerUnitWithDiscount: costPerUnit,
        totalCostWithDiscount: quantity * costPerUnit,
        exchangeRate: exchangeRate, // Store the exchange rate used
        costInUSD: totalCostInUSD, // Store cost converted to USD
        shippingCost: 0,
        tariffCost: 0,
        otherFees: 0,
        totalLandedCost: totalCostInUSD, // Store landed cost in USD
        landedCostPerUnit: costPerUnitInUSD, // Store landed cost per unit in USD
        purchaseDate: new Date(purchaseDate),
        status: 'Ordered' as const,
      };

      ordersToAdd.push(orderData);

      // DO NOT create inventory items during bulk import
      // Inventory items will ONLY be created when purchase orders are marked as 'Verified'
      // This ensures inventory only contains items from verified orders

      if (orderShowsNeedsReviewInTab) {
        warningCount++;
      }
    }

    // Add all orders in bulk, then attach barcodes (reuse inventory URL or generate)
    try {
      const newOrders = await addPurchaseOrdersBulk(ordersToAdd);
      for (const o of newOrders) {
        if (o.sku) {
          await attachBarcodeToPurchaseOrderIfNeeded(o, updatePurchaseOrder, inventory);
        }
      }
    } catch (error) {
      console.error('Error during bulk import or barcode setup:', error);
      alert(t('bulkImport.importError'));
      return;
    }

    setImportResults({ success: ordersToAdd.length, warnings: warningCount, autoLinked: autoLinkedCount });
    setStep('complete');
  };


  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
        {resumeLoading && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-2 bg-white/90">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#515151] border-t-transparent" aria-hidden />
            <p className="text-sm text-gray-600">{t('bulkImport.loadingDraft')}</p>
          </div>
        )}
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('bulkImport.title')}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {mode === 'resume' && !resumeLoading && (
                <span className="mr-2 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                  {t('bulkImport.resumeBadge')}
                </span>
              )}
              {step === 'upload' && t('bulkImport.stepUpload')}
              {step === 'mapping' && t('bulkImport.stepMapping')}
              {step === 'preview' && t('bulkImport.stepPreview')}
              {step === 'complete' && t('bulkImport.stepComplete')}
            </p>
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
        <div className="overflow-y-auto max-h-[calc(90vh-8rem)] p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
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
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
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
                  className="cursor-pointer block"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => e.preventDefault()}
                >
                  <div className="text-6xl mb-4">📄</div>
                  <div className="text-base font-medium text-gray-900 mb-2">
                    {isDragging ? t('bulkImport.uploadDrop') : t('bulkImport.uploadClick')}
                  </div>
                  <div className="text-sm text-gray-500">{t('bulkImport.csvOnly')}</div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">{t('bulkImport.howToExportTitle')}</h4>
                  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>{t('bulkImport.howToExport1')}</li>
                    <li>{t('bulkImport.howToExport2')}</li>
                    <li>{t('bulkImport.howToExport3')}</li>
                    <li>{t('bulkImport.howToExport4')}</li>
                  </ol>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">{t('bulkImport.whatHappensTitle')}</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• {t('bulkImport.whatHappens1')}</li>
                    <li>• {t('bulkImport.whatHappens2')}</li>
                    <li>• {t('bulkImport.whatHappens3')}</li>
                    <li>• {t('bulkImport.whatHappens4')}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div className="space-y-6">
              {/* Default Values */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
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
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <h5 className="text-sm font-semibold text-blue-900 mb-2">{t('bulkImport.currencyExchangeTitle')}</h5>
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
                            className="px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
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
                    <div className="bg-white border border-blue-200 rounded p-2 text-xs text-blue-800">
                      {t('bulkImport.fxNote')}
                    </div>
                  )}
                </div>
              </div>

              {/* Column Mapping */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('bulkImport.mapColumnsTitle')}</h4>
                <p className="text-xs text-gray-500 mb-4">{t('bulkImport.mapColumnsHint')}</p>
                <div className="space-y-3">
                  {headers.map((header) => (
                    <div key={header} className="flex items-center gap-4">
                      <div className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm font-mono">
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

              {/* Preview first row */}
              {parsedData.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">{t('bulkImport.previewFirstRow')}</h4>
                  <div className="text-xs text-gray-700 space-y-1 font-mono">
                    {Object.entries(columnMapping).map(([csvCol, dbField]) => {
                      if (dbField) {
                        return (
                          <div key={csvCol}>
                            <span className="text-[#515151] font-semibold">{mapFieldLabel(dbField)}:</span>{' '}
                            {parsedData[0][csvCol]}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview (Import happens here) */}
          {step === 'preview' && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-4xl mb-4">⏳</div>
                <div className="text-lg font-medium text-gray-900">
                  {t('bulkImport.importing').replace('{count}', String(parsedData.length))}
                </div>
                <div className="text-sm text-gray-500 mt-1">{t('bulkImport.importingWait')}</div>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">{t('bulkImport.completeTitle')}</h4>
              <div className="space-y-2 text-sm">
                <p className="text-gray-700">
                  {t('bulkImport.successCount').replace('{count}', String(importResults.success))}
                </p>
                {(importResults.autoLinked ?? 0) > 0 && (
                  <p className="text-green-600 font-medium">
                    🔗{' '}
                    {importResults.autoLinked === 1
                      ? t('bulkImport.autoLinkedOne')
                      : t('bulkImport.autoLinkedMany').replace('{count}', String(importResults.autoLinked))}
                  </p>
                )}
                {importResults.warnings > 0 && (
                  <p className="text-amber-600">
                    ⚠️ {t('bulkImport.warnings').replace('{count}', String(importResults.warnings))}
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

        {/* Footer Actions */}
        {(step === 'mapping') && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="flex-1 px-6 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700"
            >
              {t('common.back')}
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="flex-1 bg-[#515151] hover:bg-[#000000] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm hover:shadow active:scale-95"
            >
              {t('bulkImport.importNItems').replace('{count}', String(parsedData.length))}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

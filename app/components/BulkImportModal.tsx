'use client';

import { useState, useRef, useEffect } from 'react';
import { parseCSV, detectColumnMapping, cleanNumericValue, ParsedRow } from '../utils/csvParser';
import { useInventory } from '../context/InventoryContext';
import { generateUniqueSKU, collectUsedSkus } from '../utils/skuGenerator';
import { PurchaseOrder, InventoryItem } from '../types';
import { getExchangeRates, getExchangeRate, type ExchangeRateResponse } from '../utils/currencyApi';

interface BulkImportModalProps {
  onClose: () => void;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';

export default function BulkImportModal({ onClose }: BulkImportModalProps) {
  const { addPurchaseOrdersBulk, inventory, purchaseOrders, suppliers, addSupplier } = useInventory();
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<{ [key: string]: string }>({});
  const [defaultSupplier, setDefaultSupplier] = useState<string>('');
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [exchangeRateManuallySet, setExchangeRateManuallySet] = useState<boolean>(false);
  const [defaultDestination, setDefaultDestination] = useState<'Ecuador' | 'USA'>('Ecuador');
  const [invoicePrefix, setInvoicePrefix] = useState<string>('');
  const [invoiceLink, setInvoiceLink] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [importResults, setImportResults] = useState<{ success: number; warnings: number; autoLinked?: number }>({ success: 0, warnings: 0, autoLinked: 0 });
  
  // Cache to track suppliers being created during import to prevent duplicates
  const supplierCacheRef = useRef<Map<string, Promise<string>>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Exchange rates state
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateResponse | null>(null);

  // Predefined categories and lines for matching
  const predefinedCategories = ['Necklace', 'Ring', 'Bracelet', 'Set', 'Anklet', 'Earring'];
  const predefinedLines = ['Gold Plated', 'Gold Filled', 'Sterling Silver'];

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

  // Helper functions to match values with database
  const findMatchingSupplier = async (supplierName: string, currency: string = 'USD'): Promise<string> => {
    if (!supplierName || supplierName.trim() === '') return defaultSupplier;
    
    const trimmedName = supplierName.trim().toLowerCase();
    
    // Check if we're already creating this supplier (prevent duplicates during bulk import)
    if (supplierCacheRef.current.has(trimmedName)) {
      return await supplierCacheRef.current.get(trimmedName)!;
    }
    
    // Try exact match first in local state
    const exactMatch = suppliers.find(s => s.name.toLowerCase() === trimmedName);
    if (exactMatch) {
      supplierCacheRef.current.set(trimmedName, Promise.resolve(exactMatch.id));
      return exactMatch.id;
    }
    
    // Try partial match in local state
    const partialMatch = suppliers.find(s => 
      s.name.toLowerCase().includes(trimmedName) ||
      trimmedName.includes(s.name.toLowerCase())
    );
    if (partialMatch) {
      supplierCacheRef.current.set(trimmedName, Promise.resolve(partialMatch.id));
      return partialMatch.id;
    }
    
    // Create a promise for supplier creation to prevent duplicates
    const supplierPromise = (async () => {
      try {
        // Check database directly before creating to avoid race conditions
        const { searchSuppliersByName } = await import('../services/suppliersService');
        const foundSuppliers = await searchSuppliersByName(trimmedName);
        const dbMatch = foundSuppliers.find(s => s.name.toLowerCase() === trimmedName);
        
        if (dbMatch) {
          return dbMatch.id;
        }
        
        // Only create if it truly doesn't exist in the database
        await addSupplier({
          name: trimmedName,
          email: '',
          phone: '',
          country: '',
          currency: currency || 'USD',
          notes: 'Auto-created from bulk import',
        });
        
        // After creation, search again to get the ID
        const createdSuppliers = await searchSuppliersByName(trimmedName);
        const createdMatch = createdSuppliers.find(s => s.name.toLowerCase() === trimmedName);
        
        if (createdMatch) {
          return createdMatch.id;
        }
        
        // If creation failed, it might be because it was created by another process
        // Try one more time to find it
        const retrySuppliers = await searchSuppliersByName(trimmedName);
        const retryMatch = retrySuppliers.find(s => s.name.toLowerCase() === trimmedName);
        if (retryMatch) {
          return retryMatch.id;
        }
        
        console.warn(`Failed to find newly created supplier: ${trimmedName}`);
        return defaultSupplier;
      } catch (error) {
        console.error('Error creating supplier:', error);
        // If creation failed, try to find it one more time (might have been created by another process)
        try {
          const { searchSuppliersByName } = await import('../services/suppliersService');
          const foundSuppliers = await searchSuppliersByName(trimmedName);
          const match = foundSuppliers.find(s => s.name.toLowerCase() === trimmedName);
          if (match) {
            return match.id;
          }
        } catch (retryError) {
          console.error('Error retrying supplier search:', retryError);
        }
        return defaultSupplier;
      }
    })();
    
    // Cache the promise so other calls with the same supplier name wait for this one
    supplierCacheRef.current.set(trimmedName, supplierPromise);
    
    return await supplierPromise;
  };

  const findMatchingCategory = (categoryName: string): string => {
    if (!categoryName) return '';
    
    console.log('Matching category:', categoryName, 'against predefined:', predefinedCategories);
    
    // Try exact match with predefined categories
    const exactMatch = predefinedCategories.find(cat => 
      cat.toLowerCase() === categoryName.toLowerCase()
    );
    if (exactMatch) {
      console.log('Exact match found:', exactMatch);
      return exactMatch;
    }
    
    // Try partial match
    const partialMatch = predefinedCategories.find(cat => 
      cat.toLowerCase().includes(categoryName.toLowerCase()) ||
      categoryName.toLowerCase().includes(cat.toLowerCase())
    );
    if (partialMatch) {
      console.log('Partial match found:', partialMatch);
      return partialMatch;
    }
    
    // Try existing categories from inventory
    const existingCategories = [...new Set(inventory.map(item => item.category))];
    const existingMatch = existingCategories.find(cat => 
      cat.toLowerCase() === categoryName.toLowerCase()
    );
    if (existingMatch) {
      console.log('Existing match found:', existingMatch);
      return existingMatch;
    }
    
    console.log('No match found, returning original:', categoryName);
    // Return original if no match found (will be flagged for review)
    return categoryName;
  };

  const findMatchingLine = (lineName: string): string => {
    if (!lineName) return '';
    
    console.log('Matching line:', lineName, 'against predefined:', predefinedLines);
    
    // Try exact match with predefined lines
    const exactMatch = predefinedLines.find(line => 
      line.toLowerCase() === lineName.toLowerCase()
    );
    if (exactMatch) {
      console.log('Exact match found:', exactMatch);
      return exactMatch;
    }
    
    // Try partial match
    const partialMatch = predefinedLines.find(line => 
      line.toLowerCase().includes(lineName.toLowerCase()) ||
      lineName.toLowerCase().includes(line.toLowerCase())
    );
    if (partialMatch) {
      console.log('Partial match found:', partialMatch);
      return partialMatch;
    }
    
    // Try existing lines from inventory
    const existingLines = [...new Set(inventory.map(item => item.line))];
    const existingMatch = existingLines.find(line => 
      line.toLowerCase() === lineName.toLowerCase()
    );
    if (existingMatch) {
      console.log('Existing match found:', existingMatch);
      return existingMatch;
    }
    
    console.log('No match found, returning original:', lineName);
    // Return original if no match found (will be flagged for review)
    return lineName;
  };

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processSelectedFile = (file: File) => {
    if (!file) return;

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      alert('Please export your Excel file as CSV first.\n\nIn Excel: File → Save As → Format: CSV (.csv)');
      resetFileInput();
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;

      if (text.includes('PK!') || text.includes('<?xml')) {
        alert('This appears to be an Excel file. Please export as CSV first.\n\nIn Excel: File → Save As → Format: CSV (.csv)');
        resetFileInput();
        return;
      }

      const rows = parseCSV(text);

      if (rows.length > 0) {
        const fileHeaders = Object.keys(rows[0]);
        setHeaders(fileHeaders);
        setParsedData(rows);

        const detectedMapping = detectColumnMapping(fileHeaders);

        console.log('CSV Headers detected:', fileHeaders);
        console.log('Auto-detected mapping:', detectedMapping);

        setColumnMapping(detectedMapping);

        setStep('mapping');
      } else {
        alert('Could not parse file. Please make sure it\'s a valid CSV file.');
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
        alert(`❌ ERROR: All items in the CSV must have the same invoice number!\n\nFound different invoice numbers: ${uniqueInvoices.join(', ')}\n\nPlease fix your CSV file and try again.`);
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

    // Process rows and create suppliers as needed
    for (let index = 0; index < parsedData.length; index++) {
      const row = parsedData[index];
      // Extract mapped fields
      const mappedData: Record<string, string | number> = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mappedData[dbField] = row[csvColumn];
      });

      const sku = (mappedData.sku as string) || '';
      const description = String(mappedData.description || 'Imported Item');
      const quantity = cleanNumericValue(String(mappedData.quantity || 1));
      const costPerUnit = cleanNumericValue(String(mappedData.costPerUnit || 0));
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

      // Generate proper internal SKU based on category and line
      let internalSku = sku; // Start with CSV SKU as fallback
      let autoLinked = false;
      
      if (matchedInventoryItem) {
        // Use the matched item's internal SKU
        internalSku = matchedInventoryItem.sku;
        autoLinked = true;
        autoLinkedCount++;
      } else if (matchedCategory && matchedLine) {
        const existingSkus = [...baseExistingSkus, ...allocatedSkus];
        internalSku = generateUniqueSKU(
          matchedCategory,
          matchedLine,
          supplierSKU.trim() || 'NOSKU',
          existingSkus
        );
      } else if (!sku) {
        // Generate a placeholder SKU if missing category/line and no CSV SKU
        internalSku = `IMP${timestamp.toString().slice(-5)}${String(index).padStart(3, '0')}`;
      }
      // If we have a CSV SKU but no category/line, keep the CSV SKU

      allocatedSkus.push(internalSku);

      // Determine if this order needs review
      // Only flag for review if critical fields are missing, not category/line
      const needsReview = !autoLinked && (!defaultSupplier || !sku || !description || costPerUnit === 0);
      
      // Determine if category/line need review (separate from order review)
      const categoryNeedsReview = !autoLinked && !matchedCategory && rawCategory;
      const lineNeedsReview = !autoLinked && !matchedLine && rawLine;
      
      // Debug logging
      if (rawCategory || rawLine) {
        console.log(`Row ${index + 1}:`, {
          rawCategory,
          matchedCategory,
          rawLine,
          matchedLine,
          columnMapping,
          needsReview,
          categoryNeedsReview,
          lineNeedsReview,
          autoLinked,
          originalSku: sku,
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
        destinationStock: defaultDestination,
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

      if (needsReview) {
        warningCount++;
      }
    }

    // Add all orders in bulk
    // Inventory items will be created automatically when orders are marked as 'Verified'
    addPurchaseOrdersBulk(ordersToAdd);

    setImportResults({ success: ordersToAdd.length, warnings: warningCount, autoLinked: autoLinkedCount });
    setStep('complete');
  };


  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Bulk Import Purchase Orders</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === 'upload' && 'Upload your CSV or Excel file'}
              {step === 'mapping' && 'Map columns to database fields'}
              {step === 'preview' && 'Review and confirm import'}
              {step === 'complete' && 'Import complete'}
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
                aria-label="Upload or drop CSV file"
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
                    {isDragging ? 'Drop CSV file here' : 'Click or drag CSV file here'}
                  </div>
                  <div className="text-sm text-gray-500">
                    CSV format only (.csv)
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">How to Export from Excel</h4>
                  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Open your Excel file</li>
                    <li>Click <strong>File → Save As</strong></li>
                    <li>Choose <strong>CSV UTF-8</strong> format</li>
                    <li>Upload the .csv file here</li>
                  </ol>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">What Happens</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Each row = separate purchase order</li>
                    <li>• Products auto-added to inventory</li>
                    <li>• Missing info flagged for review</li>
                    <li>• You can update details later</li>
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
                <h4 className="text-sm font-semibold text-gray-900">Order Information (Applied to All {parsedData.length} Orders)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Invoice Prefix</label>
                    <input
                      type="text"
                      value={invoicePrefix}
                      onChange={(e) => setInvoicePrefix(e.target.value)}
                      placeholder="e.g., INV-2025-OCT"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {Object.values(columnMapping).includes('invoice') 
                        ? 'Using invoice number from CSV (must be same for all rows)' 
                        : `Auto-generated: ${invoicePrefix || 'IMPORT-###'}-${Date.now().toString().slice(-6)}`}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Purchase Date</label>
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
                    Invoice Link <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={invoiceLink}
                    onChange={(e) => setInvoiceLink(e.target.value)}
                    placeholder="https://example.com/invoice.pdf or Google Drive link"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Link to the invoice document (PDF, Google Drive, etc.). This will be applied to all imported purchase orders and linked to inventory items when verified.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Supplier (optional)</label>
                    <select
                      value={defaultSupplier}
                      onChange={(e) => setDefaultSupplier(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                    >
                      <option value="">None (add later)</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Destination</label>
                    <select
                      value={defaultDestination}
                      onChange={(e) => setDefaultDestination(e.target.value as 'Ecuador' | 'USA')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151]"
                    >
                      <option value="Ecuador">Ecuador</option>
                      <option value="USA">USA</option>
                    </select>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <h5 className="text-sm font-semibold text-blue-900 mb-2">Currency & Exchange Rate</h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">
                        Currency <span className="text-red-500">*</span>
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
                        All cost values in CSV will be treated as {defaultCurrency}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">
                        Exchange Rate ({defaultCurrency} → USD) <span className="text-red-500">*</span>
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
                            title="Use current market rate"
                          >
                            Use Market Rate
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {defaultCurrency === 'USD' 
                          ? 'No conversion needed (already USD)'
                          : `1 ${defaultCurrency} = ${exchangeRate.toFixed(6)} USD`}
                      </p>
                    </div>
                  </div>
                  {defaultCurrency !== 'USD' && (
                    <div className="bg-white border border-blue-200 rounded p-2 text-xs text-blue-800">
                      <strong>Note:</strong> All costs will be converted to USD using this exchange rate. 
                      Purchase orders will display USD values in the Purchase Orders tab.
                    </div>
                  )}
                </div>
              </div>

              {/* Column Mapping */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Map Your Columns</h4>
                <p className="text-xs text-gray-500 mb-4">Match your CSV columns to our database fields</p>
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
                        onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] text-sm"
                      >
                        <option value="">Skip this column</option>
                        <option value="invoice">Invoice Number</option>
                        <option value="sku">SKU (Internal)</option>
                        <option value="supplierSKU">Supplier SKU</option>
                        <option value="supplier">Supplier Name</option>
                        <option value="description">Description/Name</option>
                        <option value="quantity">Quantity</option>
                        <option value="costPerUnit">Cost Per Unit</option>
                        <option value="totalCost">Total Cost (ignored if Cost Per Unit mapped)</option>
                        <option value="category">Category</option>
                        <option value="line">Line</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview first row */}
              {parsedData.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Preview First Row</h4>
                  <div className="text-xs text-gray-700 space-y-1 font-mono">
                    {Object.entries(columnMapping).map(([csvCol, dbField]) => {
                      if (dbField) {
                        return (
                          <div key={csvCol}>
                            <span className="text-[#515151] font-semibold">{dbField}:</span> {parsedData[0][csvCol]}
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
                <div className="text-lg font-medium text-gray-900">Importing {parsedData.length} items...</div>
                <div className="text-sm text-gray-500 mt-1">This may take a moment</div>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">Import Complete!</h4>
              <div className="space-y-2 text-sm">
                <p className="text-gray-700">
                  Successfully imported <span className="font-semibold text-[#515151]">{importResults.success}</span> purchase orders
                </p>
                {importResults.autoLinked && importResults.autoLinked > 0 && (
                  <p className="text-green-600 font-medium">
                    🔗 {importResults.autoLinked} {importResults.autoLinked === 1 ? 'item was' : 'items were'} automatically linked to existing products by Supplier SKU!
                  </p>
                )}
                {importResults.warnings > 0 && (
                  <p className="text-amber-600">
                    ⚠️ {importResults.warnings} items need review (marked with &quot;⚠️ NEEDS REVIEW&quot;)
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="mt-6 bg-[#515151] hover:bg-[#000000] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm"
              >
                Done
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
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="flex-1 bg-[#515151] hover:bg-[#000000] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm hover:shadow active:scale-95"
            >
              Import {parsedData.length} Items
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

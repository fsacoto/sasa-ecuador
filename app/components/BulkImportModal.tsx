'use client';

import { useState } from 'react';
import { parseCSV, detectColumnMapping, cleanNumericValue, ParsedRow } from '../utils/csvParser';
import { useInventory } from '../context/InventoryContext';
import { generateUniqueSKU } from '../utils/skuGenerator';

interface BulkImportModalProps {
  onClose: () => void;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';

export default function BulkImportModal({ onClose }: BulkImportModalProps) {
  const { addPurchaseOrder, inventory, addInventoryItem, suppliers } = useInventory();
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<{ [key: string]: string }>({});
  const [defaultSupplier, setDefaultSupplier] = useState<string>('');
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  const [defaultDestination, setDefaultDestination] = useState<'Ecuador' | 'USA'>('Ecuador');
  const [importResults, setImportResults] = useState<{ success: number; warnings: number }>({ success: 0, warnings: 0 });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an Excel file
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      alert('Please export your Excel file as CSV first.\n\nIn Excel: File → Save As → Format: CSV (.csv)');
      e.target.value = ''; // Reset input
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      
      // Check if it looks like binary data
      if (text.includes('PK!') || text.includes('<?xml')) {
        alert('This appears to be an Excel file. Please export as CSV first.\n\nIn Excel: File → Save As → Format: CSV (.csv)');
        e.target.value = '';
        return;
      }
      
      const rows = parseCSV(text);
      
      if (rows.length > 0) {
        const fileHeaders = Object.keys(rows[0]);
        setHeaders(fileHeaders);
        setParsedData(rows);
        
        // Auto-detect column mapping
        const detectedMapping = detectColumnMapping(fileHeaders);
        setColumnMapping(detectedMapping);
        
        setStep('mapping');
      } else {
        alert('Could not parse file. Please make sure it\'s a valid CSV file.');
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    setStep('preview');
    
    let successCount = 0;
    let warningCount = 0;
    const existingSkus = inventory.map(item => item.sku);

    parsedData.forEach((row) => {
      // Extract mapped fields
      const mappedData: any = {};
      Object.entries(columnMapping).forEach(([csvColumn, dbField]) => {
        mappedData[dbField] = row[csvColumn];
      });

      const sku = mappedData.sku || '';
      const description = mappedData.description || 'Imported Item';
      const quantity = cleanNumericValue(mappedData.quantity || 1);
      const costPerUnit = cleanNumericValue(mappedData.costPerUnit || 0);
      const supplierSKU = mappedData.supplierSKU || '';

      // Generate internal SKU if not provided or create new one
      let internalSku = sku;
      const hasWarning = !sku || !description || costPerUnit === 0;

      if (!sku) {
        // Generate a placeholder SKU
        internalSku = `IMP${Date.now().toString().slice(-8)}`;
        warningCount++;
      }

      // Create purchase order
      const orderData = {
        invoice: `BULK-${Date.now()}-${successCount}`,
        invoiceLink: '',
        supplierId: defaultSupplier,
        supplierSKU: supplierSKU,
        description: description,
        sku: internalSku,
        category: '',
        line: '',
        image: '',
        quantity: quantity,
        destinationStock: defaultDestination,
        currency: defaultCurrency,
        costPerUnit: costPerUnit,
        totalCost: quantity * costPerUnit,
        discountPerUnit: 0,
        totalDiscount: 0,
        costPerUnitWithDiscount: costPerUnit,
        totalCostWithDiscount: quantity * costPerUnit,
        exchangeRate: 1,
        costInUSD: quantity * costPerUnit,
        shippingCost: 0,
        tariffCost: 0,
        otherFees: 0,
        totalLandedCost: quantity * costPerUnit,
        landedCostPerUnit: costPerUnit,
        purchaseDate: new Date(),
      };

      addPurchaseOrder(orderData);

      // Check if inventory item exists
      const existingItem = inventory.find(item => item.sku === internalSku);
      
      if (!existingItem && internalSku && internalSku !== '') {
        // Create new inventory item with warning flag
        addInventoryItem({
          name: description,
          sku: internalSku,
          supplierSKU: supplierSKU,
          category: hasWarning ? '⚠️ NEEDS REVIEW' : '',
          line: '',
          description: description,
          image: '',
          ecuadorStock: defaultDestination === 'Ecuador' ? quantity : 0,
          usaStock: defaultDestination === 'USA' ? quantity : 0,
          linkedPurchaseOrders: [],
        });

        if (hasWarning) {
          warningCount++;
        }
      }

      successCount++;
    });

    setImportResults({ success: successCount, warnings: warningCount });
    setStep('complete');
  };

  const requiredFields = ['sku', 'description', 'quantity', 'costPerUnit'];

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
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-[#4f0c1b] transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer"
                >
                  <div className="text-6xl mb-4">📄</div>
                  <div className="text-base font-medium text-gray-900 mb-2">
                    Click to upload CSV file
                  </div>
                  <div className="text-sm text-gray-500">
                    CSV format only (.csv)
                  </div>
                </label>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">How to Export from Excel</h4>
                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                  <li>Open your Excel file</li>
                  <li>Click <strong>File → Save As</strong></li>
                  <li>Choose <strong>CSV UTF-8 (Comma delimited)</strong> format</li>
                  <li>Save and upload the .csv file here</li>
                </ol>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Tips for Best Results</h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Include columns for: SKU, Description, Quantity, Price</li>
                  <li>• First row should contain column headers</li>
                  <li>• Remove any summary rows or totals at the bottom</li>
                  <li>• You'll map columns to our fields in the next step</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div className="space-y-6">
              {/* Default Values */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Default Values (Applied to All Items)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Supplier *</label>
                    <select
                      value={defaultSupplier}
                      onChange={(e) => setDefaultSupplier(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                      required
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Currency</label>
                    <select
                      value={defaultCurrency}
                      onChange={(e) => setDefaultCurrency(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                    >
                      <option value="USD">USD</option>
                      <option value="COP">COP</option>
                      <option value="BRL">BRL</option>
                      <option value="EUR">EUR</option>
                      <option value="CNY">CNY</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Destination</label>
                    <select
                      value={defaultDestination}
                      onChange={(e) => setDefaultDestination(e.target.value as 'Ecuador' | 'USA')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                    >
                      <option value="Ecuador">Ecuador</option>
                      <option value="USA">USA</option>
                    </select>
                  </div>
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] text-sm"
                      >
                        <option value="">Skip this column</option>
                        <option value="sku">SKU (Internal)</option>
                        <option value="supplierSKU">Supplier SKU</option>
                        <option value="description">Description/Name</option>
                        <option value="quantity">Quantity</option>
                        <option value="costPerUnit">Cost Per Unit</option>
                        <option value="totalCost">Total Cost</option>
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
                            <span className="text-[#4f0c1b] font-semibold">{dbField}:</span> {parsedData[0][csvCol]}
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
                  Successfully imported <span className="font-semibold text-[#4f0c1b]">{importResults.success}</span> purchase orders
                </p>
                {importResults.warnings > 0 && (
                  <p className="text-amber-600">
                    ⚠️ {importResults.warnings} items need review (marked with "⚠️ NEEDS REVIEW")
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="mt-6 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm"
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
              disabled={!defaultSupplier}
              className="flex-1 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import {parsedData.length} Items
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import { AdditionalCost, AdditionalCostType } from '../types';
import { useTranslation } from '../context/TranslationContext';
import ConfirmDialog from './ui/ConfirmDialog';
import AlertDialog from './ui/AlertDialog';
import { formatDateMedium, formatMonthYearLong, toValidDate } from '../utils/formatDate';

const FIXED_COST_TYPES: AdditionalCostType[] = [
  'Shipping',
  'Insurance',
  'Duties',
  'Import Fees',
  'Other',
];

const COST_TYPE_KEYS: Record<AdditionalCostType, string> = {
  Shipping: 'shipping',
  Insurance: 'insurance',
  Duties: 'duties',
  'Import Fees': 'importFees',
  Other: 'other',
};

interface InvoiceSummary {
  invoiceNumber: string;
  itemCount: number;
  totalValue: number;
  purchaseDate: Date;
  additionalCostsCount: number;
  additionalCostsTotal: number;
}

interface LandedCostsProps {
  darkMode?: boolean;
}

function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthKeyToDate(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

const emptyFormCosts = () =>
  FIXED_COST_TYPES.map((type) => ({
    type,
    amount: 0,
    description: '',
  }));

export default function LandedCosts({ darkMode = false }: LandedCostsProps) {
  const {
    purchaseOrders,
    addAdditionalCost,
    updateAdditionalCost,
    deleteAdditionalCost,
    getAdditionalCostsByInvoice,
    calculateLandedCosts,
  } = useInventory();
  const { t } = useTranslation();

  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState<'all' | string>('all');
  const [withCostsOnly, setWithCostsOnly] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [costToDelete, setCostToDelete] = useState<string | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title?: string; message: string }>({
    open: false,
    message: '',
  });
  const [editDescriptionModal, setEditDescriptionModal] = useState<{
    open: boolean;
    cost: AdditionalCost | null;
    newDescription: string;
  }>({ open: false, cost: null, newDescription: '' });

  const [formData, setFormData] = useState({
    invoiceNumber: '',
    costs: emptyFormCosts(),
    date: new Date().toISOString().split('T')[0],
    comments: '',
  });

  const formRef = useRef<HTMLDivElement>(null);

  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

  const translateCostType = (type: AdditionalCostType) => {
    const key = COST_TYPE_KEYS[type];
    return key ? t(`landedCosts.${key}`) : type;
  };

  const invoiceSummaries = useMemo((): InvoiceSummary[] => {
    const numbers = Array.from(new Set(purchaseOrders.map((o) => o.invoice)));
    return numbers.map((invoiceNumber) => {
      const orders = purchaseOrders.filter((o) => o.invoice === invoiceNumber);
      const costs = getAdditionalCostsByInvoice(invoiceNumber);
      const purchaseDate = orders.reduce((latest, o) => {
        const d = toValidDate(o.purchaseDate) ?? new Date(0);
        return d > latest ? d : latest;
      }, new Date(0));
      return {
        invoiceNumber,
        itemCount: orders.length,
        totalValue: orders.reduce((sum, o) => sum + o.costInUSD, 0),
        purchaseDate,
        additionalCostsCount: costs.length,
        additionalCostsTotal: costs.reduce((sum, c) => sum + c.amount, 0),
      };
    });
  }, [purchaseOrders, getAdditionalCostsByInvoice]);

  const availableMonths = useMemo(() => {
    const keys = new Set(invoiceSummaries.map((inv) => toMonthKey(inv.purchaseDate)));
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [invoiceSummaries]);

  const filteredInvoices = useMemo(() => {
    let list = [...invoiceSummaries];

    if (invoiceSearch.trim()) {
      const q = invoiceSearch.trim().toLowerCase();
      list = list.filter((inv) => inv.invoiceNumber.toLowerCase().includes(q));
    }

    if (monthFilter !== 'all') {
      list = list.filter((inv) => toMonthKey(inv.purchaseDate) === monthFilter);
    }

    if (withCostsOnly) {
      list = list.filter((inv) => inv.additionalCostsCount > 0);
    }

    list.sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime());
    return list;
  }, [invoiceSummaries, invoiceSearch, monthFilter, withCostsOnly]);

  const hasActiveFilters =
    invoiceSearch.trim() !== '' || monthFilter !== 'all' || withCostsOnly;

  const selectedSummary = invoiceSummaries.find((inv) => inv.invoiceNumber === selectedInvoice);
  const invoiceAdditionalCosts = selectedInvoice ? getAdditionalCostsByInvoice(selectedInvoice) : [];
  const landedCostCalculation = selectedInvoice ? calculateLandedCosts(selectedInvoice) : null;

  useEffect(() => {
    if (selectedInvoice && !filteredInvoices.some((inv) => inv.invoiceNumber === selectedInvoice)) {
      setSelectedInvoice('');
    }
  }, [filteredInvoices, selectedInvoice]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        resetForm();
      }
    };
    if (isFormOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFormOpen]);

  const resetForm = () => {
    setFormData({
      invoiceNumber: selectedInvoice || '',
      costs: emptyFormCosts(),
      date: new Date().toISOString().split('T')[0],
      comments: '',
    });
    setIsFormOpen(false);
  };

  const openAddCosts = (invoice?: string) => {
    setFormData((prev) => ({
      ...prev,
      invoiceNumber: invoice ?? selectedInvoice ?? prev.invoiceNumber,
    }));
    setIsFormOpen(true);
  };

  const clearFilters = () => {
    setInvoiceSearch('');
    setMonthFilter('all');
    setWithCostsOnly(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validCosts = formData.costs.filter((c) => c.amount > 0);
    if (validCosts.length === 0) {
      showAlert(t('landedCosts.pleaseEnterCost'));
      return;
    }
    validCosts.forEach((cost) => {
      addAdditionalCost({
        invoiceNumber: formData.invoiceNumber,
        type: cost.type,
        amount: cost.amount,
        description: cost.description || `${cost.type} - ${formData.comments}`.trim(),
        date: new Date(formData.date),
      });
    });
    resetForm();
  };

  const updateCostField = (index: number, field: 'amount' | 'description', value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      costs: prev.costs.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }));
  };

  const handleSaveDescription = () => {
    if (editDescriptionModal.cost) {
      updateAdditionalCost(editDescriptionModal.cost.id, {
        description: editDescriptionModal.newDescription,
      });
      setEditDescriptionModal({ open: false, cost: null, newDescription: '' });
    }
  };

  const confirmDelete = () => {
    if (costToDelete) {
      deleteAdditionalCost(costToDelete);
      setCostToDelete(null);
    }
    setDeleteConfirmOpen(false);
  };

  const card = darkMode ? 'border-gray-700 bg-[#101010]' : 'border-gray-200 bg-white';
  const cardMuted = darkMode ? 'border-gray-700 bg-[#161616]' : 'border-gray-200 bg-gray-50';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputCls = darkMode
    ? 'border-gray-600 bg-[#1a1a1a] text-white placeholder:text-gray-500'
    : 'border-gray-300 bg-white text-gray-900';
  const selectedInvoiceCls = darkMode
    ? 'border-[#515151] bg-[#515151]/15 ring-1 ring-[#515151]/40'
    : 'border-[#515151] bg-[#515151]/10 ring-1 ring-[#515151]/25';
  const metricHighlight = darkMode
    ? 'border-[#515151] bg-[#515151]/20 ring-1 ring-[#515151]/50'
    : 'border-[#515151] bg-[#515151]/10 ring-1 ring-[#515151]/30';
  const tableHead = darkMode ? 'border-gray-700 bg-[#161616]' : 'border-gray-200 bg-gray-50';
  const tableDivide = darkMode ? 'divide-gray-700' : 'divide-gray-100';
  const brandText = darkMode ? 'text-white' : 'text-[#515151]';

  const formatCostBadge = (count: number) =>
    count === 1
      ? `1 ${t('landedCosts.costs')}`
      : `${count} ${t('landedCosts.costsPlural')}`;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-2xl font-semibold ${textPrimary}`}>{t('landedCosts.title')}</h2>
          <p className={`mt-1 text-sm ${textSecondary}`}>{t('landedCosts.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => openAddCosts()}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-[#515151] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#000000] active:scale-95"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {t('landedCosts.addAdditionalCosts')}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,340px)_1fr]">
        {/* Panel izquierdo: selector de facturas */}
        <aside className={`flex max-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border ${card}`}>
          <div className={`shrink-0 space-y-3 border-b p-4 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <h3 className={`text-sm font-semibold ${textPrimary}`}>{t('landedCosts.selectInvoice')}</h3>

            <div className="relative">
              <svg
                className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${textSecondary}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder={t('landedCosts.searchInvoices')}
                className={`w-full rounded-lg border py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#515151] ${inputCls}`}
              />
            </div>

            <div>
              <label className={`mb-1 block text-[11px] font-medium uppercase tracking-wide ${textSecondary}`}>
                {t('landedCosts.filterByMonth')}
              </label>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#515151] ${inputCls}`}
              >
                <option value="all">{t('landedCosts.allMonths')}</option>
                {availableMonths.map((key) => (
                  <option key={key} value={key}>
                    {formatMonthYearLong(monthKeyToDate(key))}
                  </option>
                ))}
              </select>
            </div>

            <label className={`flex cursor-pointer items-center gap-2 text-sm ${textPrimary}`}>
              <input
                type="checkbox"
                checked={withCostsOnly}
                onChange={(e) => setWithCostsOnly(e.target.checked)}
                className="rounded border-gray-400 text-[#515151] focus:ring-[#515151]"
              />
              {t('landedCosts.withCostsOnly')}
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className={`text-sm font-medium ${darkMode ? 'text-gray-300 hover:text-white' : 'text-[#515151] hover:text-black'}`}
              >
                {t('landedCosts.clearFilters')}
              </button>
            )}
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto divide-y ${tableDivide}`}>
            {filteredInvoices.length === 0 ? (
              <p className={`p-6 text-center text-sm ${textSecondary}`}>
                {t('landedCosts.noInvoicesMatch')}
              </p>
            ) : (
              filteredInvoices.map((inv) => {
                const isSelected = selectedInvoice === inv.invoiceNumber;
                return (
                  <button
                    key={inv.invoiceNumber}
                    type="button"
                    onClick={() => setSelectedInvoice(inv.invoiceNumber)}
                    className={`w-full border-l-4 px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? `border-l-[#515151] ${selectedInvoiceCls}`
                        : `border-l-transparent ${darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`font-semibold ${textPrimary}`}>{inv.invoiceNumber}</span>
                      {inv.additionalCostsCount > 0 && (
                        <span className="shrink-0 rounded bg-[#515151] px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                          {formatCostBadge(inv.additionalCostsCount)}
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-xs ${textSecondary}`}>
                      {formatDateMedium(inv.purchaseDate)}
                    </p>
                    <p className={`mt-1 text-xs tabular-nums ${textSecondary}`}>
                      {inv.itemCount} {t('landedCosts.items')} · ${inv.totalValue.toFixed(2)}
                      {inv.additionalCostsTotal > 0 && (
                        <span> · +${inv.additionalCostsTotal.toFixed(2)}</span>
                      )}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Panel derecho: espacio de trabajo */}
        <div className="min-h-[480px]">
          {!selectedInvoice || !selectedSummary || !landedCostCalculation ? (
            <div
              className={`flex h-full min-h-[480px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center ${
                darkMode ? 'border-gray-600 bg-[#101010]/50' : 'border-gray-300 bg-gray-50/50'
              }`}
            >
              <div
                className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                  darkMode ? 'bg-[#1a1a1a]' : 'bg-gray-100'
                }`}
              >
                <svg className={`h-7 w-7 ${textSecondary}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <p className={`font-medium ${textPrimary}`}>{t('landedCosts.selectInvoice')}</p>
              <p className={`mt-1 max-w-sm text-sm ${textSecondary}`}>
                {t('landedCosts.noInvoiceSelectedHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Resumen */}
              <div className={`rounded-xl border p-5 ${card}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className={`text-xl font-semibold ${textPrimary}`}>{selectedInvoice}</h3>
                    <p className={`mt-1 text-sm ${textSecondary}`}>
                      {selectedSummary.itemCount} {t('landedCosts.items')} ·{' '}
                      {formatDateMedium(selectedSummary.purchaseDate)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAddCosts(selectedInvoice)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      darkMode
                        ? 'border-gray-600 text-gray-200 hover:bg-white/10'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    + {t('landedCosts.addCostsForInvoice')}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className={`rounded-lg border px-4 py-3 ${cardMuted}`}>
                    <p className={`text-[10px] font-medium uppercase tracking-wide ${textSecondary}`}>
                      {t('landedCosts.baseItemTotal')}
                    </p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${textPrimary}`}>
                      ${landedCostCalculation.baseItemTotal.toFixed(2)}
                    </p>
                  </div>
                  <div className={`rounded-lg border px-4 py-3 ${cardMuted}`}>
                    <p className={`text-[10px] font-medium uppercase tracking-wide ${textSecondary}`}>
                      {t('landedCosts.totalAdditionalCosts')}
                    </p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${textPrimary}`}>
                      ${landedCostCalculation.totalAdditionalCosts.toFixed(2)}
                    </p>
                  </div>
                  <div className={`rounded-lg border px-4 py-3 ${metricHighlight}`}>
                    <p className={`text-[10px] font-medium uppercase tracking-wide ${textSecondary}`}>
                      {t('landedCosts.totalLandedCost')}
                    </p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${brandText}`}>
                      ${landedCostCalculation.totalLandedCost.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Dos columnas: costos adicionales + desglose */}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
                {/* Costos adicionales */}
                <div className={`flex max-h-[520px] flex-col overflow-hidden rounded-xl border ${card}`}>
                  <div className={`shrink-0 border-b px-4 py-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <h4 className={`text-sm font-semibold ${textPrimary}`}>
                      {t('landedCosts.additionalCosts')}
                      <span className={`ml-1 font-normal ${textSecondary}`}>
                        ({invoiceAdditionalCosts.length})
                      </span>
                    </h4>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    {invoiceAdditionalCosts.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className={`text-sm ${textSecondary}`}>{t('landedCosts.noAdditionalCostsMessage')}</p>
                        <button
                          type="button"
                          onClick={() => openAddCosts(selectedInvoice)}
                          className={`mt-3 text-sm font-medium ${brandText} hover:underline`}
                        >
                          {t('landedCosts.addAdditionalCosts')} →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {invoiceAdditionalCosts.map((cost) => (
                          <div
                            key={cost.id}
                            className={`rounded-lg border p-3 ${cardMuted}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="rounded bg-[#515151] px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                                {translateCostType(cost.type)}
                              </span>
                              <span className={`text-sm font-semibold tabular-nums ${textPrimary}`}>
                                ${cost.amount.toFixed(2)}
                              </span>
                            </div>
                            <p
                              className={`mt-2 line-clamp-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                              title={cost.description}
                            >
                              {cost.description}
                            </p>
                            <p className={`mt-1 text-xs ${textSecondary}`}>
                              {formatDateMedium(new Date(cost.date))}
                            </p>
                            <div className="mt-2 flex gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditDescriptionModal({
                                    open: true,
                                    cost,
                                    newDescription: cost.description,
                                  })
                                }
                                className={`rounded px-2 py-1 text-xs font-medium ${textSecondary} hover:underline`}
                              >
                                {t('common.edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCostToDelete(cost.id);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Desglose por artículo */}
                <div className={`overflow-hidden rounded-xl border ${card}`}>
                  <div className={`border-b px-4 py-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <h4 className={`text-sm font-semibold ${textPrimary}`}>
                      {t('landedCosts.itemBreakdown')}
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className={`border-b ${tableHead}`}>
                        <tr>
                          <th className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase ${textSecondary}`}>
                            {t('landedCosts.product')}
                          </th>
                          <th className={`px-4 py-2.5 text-right text-[11px] font-semibold uppercase ${textSecondary}`}>
                            {t('landedCosts.quantity')}
                          </th>
                          <th className={`px-4 py-2.5 text-right text-[11px] font-semibold uppercase ${textSecondary}`}>
                            {t('landedCosts.baseCosts')}
                          </th>
                          <th className={`px-4 py-2.5 text-right text-[11px] font-semibold uppercase ${textSecondary}`}>
                            {t('landedCosts.allocation')}
                          </th>
                          <th className={`px-4 py-2.5 text-right text-[11px] font-semibold uppercase ${textSecondary}`}>
                            {t('landedCosts.landedCostsColumn')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${tableDivide}`}>
                        {landedCostCalculation.items.map((item) => (
                          <tr key={item.purchaseOrderId}>
                            <td className="px-4 py-3">
                              <div className={`font-mono text-xs font-medium ${textPrimary}`}>{item.sku}</div>
                              <div
                                className={`mt-0.5 line-clamp-2 text-xs ${textSecondary}`}
                                title={item.description}
                              >
                                {item.description}
                              </div>
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${textPrimary}`}>
                              {item.quantity}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${textPrimary}`}>
                              <div>${item.baseCostPerUnit.toFixed(2)}</div>
                              <div className={`text-xs ${textSecondary}`}>
                                ${item.baseItemTotal.toFixed(2)}
                              </div>
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${textPrimary}`}>
                              <div>{item.proportionalShare.toFixed(1)}%</div>
                              <div className={`text-xs ${textSecondary}`}>
                                ${item.additionalCostAllocation.toFixed(2)}
                              </div>
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums`}>
                              <div className={`font-medium ${brandText}`}>
                                ${item.finalCostPerUnit.toFixed(2)}
                              </div>
                              <div className={`text-xs font-semibold ${brandText}`}>
                                ${item.finalItemTotal.toFixed(2)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className={`border-t-2 ${tableHead}`}>
                        <tr>
                          <td
                            colSpan={2}
                            className={`px-4 py-3 text-right text-[11px] font-semibold uppercase ${textSecondary}`}
                          >
                            {t('landedCosts.totalLandedCost')}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${textPrimary}`}>
                            ${landedCostCalculation.baseItemTotal.toFixed(2)}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${textPrimary}`}>
                            ${landedCostCalculation.totalAdditionalCosts.toFixed(2)}
                          </td>
                          <td className={`px-4 py-3 text-right font-bold tabular-nums ${brandText}`}>
                            ${landedCostCalculation.totalLandedCost.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal agregar costos */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            ref={formRef}
            role="dialog"
            className="sasa-modal-light max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">
                {t('landedCosts.addAdditionalCosts')}
              </h3>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('landedCosts.selectInvoice')} *
                </label>
                <select
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#515151]"
                  required
                >
                  <option value="">{t('landedCosts.selectInvoice')}</option>
                  {invoiceSummaries.map((inv) => (
                    <option key={inv.invoiceNumber} value={inv.invoiceNumber}>
                      {inv.invoiceNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                {formData.costs.map((cost, index) => (
                  <div key={cost.type} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="rounded bg-[#515151] px-3 py-1 text-sm font-medium text-white">
                        {translateCostType(cost.type)}
                      </span>
                      <div className="flex-1">
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          {t('landedCosts.amount')} (USD)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cost.amount || ''}
                          onChange={(e) =>
                            updateCostField(index, 'amount', parseFloat(e.target.value) || 0)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#515151]"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t('landedCosts.description')}
                      </label>
                      <input
                        type="text"
                        value={cost.description}
                        onChange={(e) => updateCostField(index, 'description', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#515151]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('landedCosts.date')} *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#515151]"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('landedCosts.comments')}
                </label>
                <textarea
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#515151]"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-[#515151] px-4 py-2 font-medium text-white hover:bg-black"
                >
                  {t('landedCosts.addAdditionalCosts')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('landedCosts.deleteCost')}
        description={t('landedCosts.deleteConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setCostToDelete(null);
        }}
      />

      <AlertDialog
        open={alertDialog.open}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, message: '' })}
      />

      {editDescriptionModal.open && editDescriptionModal.cost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div role="dialog" className="sasa-modal-light w-full max-w-md rounded-xl bg-white shadow-lg">
            <div className="px-6 py-5">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                {t('landedCosts.editDescription')}
              </h3>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {translateCostType(editDescriptionModal.cost.type)} — {t('landedCosts.description')}
              </label>
              <input
                type="text"
                value={editDescriptionModal.newDescription}
                onChange={(e) =>
                  setEditDescriptionModal({
                    ...editDescriptionModal,
                    newDescription: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#515151]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveDescription();
                  else if (e.key === 'Escape') {
                    setEditDescriptionModal({ open: false, cost: null, newDescription: '' });
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditDescriptionModal({ open: false, cost: null, newDescription: '' })}
                className="rounded-xl bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveDescription}
                className="rounded-xl bg-[#515151] px-4 py-2 font-medium text-white hover:bg-black"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

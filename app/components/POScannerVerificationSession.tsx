'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import POModalShell from './ui/POModalShell';
import { PurchaseOrder, Supplier } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { formatDateDMY, formatDateMedium } from '../utils/formatDate';
import { formatPONumber } from '../utils/purchaseOrderFormat';
import {
  getScanProgress,
  isLineEligibleForScanner,
  isLinePartiallyScanned,
  isLinePendingScanner,
  isLineReadyToConfirm,
  summarizeInvoiceForScanner,
} from '../utils/purchaseOrderBarcodeScan';
import { effectivePurchaseOrderStatus } from '../utils/purchaseOrderStatusTheme';
import POScanLinePickerModal from './POScanLinePickerModal';
import PoStatusIcon from './icons/PoStatusIcon';

export type ScannerScanResult = {
  ok: boolean;
  message: string;
  order?: PurchaseOrder;
  verified?: boolean;
  readyToConfirm?: boolean;
  pickCandidates?: PurchaseOrder[];
};

interface POScannerVerificationSessionProps {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  initialInvoice?: string | null;
  onClose: () => void;
  onProcessScan: (
    invoice: string,
    code: string,
    preferredOrderId?: string
  ) => Promise<ScannerScanResult>;
  onRegisterUnit: (orderId: string) => Promise<ScannerScanResult>;
  onUndoScanUnit: (orderId: string) => Promise<ScannerScanResult>;
  onConfirmLine: (orderId: string) => Promise<ScannerScanResult>;
}

type Feedback = { tone: 'ok' | 'warn' | 'error' | 'confirm'; text: string };

type InvoiceRow = {
  invoice: string;
  orders: PurchaseOrder[];
  supplierId: string;
  purchaseDate: Date;
};

export default function POScannerVerificationSession({
  purchaseOrders,
  suppliers,
  initialInvoice,
  onClose,
  onProcessScan,
  onRegisterUnit,
  onUndoScanUnit,
  onConfirmLine,
}: POScannerVerificationSessionProps) {
  const { t, tf } = useTranslation();
  const darkMode = useDarkMode();
  const [invoice, setInvoice] = useState<string | null>(initialInvoice ?? null);
  const [search, setSearch] = useState('');
  const [lastOrder, setLastOrder] = useState<PurchaseOrder | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [picker, setPicker] = useState<{ code: string; candidates: PurchaseOrder[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'pending' | 'scanned' | 'ready'>('pending');
  const disambiguationRef = useRef<Map<string, string>>(new Map());

  const scannerInvoices = useMemo(() => {
    const invoiceMap = new Map<string, InvoiceRow>();
    purchaseOrders.forEach((order) => {
      if (!isLineEligibleForScanner(order)) return;
      if (!invoiceMap.has(order.invoice)) {
        invoiceMap.set(order.invoice, {
          invoice: order.invoice,
          orders: [],
          supplierId: order.supplierId,
          purchaseDate: order.purchaseDate,
        });
      }
      invoiceMap.get(order.invoice)!.orders.push(order);
    });
    return [...invoiceMap.values()].sort((a, b) => a.invoice.localeCompare(b.invoice));
  }, [purchaseOrders]);

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return scannerInvoices;
    const query = search.toLowerCase();
    return scannerInvoices.filter((inv) => {
      const supplier = suppliers.find((s) => s.id === inv.supplierId);
      const supplierName = supplier?.name.toLowerCase() || '';
      const invoiceLower = inv.invoice.toLowerCase();
      const poLower = formatPONumber(inv.invoice).toLowerCase();
      const purchaseDateStr = formatDateDMY(inv.purchaseDate).toLowerCase();
      const hasMatchingSku = inv.orders.some((order) => order.sku?.toLowerCase().includes(query));
      return (
        invoiceLower.includes(query) ||
        poLower.includes(query) ||
        supplierName.includes(query) ||
        purchaseDateStr.includes(query) ||
        hasMatchingSku
      );
    });
  }, [scannerInvoices, search, suppliers]);

  const invoiceLines = useMemo(
    () => (invoice ? purchaseOrders.filter((o) => o.invoice === invoice) : []),
    [purchaseOrders, invoice]
  );

  const summary = useMemo(
    () => (invoice ? summarizeInvoiceForScanner(invoice, purchaseOrders) : null),
    [invoice, purchaseOrders]
  );

  const pendingLines = useMemo(
    () => invoiceLines.filter((o) => isLinePendingScanner(o) && !isLineReadyToConfirm(o)),
    [invoiceLines]
  );

  const readyToConfirmLines = useMemo(
    () => invoiceLines.filter(isLineReadyToConfirm),
    [invoiceLines]
  );

  const scannedLines = useMemo(
    () => invoiceLines.filter(isLinePartiallyScanned),
    [invoiceLines]
  );

  const globalProgress = useMemo(() => {
    let scanned = 0;
    let total = 0;
    let verifiedLines = 0;
    let totalLines = 0;
    for (const o of invoiceLines) {
      const verified = effectivePurchaseOrderStatus(o.status) === 'Verified';
      const eligible = isLineEligibleForScanner(o);
      if (!verified && !eligible) continue;
      totalLines++;
      if (verified) {
        verifiedLines++;
        total += o.quantity;
        scanned += o.quantity;
        continue;
      }
      const p = getScanProgress(o);
      total += p.expected;
      scanned += p.scanned;
    }
    return { scanned, total, verifiedLines, totalLines };
  }, [invoiceLines]);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const applyResult = useCallback((result: ScannerScanResult) => {
    if (result.order) setLastOrder(result.order);
    setFeedback({
      tone: result.readyToConfirm
        ? 'confirm'
        : result.ok
          ? 'ok'
          : result.pickCandidates?.length
            ? 'warn'
            : 'error',
      text: result.message,
    });
  }, []);

  const handleScan = useCallback(
    async (code: string, preferredOrderId?: string) => {
      if (!invoice || busy) return;
      setBusy(true);
      try {
        const result = await onProcessScan(invoice, code, preferredOrderId);
        if (result.pickCandidates && result.pickCandidates.length > 1) {
          setPicker({ code, candidates: result.pickCandidates });
          applyResult(result);
          return;
        }
        if (result.ok && result.order) {
          disambiguationRef.current.set(code.trim().toLowerCase(), result.order.id);
        }
        applyResult(result);
      } finally {
        setBusy(false);
      }
    },
    [invoice, busy, onProcessScan, applyResult]
  );

  useBarcodeScanner({
    enabled: Boolean(invoice) && !picker && !busy,
    onScan: (code) => {
      const key = code.trim().toLowerCase();
      const remembered = disambiguationRef.current.get(key);
      void handleScan(code, remembered);
    },
  });

  const handlePick = (order: PurchaseOrder) => {
    if (!picker) return;
    disambiguationRef.current.set(picker.code.trim().toLowerCase(), order.id);
    setPicker(null);
    void handleScan(picker.code, order.id);
  };

  const handleManualAdd = async () => {
    if (!lastOrder || busy) return;
    setBusy(true);
    try {
      const result = await onRegisterUnit(lastOrder.id);
      applyResult(result);
    } finally {
      setBusy(false);
    }
  };

  const handleUndoScan = async (orderId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await onUndoScanUnit(orderId);
      if (result.order) setLastOrder(result.order);
      setFeedback({
        tone: result.ok ? 'warn' : 'error',
        text: result.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmLine = async (orderId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await onConfirmLine(orderId);
      applyResult(result);
      if (result.verified && result.order) {
        setLastOrder(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const feedbackClass = darkMode
    ? feedback?.tone === 'ok'
      ? 'bg-green-900/35 text-green-200 border-green-700'
      : feedback?.tone === 'confirm'
        ? 'bg-indigo-900/35 text-indigo-200 border-indigo-700'
        : feedback?.tone === 'warn'
          ? 'bg-amber-900/35 text-amber-200 border-amber-700'
          : 'bg-red-900/35 text-red-200 border-red-700'
    : feedback?.tone === 'ok'
      ? 'bg-green-50 text-green-900 border-green-200'
      : feedback?.tone === 'confirm'
        ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
        : feedback?.tone === 'warn'
          ? 'bg-amber-50 text-amber-900 border-amber-200'
          : 'bg-red-50 text-red-900 border-red-200';

  if (!invoice) {
    return (
      <POModalShell
        title={t('purchaseOrders.scanner.selectInvoiceTitle')}
        titleId="po-scanner-title"
        closeLabel={t('purchaseOrders.scanner.exit')}
        onClose={onClose}
      >
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
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
              placeholder={t('purchaseOrders.searchInvoicePlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 outline-none focus:border-[#515151] focus:ring-2 focus:ring-[#515151]"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[calc(90vh-250px)] overflow-y-auto">
          {filteredInvoices.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              {search.trim()
                ? t('purchaseOrders.noInvoicesMatchSearch')
                : t('purchaseOrders.scanner.noInvoices')}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredInvoices.map((inv) => {
                const supplier = suppliers.find((s) => s.id === inv.supplierId);
                const poNumber = formatPONumber(inv.invoice);
                const invoiceDate = formatDateMedium(inv.purchaseDate);
                const scanSummary = summarizeInvoiceForScanner(inv.invoice, purchaseOrders);

                return (
                  <button
                    key={inv.invoice}
                    type="button"
                    onClick={() => setInvoice(inv.invoice)}
                    className="sasa-modal-row w-full px-6 py-4 text-left transition-colors focus:outline-none"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-3">
                          <span className="font-semibold text-gray-900">{poNumber}</span>
                          <span className="text-sm text-gray-500">•</span>
                          <span className="text-sm text-gray-600">{inv.invoice}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">{t('purchaseOrders.supplier')}:</span>{' '}
                            <span>{supplier?.name || t('purchaseOrders.unknownSupplier')}</span>
                          </div>
                          <div>
                            <span className="font-medium">{t('purchaseOrders.invoiceDate')}</span>{' '}
                            <span>{invoiceDate}</span>
                          </div>
                          <div>
                            <span className="font-medium">{t('purchaseOrders.items')}:</span>{' '}
                            <span>{inv.orders.length}</span>
                          </div>
                          {scanSummary && scanSummary.pendingUnits > 0 && (
                            <div>
                              <span className="font-medium">{t('purchaseOrders.scanner.pendingUnits')}:</span>{' '}
                              <span>{scanSummary.pendingUnits}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <svg
                        className="ml-4 h-5 w-5 shrink-0 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </POModalShell>
    );
  }

  const lastProg = lastOrder ? getScanProgress(lastOrder) : null;
  const lastReady = lastOrder ? isLineReadyToConfirm(lastOrder) : false;
  const scanTitle = formatPONumber(invoice);
  const unitsRemaining = Math.max(0, globalProgress.total - globalProgress.scanned);
  const unitsPct =
    globalProgress.total > 0 ? Math.min(100, (globalProgress.scanned / globalProgress.total) * 100) : 0;
  const linesPct =
    globalProgress.totalLines > 0
      ? Math.min(100, (globalProgress.verifiedLines / globalProgress.totalLines) * 100)
      : 0;
  const lastPct =
    lastProg && lastProg.expected > 0 ? Math.min(100, (lastProg.scanned / lastProg.expected) * 100) : 0;

  const ui = darkMode
    ? {
        border: 'border-gray-700',
        borderLight: 'border-gray-600',
        aside: 'bg-[#101010]',
        surface: 'border-gray-700 bg-white/[0.04]',
        surfaceHighlight: 'border-indigo-500/40 bg-indigo-500/10',
        surfaceReady: 'border-amber-500/40 bg-amber-500/10',
        stat: 'border-gray-700 bg-[#141414]',
        row: 'border-gray-700 bg-white/[0.03] hover:bg-white/[0.06]',
        rowActive: 'border-indigo-500/50 bg-indigo-500/15',
        track: 'bg-white/10',
        ghostBtn: 'border-gray-600 bg-white/10 text-gray-100 hover:bg-white/15',
        stepActive: 'border-indigo-400/60 bg-indigo-500/15 text-indigo-200',
        stepIdle: 'border-gray-600 bg-white/[0.03] text-gray-400',
        badgeScan: 'bg-sky-500/20 text-sky-200',
        badgeReady: 'bg-amber-500/20 text-amber-200',
        badgeDone: 'bg-green-500/20 text-green-200',
      }
    : {
        border: 'border-gray-100',
        borderLight: 'border-gray-200',
        aside: 'bg-gray-50',
        surface: 'border-gray-200 bg-white',
        surfaceHighlight: 'border-indigo-200 bg-indigo-50',
        surfaceReady: 'border-amber-200 bg-amber-50',
        stat: 'border-gray-200 bg-gray-50',
        row: 'border-gray-200 bg-white hover:bg-gray-50',
        rowActive: 'border-indigo-300 bg-indigo-50',
        track: 'bg-gray-200',
        ghostBtn: 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
        stepActive: 'border-indigo-300 bg-indigo-50 text-indigo-800',
        stepIdle: 'border-gray-200 bg-gray-50 text-gray-500',
        badgeScan: 'bg-sky-100 text-sky-800',
        badgeReady: 'bg-amber-100 text-amber-800',
        badgeDone: 'bg-green-100 text-green-800',
      };

  return (
    <>
      <POModalShell
        title={t('purchaseOrders.scanner.title')}
        titleId="po-scanner-title"
        maxWidthClass="max-w-5xl"
        closeLabel={t('purchaseOrders.scanner.exit')}
        onClose={onClose}
      >
        <div className={`border-b ${ui.border} px-6 py-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-base font-semibold text-gray-900">{scanTitle}</p>
              <p className="text-sm text-gray-500">
                {invoice} · {supplierName(summary?.supplierId ?? '')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setInvoice(null);
                setLastOrder(null);
                setFeedback(null);
                setSearch('');
              }}
              className="text-sm font-medium text-[#515151] hover:underline"
            >
              {t('purchaseOrders.scanner.changeInvoice')}
            </button>
          </div>
        </div>

        <div className={`grid gap-3 border-b px-6 py-4 sm:grid-cols-3 ${ui.border}`}>
          <button
            type="button"
            onClick={() => setSidebarTab('scanned')}
            className={`rounded-xl border p-3 text-left transition-colors hover:opacity-90 ${ui.stat}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('purchaseOrders.scanner.unitsCard')}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
              {globalProgress.scanned}
              <span className="text-lg font-semibold text-gray-500"> / {globalProgress.total}</span>
            </p>
            <div className={`mt-2 h-2 overflow-hidden rounded-full ${ui.track}`}>
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${unitsPct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {(t('purchaseOrders.scanner.unitsLeft') || '').replace('{count}', String(unitsRemaining))}
            </p>
            <p className="mt-1 text-xs font-medium text-indigo-600">
              {tf('purchaseOrders.scanner.viewScannedTap', 'Ver lista de escaneados')}
            </p>
          </button>
          <div className={`rounded-xl border p-3 ${ui.stat}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('purchaseOrders.scanner.linesCard')}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
              {globalProgress.verifiedLines}
              <span className="text-lg font-semibold text-gray-500"> / {globalProgress.totalLines}</span>
            </p>
            <div className={`mt-2 h-2 overflow-hidden rounded-full ${ui.track}`}>
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${linesPct}%` }} />
            </div>
          </div>
          <div className={`rounded-xl border p-3 ${ui.stat}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('purchaseOrders.scanner.readyCard')}
            </p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
              {readyToConfirmLines.length}
            </p>
            <p className="mt-3 text-xs text-gray-500">{t('purchaseOrders.scanner.stepConfirmDesc')}</p>
          </div>
        </div>

        <div className={`flex gap-2 border-b px-6 py-3 ${ui.border}`}>
          <div className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ui.stepActive}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
              1
            </span>
            <div>
              <p className="font-semibold">{t('purchaseOrders.scanner.stepScan')}</p>
              <p className="text-xs opacity-80">{t('purchaseOrders.scanner.stepScanDesc')}</p>
            </div>
          </div>
          <div
            className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              readyToConfirmLines.length > 0 ? ui.stepActive : ui.stepIdle
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                readyToConfirmLines.length > 0 ? 'bg-amber-500 text-white' : 'bg-gray-400 text-white'
              }`}
            >
              2
            </span>
            <div>
              <p className="font-semibold">{t('purchaseOrders.scanner.stepConfirm')}</p>
              <p className="text-xs opacity-80">{t('purchaseOrders.scanner.stepConfirmDesc')}</p>
            </div>
          </div>
        </div>

        <div className="grid max-h-[calc(90vh-320px)] min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_300px]">
          <div
            className={`flex min-h-0 flex-col gap-4 overflow-y-auto border-b p-6 lg:border-b-0 lg:border-r ${ui.border}`}
          >
            {feedback && (
              <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${feedbackClass}`}>
                {feedback.text}
              </div>
            )}

            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${ui.surfaceHighlight}`}>
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{t('purchaseOrders.scanner.scannerActive')}</p>
                <p className="text-xs text-gray-500">{t('purchaseOrders.scanner.scannerActiveHint')}</p>
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${lastOrder ? ui.surface : ui.surface}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('purchaseOrders.scanner.lastScan')}
                </p>
                {lastOrder && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      lastReady ? ui.badgeReady : ui.badgeScan
                    }`}
                  >
                    {lastReady
                      ? t('purchaseOrders.scanner.statusReady')
                      : t('purchaseOrders.scanner.statusScanning')}
                  </span>
                )}
              </div>

              {lastOrder && lastProg ? (
                <div className="mt-3 flex gap-4">
                  {lastOrder.images?.[0] ? (
                    <img
                      src={lastOrder.images[0]}
                      alt=""
                      className={`h-20 w-20 shrink-0 rounded-lg border object-cover ${ui.borderLight}`}
                    />
                  ) : (
                    <div
                      className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border ${ui.borderLight} ${ui.stat}`}
                    >
                      <PoStatusIcon status={lastReady ? 'Verified' : 'Received'} className="h-8 w-8" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 font-semibold text-gray-900">{lastOrder.description}</h3>
                    <p className="mt-0.5 font-mono text-xs text-gray-500">{lastOrder.sku}</p>
                    <p className="mt-2 text-xs font-medium text-gray-500">
                      {t('purchaseOrders.scanner.lineProgress')}
                    </p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl font-bold tabular-nums text-gray-900">{lastProg.scanned}</span>
                      <span className="text-lg text-gray-500">/ {lastProg.expected}</span>
                    </div>
                    <div className={`mt-2 h-2.5 overflow-hidden rounded-full ${ui.track}`}>
                      <div
                        className={`h-full rounded-full transition-all ${lastReady ? 'bg-amber-500' : 'bg-indigo-500'}`}
                        style={{ width: `${lastPct}%` }}
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {lastProg.scanned > 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleUndoScan(lastOrder.id)}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                            darkMode
                              ? 'border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20'
                              : 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                          }`}
                        >
                          {t('purchaseOrders.scanner.undoLastScan')}
                        </button>
                      )}
                      {lastReady ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleConfirmLine(lastOrder.id)}
                          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {t('purchaseOrders.scanner.confirmLine')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleManualAdd()}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${ui.ghostBtn}`}
                        >
                          {t('purchaseOrders.scanner.addOneUnit')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-4 py-2">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed ${ui.borderLight}`}
                  >
                    <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">{t('purchaseOrders.scanner.noScanYet')}</p>
                    <p className="mt-0.5 text-sm text-gray-500">{t('purchaseOrders.scanner.noScanYetHint')}</p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-center text-xs text-gray-500">{t('purchaseOrders.scanner.scanHint')}</p>
          </div>

          <aside className={`flex min-h-0 flex-col overflow-hidden border-t lg:border-t-0 lg:border-l ${ui.border} ${ui.aside}`}>
            <div className={`flex shrink-0 border-b ${ui.border}`}>
              {(
                [
                  ['pending', tf('purchaseOrders.scanner.pendingLines', 'Por escanear'), pendingLines.length],
                  ['scanned', tf('purchaseOrders.scanner.scannedTab', 'Escaneados'), scannedLines.length],
                  ['ready', tf('purchaseOrders.scanner.readyTab', 'A confirmar'), readyToConfirmLines.length],
                ] as const
              ).map(([tab, label, count]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSidebarTab(tab)}
                  title={label}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2.5 ${
                    sidebarTab === tab
                      ? darkMode
                        ? 'border-b-2 border-indigo-400 bg-white/[0.04] text-white'
                        : 'border-b-2 border-indigo-600 bg-indigo-50/50 text-indigo-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="w-full truncate text-center text-[11px] font-semibold leading-tight">
                    {label}
                  </span>
                  <span className="text-[10px] font-bold tabular-nums opacity-80">{count}</span>
                </button>
              ))}
            </div>

            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {sidebarTab === 'ready' &&
                (readyToConfirmLines.length === 0 ? (
                  <li className="py-8 text-center text-sm text-gray-500">
                    {t('purchaseOrders.scanner.noReadyLines')}
                  </li>
                ) : (
                  readyToConfirmLines.map((o) => {
                    const p = getScanProgress(o);
                    return (
                      <li key={o.id}>
                        <div
                          className={`rounded-lg border px-3 py-2.5 ${ui.surfaceReady} ${
                            lastOrder?.id === o.id ? ui.rowActive : ''
                          }`}
                        >
                          <p className="line-clamp-2 text-sm font-medium text-gray-900">{o.description}</p>
                          <p className="mt-1 text-xs tabular-nums text-gray-600">
                            {p.scanned}/{p.expected} · {t('purchaseOrders.scanner.statusReady')}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleUndoScan(o.id)}
                              className={`text-xs font-medium disabled:opacity-50 ${
                                darkMode ? 'text-red-300 hover:underline' : 'text-red-700 hover:underline'
                              }`}
                            >
                              {t('purchaseOrders.scanner.undoScan')}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleConfirmLine(o.id)}
                              className={`text-xs font-semibold disabled:opacity-50 ${
                                darkMode ? 'text-amber-300 hover:underline' : 'text-amber-700 hover:underline'
                              }`}
                            >
                              {t('purchaseOrders.scanner.confirmShort')} →
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })
                ))}

              {sidebarTab === 'scanned' &&
                (scannedLines.length === 0 ? (
                  <li className="py-8 text-center text-sm text-gray-500">
                    {t('purchaseOrders.scanner.noScannedLines')}
                  </li>
                ) : (
                  scannedLines.map((o) => {
                    const p = getScanProgress(o);
                    const pct = p.expected > 0 ? Math.min(100, (p.scanned / p.expected) * 100) : 0;
                    const ready = isLineReadyToConfirm(o);
                    return (
                      <li key={o.id}>
                        <div
                          className={`rounded-lg border px-3 py-2.5 ${lastOrder?.id === o.id ? ui.rowActive : ui.row}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 flex-1 text-sm font-medium text-gray-900">{o.description}</p>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                ready ? ui.badgeReady : ui.badgeScan
                              }`}
                            >
                              {ready
                                ? t('purchaseOrders.scanner.statusReady')
                                : t('purchaseOrders.scanner.statusScanning')}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                            <span className="font-mono">{o.sku}</span>
                            <span className="font-semibold tabular-nums text-gray-700">
                              {p.scanned}/{p.expected}
                            </span>
                          </div>
                          <div className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${ui.track}`}>
                            <div
                              className={`h-full rounded-full transition-all ${ready ? 'bg-amber-500' : 'bg-indigo-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            {p.scanned > 0 && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleUndoScan(o.id)}
                                className={`text-xs font-medium disabled:opacity-50 ${
                                  darkMode ? 'text-red-300 hover:underline' : 'text-red-700 hover:underline'
                                }`}
                              >
                                {t('purchaseOrders.scanner.undoScan')}
                              </button>
                            )}
                            {ready && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleConfirmLine(o.id)}
                                className={`text-xs font-semibold ${darkMode ? 'text-amber-300' : 'text-amber-700'} hover:underline disabled:opacity-50`}
                              >
                                {t('purchaseOrders.scanner.confirmShort')} →
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })
                ))}

              {sidebarTab === 'pending' &&
                (pendingLines.length === 0 ? (
                  <li className="py-8 text-center text-sm text-gray-500">
                    {t('purchaseOrders.scanner.noPendingLines')}
                  </li>
                ) : (
                  pendingLines.map((o) => {
                    const p = getScanProgress(o);
                    const pct = p.expected > 0 ? Math.min(100, (p.scanned / p.expected) * 100) : 0;
                    return (
                      <li key={o.id}>
                        <div
                          className={`rounded-lg border px-3 py-2.5 ${lastOrder?.id === o.id ? ui.rowActive : ui.row}`}
                        >
                          <p className="line-clamp-2 text-sm font-medium text-gray-900">{o.description}</p>
                          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                            <span className="font-mono">{o.sku}</span>
                            <span className="font-semibold tabular-nums text-gray-700">
                              {p.scanned}/{p.expected}
                            </span>
                          </div>
                          <div className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${ui.track}`}>
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {p.scanned > 0 && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleUndoScan(o.id)}
                              className={`mt-2 text-xs font-medium disabled:opacity-50 ${
                                darkMode ? 'text-red-300 hover:underline' : 'text-red-700 hover:underline'
                              }`}
                            >
                              {t('purchaseOrders.scanner.undoScan')}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })
                ))}
            </ul>
          </aside>
        </div>
      </POModalShell>

      {picker && (
        <POScanLinePickerModal
          scannedCode={picker.code}
          candidates={picker.candidates}
          suppliers={suppliers}
          onSelect={handlePick}
          onCancel={() => setPicker(null)}
        />
      )}
    </>
  );
}

import type { AdditionalCost, InventoryItem, PurchaseOrder, SalesInvoice } from '../types';
import { resolveSkuUnitCost } from './landedCostCalculation';

export type ProfitDateRange = { from: Date; to: Date };

export type ProfitLine = {
  sku: string;
  description: string;
  quantity: number;
  unitSalePrice: number;
  lineNetRevenue: number;
  unitCost: number | null;
  cogs: number | null;
  profit: number | null;
  marginPercent: number | null;
  hasCost: boolean;
};

export type ProfitByInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  date: Date;
  revenue: number;
  cogs: number;
  profit: number;
  marginPercent: number;
  linesWithMissingCost: number;
  lines: ProfitLine[];
};

export type ProfitBySku = {
  sku: string;
  description: string;
  quantitySold: number;
  unitCost: number | null;
  avgSalePrice: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPercent: number;
  hasCost: boolean;
  linesWithMissingCost: number;
};

export type ProfitSummary = {
  revenue: number;
  cogs: number;
  profit: number;
  marginPercent: number;
  invoiceCount: number;
  linesWithMissingCost: number;
  skusWithMissingCost: number;
};

export type SalesProfitResult = {
  summary: ProfitSummary;
  byInvoice: ProfitByInvoice[];
  bySku: ProfitBySku[];
};

function toJsDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') {
    const d = maybe.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function invoiceDate(inv: SalesInvoice): Date | null {
  return toJsDate(inv.date) ?? toJsDate(inv.createdAt);
}

function marginPercent(profit: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return (profit / revenue) * 100;
}

function lineNetRevenue(lineTotal: number, invoice: SalesInvoice): number {
  const subtotal = invoice.subtotal ?? 0;
  const grandTotal = invoice.grandTotal ?? 0;
  if (subtotal > 0) {
    return lineTotal * (grandTotal / subtotal);
  }
  return lineTotal;
}

function buildProfitLine(
  line: SalesInvoice['items'][0],
  invoice: SalesInvoice,
  unitCost: number | null
): ProfitLine {
  const netRevenue = lineNetRevenue(line.totalPrice, invoice);
  const qty = line.quantity > 0 ? line.quantity : 1;
  const hasCost = unitCost != null;
  const cogs = hasCost ? qty * unitCost : null;
  const profit = hasCost && cogs != null ? netRevenue - cogs : null;

  return {
    sku: line.sku,
    description: line.description,
    quantity: qty,
    unitSalePrice: qty > 0 ? line.totalPrice / qty : 0,
    lineNetRevenue: netRevenue,
    unitCost,
    cogs,
    profit,
    marginPercent: profit != null ? marginPercent(profit, netRevenue) : null,
    hasCost,
  };
}

export function computeSalesProfit(
  invoices: SalesInvoice[],
  inventory: InventoryItem[],
  purchaseOrders: PurchaseOrder[],
  additionalCosts: AdditionalCost[],
  dateRange?: ProfitDateRange
): SalesProfitResult {
  const costCache = new Map<string, ReturnType<typeof resolveSkuUnitCost>>();

  const getUnitCost = (sku: string) => {
    if (!costCache.has(sku)) {
      costCache.set(sku, resolveSkuUnitCost(sku, inventory, purchaseOrders, additionalCosts));
    }
    return costCache.get(sku)!;
  };

  let filtered = invoices.filter((inv) => inv.deliveryStatus !== 'Canceled');

  if (dateRange) {
    const { from, to } = dateRange;
    filtered = filtered.filter((inv) => {
      const d = invoiceDate(inv);
      if (!d) return false;
      const t = d.getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
  }

  const byInvoice: ProfitByInvoice[] = [];
  const allProfitLines: ProfitLine[] = [];

  let totalRevenue = 0;
  let totalCogs = 0;
  let totalLinesMissingCost = 0;

  for (const invoice of filtered) {
    const invDate = invoiceDate(invoice) ?? new Date();
    const lines: ProfitLine[] = [];
    let invCogs = 0;
    let invLinesMissing = 0;

    for (const line of invoice.items) {
      const { unitCost } = getUnitCost(line.sku);
      const profitLine = buildProfitLine(line, invoice, unitCost);
      lines.push(profitLine);
      allProfitLines.push(profitLine);

      if (profitLine.hasCost && profitLine.cogs != null) {
        invCogs += profitLine.cogs;
      } else {
        invLinesMissing += 1;
        totalLinesMissingCost += 1;
      }
    }

    const revenue = invoice.grandTotal ?? 0;
    const profit = revenue - invCogs;

    byInvoice.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      date: invDate,
      revenue,
      cogs: invCogs,
      profit,
      marginPercent: marginPercent(profit, revenue),
      linesWithMissingCost: invLinesMissing,
      lines,
    });

    totalRevenue += revenue;
    totalCogs += invCogs;
  }

  const skuAgg = new Map<
    string,
    {
      description: string;
      quantitySold: number;
      revenue: number;
      cogs: number;
      linesWithMissingCost: number;
    }
  >();

  for (const pl of allProfitLines) {
    const existing = skuAgg.get(pl.sku);
    const lineCogs = pl.cogs ?? 0;
    if (existing) {
      existing.quantitySold += pl.quantity;
      existing.revenue += pl.lineNetRevenue;
      if (pl.hasCost) existing.cogs += lineCogs;
      else existing.linesWithMissingCost += 1;
      if (!existing.description && pl.description) existing.description = pl.description;
    } else {
      skuAgg.set(pl.sku, {
        description: pl.description,
        quantitySold: pl.quantity,
        revenue: pl.lineNetRevenue,
        cogs: pl.hasCost ? lineCogs : 0,
        linesWithMissingCost: pl.hasCost ? 0 : 1,
      });
    }
  }

  const bySku: ProfitBySku[] = Array.from(skuAgg.entries())
    .map(([sku, agg]) => {
      const { unitCost } = getUnitCost(sku);
      const allLinesHaveCost = agg.linesWithMissingCost === 0 && unitCost != null;
      const profit = agg.revenue - agg.cogs;
      return {
        sku,
        description: agg.description,
        quantitySold: agg.quantitySold,
        unitCost,
        avgSalePrice: agg.quantitySold > 0 ? agg.revenue / agg.quantitySold : 0,
        revenue: agg.revenue,
        cogs: agg.cogs,
        profit,
        marginPercent: marginPercent(profit, agg.revenue),
        hasCost: allLinesHaveCost,
        linesWithMissingCost: agg.linesWithMissingCost,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const skusWithMissingCost = bySku.filter(
    (s) => !s.hasCost || s.linesWithMissingCost > 0
  ).length;

  const totalProfit = totalRevenue - totalCogs;

  return {
    summary: {
      revenue: totalRevenue,
      cogs: totalCogs,
      profit: totalProfit,
      marginPercent: marginPercent(totalProfit, totalRevenue),
      invoiceCount: byInvoice.length,
      linesWithMissingCost: totalLinesMissingCost,
      skusWithMissingCost,
    },
    byInvoice: byInvoice.sort((a, b) => b.date.getTime() - a.date.getTime()),
    bySku,
  };
}

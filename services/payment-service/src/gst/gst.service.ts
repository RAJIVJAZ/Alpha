import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { generateDocumentNumber, Prisma } from '@foodgrid/database';
import type { InvoiceType } from '@foodgrid/database';
import { computeGst, extractGst, isInterState, normalizePage, paginate, round2, STATUTORY_RATES, sumMoney } from '@foodgrid/utils';
import { InternalHttpService, resolveRange } from '@foodgrid/utils/server';

type Tx = Prisma.TransactionClient;

export interface TenantTaxInfo {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  stateCode: string | null;
}

export const PLATFORM = {
  name: process.env.PLATFORM_LEGAL_NAME ?? 'FoodGrid Technologies Pvt Ltd',
  gstin: process.env.PLATFORM_GSTIN ?? '29AAACF0000A1ZP',
  stateCode: process.env.PLATFORM_STATE_CODE ?? '29',
};

/**
 * GST invoicing and statutory reports.
 *  - CUSTOMER_ORDER: restaurant service invoiced by the platform as ECO u/s 9(5) (5%).
 *  - DELIVERY_SERVICE: delivery + platform fees (18%, SAC 9968/9985).
 *  - COMMISSION: platform commission invoiced to merchants (18%, SAC 9985).
 *  - B2B_SALE: goods sold by marketplace sellers (seller's GSTIN; TCS reported in GSTR-8).
 */
@Injectable()
export class GstService {
  private readonly logger = new Logger(GstService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  async tenantInfo(tenantId: string): Promise<TenantTaxInfo | null> {
    return this.internal.get<TenantTaxInfo>('user', `internal/tenants/${tenantId}`, { timeoutMs: 2000 }).catch((err: Error) => {
      this.logger.warn(`tenant ${tenantId} lookup failed: ${err.message}`);
      return null;
    });
  }

  async issue(
    tx: Tx,
    input: {
      type: InvoiceType;
      referenceId: string;
      tenantId: string | null;
      supplier: { name: string; gstin: string | null; stateCode: string };
      recipient: { name: string | null; gstin: string | null; stateCode: string | null };
      hsnSac: string;
      taxableValue: number;
      ratePct: number;
      prefix: string;
    },
  ) {
    const existing = await tx.gstInvoice.findFirst({ where: { type: input.type, referenceId: input.referenceId } });
    if (existing) return existing;
    const placeOfSupply = input.recipient.stateCode ?? input.supplier.stateCode;
    const inter = isInterState(input.supplier.stateCode, placeOfSupply);
    const g = computeGst(input.taxableValue, input.ratePct, inter);
    return tx.gstInvoice.create({
      data: {
        invoiceNumber: await generateDocumentNumber(tx, input.prefix),
        type: input.type,
        referenceId: input.referenceId,
        tenantId: input.tenantId,
        supplierName: input.supplier.name,
        supplierGstin: input.supplier.gstin,
        supplierStateCode: input.supplier.stateCode,
        recipientName: input.recipient.name,
        recipientGstin: input.recipient.gstin,
        placeOfSupply,
        isInterState: inter,
        hsnSac: input.hsnSac,
        taxableValue: g.taxableValue,
        cgst: g.cgst,
        sgst: g.sgst,
        igst: g.igst,
        total: g.total,
      },
    });
  }

  /** Invoices for a delivered consumer order (platform is the deemed supplier). */
  async invoiceCustomerOrder(
    tx: Tx,
    o: { orderId: string; tenantId: string; customerName: string | null; foodTaxable: number; serviceTaxable: number },
  ) {
    const recipient = { name: o.customerName, gstin: null, stateCode: PLATFORM.stateCode };
    if (o.foodTaxable > 0) {
      await this.issue(tx, {
        type: 'CUSTOMER_ORDER',
        referenceId: o.orderId,
        tenantId: o.tenantId,
        supplier: PLATFORM,
        recipient,
        hsnSac: '996331',
        taxableValue: o.foodTaxable,
        ratePct: 5,
        prefix: 'FGI',
      });
    }
    if (o.serviceTaxable > 0) {
      await this.issue(tx, {
        type: 'DELIVERY_SERVICE',
        referenceId: o.orderId,
        tenantId: null,
        supplier: PLATFORM,
        recipient,
        hsnSac: '996813',
        taxableValue: o.serviceTaxable,
        ratePct: 18,
        prefix: 'FGS',
      });
    }
  }

  async summary(q: { from?: string; to?: string; tenantId?: string }) {
    const range = resolveRange(q);
    const rows = await this.prisma.gstInvoice.groupBy({
      by: ['type', 'isInterState'],
      where: { issuedAt: { gte: range.from, lte: range.to }, tenantId: q.tenantId },
      _sum: { taxableValue: true, cgst: true, sgst: true, igst: true, total: true },
      _count: { _all: true },
    });
    const totals = {
      taxableValue: sumMoney(rows.map((r) => r._sum.taxableValue?.toString() ?? 0)),
      cgst: sumMoney(rows.map((r) => r._sum.cgst?.toString() ?? 0)),
      sgst: sumMoney(rows.map((r) => r._sum.sgst?.toString() ?? 0)),
      igst: sumMoney(rows.map((r) => r._sum.igst?.toString() ?? 0)),
    };
    return {
      from: range.from,
      to: range.to,
      totals: { ...totals, totalTax: sumMoney([totals.cgst, totals.sgst, totals.igst]) },
      byType: rows.map((r) => ({
        type: r.type,
        interState: r.isInterState,
        invoices: r._count._all,
        taxableValue: r._sum.taxableValue,
        cgst: r._sum.cgst,
        sgst: r._sum.sgst,
        igst: r._sum.igst,
        total: r._sum.total,
      })),
    };
  }

  async invoices(q: { from?: string; to?: string; type?: InvoiceType; tenantId?: string; page?: number; pageSize?: number }) {
    const range = resolveRange(q);
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.GstInvoiceWhereInput = { issuedAt: { gte: range.from, lte: range.to }, type: q.type, tenantId: q.tenantId };
    const [rows, total] = await Promise.all([
      this.prisma.gstInvoice.findMany({ where, orderBy: { issuedAt: 'desc' }, skip, take }),
      this.prisma.gstInvoice.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  /**
   * GSTR-8 (TCS by e-commerce operator): per supplier GSTIN, net taxable value
   * of goods supplied through the marketplace and 1% TCS (0.5% CGST + 0.5%
   * SGST intra-state, 1% IGST inter-state).
   */
  async gstr8(month: string) {
    const from = new Date(`${month}-01T00:00:00+05:30`);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    const rows = await this.prisma.gstInvoice.groupBy({
      by: ['supplierGstin', 'supplierName', 'isInterState'],
      where: { type: 'B2B_SALE', issuedAt: { gte: from, lt: to } },
      _sum: { taxableValue: true },
      _count: { _all: true },
    });
    const suppliers = rows.map((r) => {
      const net = Number(r._sum.taxableValue ?? 0);
      const tcs = round2((net * STATUTORY_RATES.tcsPct) / 100);
      return {
        supplierGstin: r.supplierGstin,
        supplierName: r.supplierName,
        invoices: r._count._all,
        netTaxableValue: round2(net),
        tcsIgst: r.isInterState ? tcs : 0,
        tcsCgst: r.isInterState ? 0 : round2(tcs / 2),
        tcsSgst: r.isInterState ? 0 : round2(tcs - round2(tcs / 2)),
      };
    });
    return {
      month,
      operatorGstin: PLATFORM.gstin,
      suppliers,
      totalTcs: sumMoney(suppliers.map((s) => s.tcsIgst + s.tcsCgst + s.tcsSgst)),
    };
  }

  /** Splits a GST-inclusive amount (used for reports on settlement lines). */
  breakdown(amountInclusive: number, ratePct: number) {
    return extractGst(amountInclusive, ratePct, false);
  }
}

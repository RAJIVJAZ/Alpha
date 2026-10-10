import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { CommissionRule, DbClient, Prisma, SettlementStatus } from '@foodgrid/database';
import {
  B2bOrderEvent,
  CommissionAccruedEvent,
  EventTypes,
  OrderStatusChangedEvent,
} from '@foodgrid/types';
import {
  conflict,
  money,
  normalizePage,
  notFound,
  paginate,
  round2,
  sumMoney,
} from '@foodgrid/utils';
import { InternalHttpService, OutboxService } from '@foodgrid/utils/server';
import {
  CommissionRuleLike,
  computeSettlementLine,
  DEFAULT_COMMISSION,
  resolveCommissionRule,
} from '../domain/settlement';
import { GstService, PLATFORM } from '../gst/gst.service';
import {
  CommissionRuleDto,
  ListSettlementsDto,
  UpdateCommissionRuleDto,
} from './dto/settlement.dto';

const toRuleLike = (r: CommissionRule): CommissionRuleLike => ({
  ...r,
  ratePct: Number(r.ratePct),
  fixedFee: Number(r.fixedFee),
  minFee: r.minFee ? Number(r.minFee) : null,
  maxFee: r.maxFee ? Number(r.maxFee) : null,
});

/** Commission accrual per order and periodic merchant settlements. */
@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gst: GstService,
    private readonly outbox: OutboxService,
    private readonly internal: InternalHttpService,
  ) {}

  // ─── commission rules ─────────────────────────────────────────────────────
  rules() {
    return this.prisma.commissionRule.findMany({
      orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
  }
  async createRule(dto: CommissionRuleDto, actorId: string) {
    await this.audit(actorId, 'commission_rule.create', dto.tenantId, undefined, dto);
    return this.prisma.commissionRule.create({ data: dto });
  }
  async updateRule(id: string, dto: UpdateCommissionRuleDto, actorId: string) {
    const rule = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!rule) throw notFound('Commission rule', id);
    await this.audit(actorId, 'commission_rule.update', rule.tenantId, id, dto);
    return this.prisma.commissionRule.update({ where: { id }, data: dto });
  }

  /**
   * A business's commission is money terms, so who changed it goes to the admin audit log.
   * Recorded before the change: a failed audit blocks it, and a retried create cannot duplicate.
   */
  private audit(
    actorId: string,
    action: string,
    tenantId: string | null | undefined,
    entityId: string | undefined,
    changes: object,
  ) {
    return this.internal.post('user', 'internal/audit-logs', {
      actorId,
      tenantId: tenantId ?? undefined,
      action,
      entityType: 'CommissionRule',
      entityId,
      changes,
    });
  }

  private async ruleFor(tenantId: string, outletId: string, tenantType: string) {
    const rules = (await this.prisma.commissionRule.findMany({ where: { isActive: true } })).map(
      toRuleLike,
    );
    return (
      resolveCommissionRule(rules, { tenantId, outletId, tenantType, at: new Date() }) ??
      DEFAULT_COMMISSION
    );
  }

  /**
   * Accrues the merchant payable for a delivered / completed consumer order and
   * publishes the commission charged, so the order and analytics carry the same figure.
   */
  async accrueOrder(o: OrderStatusChangedEvent) {
    // Counter sales are collected by the merchant directly; nothing to settle, no commission.
    if (o.channel === 'POS' || o.paymentMethod === 'CASH') {
      await this.commissionCharged(this.prisma, o, 0, 0);
      return null;
    }
    const tenantType = o.outletType === 'FOOD_CART' ? 'FOOD_CART' : 'RESTAURANT';
    const rule = await this.ruleFor(o.tenantId, o.outletId, tenantType);
    const amounts = computeSettlementLine(
      {
        subtotal: Number(o.subtotal),
        packagingCharge: Number(o.packagingCharge),
        merchantDiscount: Number(o.merchantDiscount),
        deliveryFee: Number(o.deliveryFee),
        platformFee: Number(o.platformFee),
        taxTotal: Number(o.taxTotal),
      },
      rule,
    );
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.settlementLine.findUnique({ where: { orderId: o.orderId } });
      if (existing) return existing;
      const line = await tx.settlementLine.create({
        data: {
          tenantId: o.tenantId,
          outletId: o.outletId,
          orderId: o.orderId,
          orderDate: o.placedAt ? new Date(o.placedAt) : new Date(),
          orderTotal: Number(o.total),
          merchantDiscount: Number(o.merchantDiscount),
          ...amounts,
        },
      });
      await this.commissionCharged(tx, o, rule.ratePct, amounts.commission);
      // the platform invoices the customer as the deemed supplier (ECO u/s 9(5))
      const discount = Number(o.discount);
      await this.gst.invoiceCustomerOrder(tx, {
        orderId: o.orderId,
        tenantId: o.tenantId,
        customerName: o.customerName,
        foodTaxable: round2(Number(o.subtotal) + Number(o.packagingCharge) - discount),
        serviceTaxable: round2(Number(o.deliveryFee) + Number(o.platformFee)),
      });
      return line;
    });
  }

  private commissionCharged(
    db: DbClient,
    o: OrderStatusChangedEvent,
    ratePct: number,
    commission: number,
  ) {
    return this.outbox.enqueue<CommissionAccruedEvent>(db, {
      stream: 'payment',
      type: EventTypes.CommissionAccrued,
      aggregateType: 'Order',
      aggregateId: o.orderId,
      tenantId: o.tenantId,
      data: {
        orderId: o.orderId,
        tenantId: o.tenantId,
        outletId: o.outletId,
        commissionRate: money(ratePct),
        commissionAmount: money(commission),
      },
    });
  }

  /** B2B marketplace sale: seller invoice + settlement with 1% TCS (prepaid orders only). */
  async accrueB2bOrder(o: B2bOrderEvent) {
    const [seller, buyer] = await Promise.all([
      this.gst.tenantInfo(o.sellerTenantId),
      this.gst.tenantInfo(o.buyerTenantId),
    ]);
    const taxable = round2(
      Number(o.subtotal ?? o.total) - Number(o.discount ?? 0) + Number(o.deliveryCharge ?? 0),
    );
    const effectiveRate = taxable > 0 ? round2((Number(o.taxTotal ?? 0) / taxable) * 100) : 0;
    await this.prisma.$transaction(async (tx) => {
      await this.gst.issue(tx, {
        type: 'B2B_SALE',
        referenceId: o.b2bOrderId,
        tenantId: o.sellerTenantId,
        supplier: {
          name: seller?.legalName ?? seller?.name ?? 'Seller',
          gstin: seller?.gstin ?? null,
          stateCode: seller?.stateCode ?? PLATFORM.stateCode,
        },
        recipient: {
          name: buyer?.legalName ?? buyer?.name ?? null,
          gstin: buyer?.gstin ?? null,
          stateCode: buyer?.stateCode ?? null,
        },
        hsnSac: 'MULTI',
        taxableValue: taxable,
        ratePct: effectiveRate,
        prefix: 'B2B',
      });
      if (o.paymentTerms !== 'PREPAID') return;
      if (await tx.settlementLine.findUnique({ where: { orderId: o.b2bOrderId } })) return;
      const rule = await this.ruleFor(o.sellerTenantId, o.sellerTenantId, 'SUPPLIER');
      const amounts = computeSettlementLine(
        {
          subtotal: taxable,
          packagingCharge: 0,
          merchantDiscount: 0,
          deliveryFee: 0,
          platformFee: 0,
          taxTotal: Number(o.taxTotal ?? 0),
        },
        rule,
        { tcsApplicable: true },
      );
      // goods sellers receive the GST they charged; they remit it themselves
      amounts.netAmount = round2(amounts.netAmount + amounts.gstCollected);
      await tx.settlementLine.create({
        data: {
          tenantId: o.sellerTenantId,
          outletId: o.sellerTenantId, // B2B sellers have no outlets; the tenant is the selling unit
          orderId: o.b2bOrderId,
          orderDate: new Date(),
          orderTotal: Number(o.total),
          ...amounts,
        },
      });
    });
  }

  /** Groups unsettled lines into one settlement per tenant for [start, end). */
  async run(periodStart: Date, periodEnd: Date) {
    const groups = await this.prisma.settlementLine.groupBy({
      by: ['tenantId'],
      where: { settlementId: null, orderDate: { gte: periodStart, lt: periodEnd } },
    });
    const created: string[] = [];
    for (const { tenantId } of groups) {
      const settlement = await this.prisma.$transaction(async (tx) => {
        const exists = await tx.settlement.findUnique({
          where: { tenantId_periodStart_periodEnd: { tenantId, periodStart, periodEnd } },
        });
        if (exists) return null;
        const lines = await tx.settlementLine.findMany({
          where: { tenantId, settlementId: null, orderDate: { gte: periodStart, lt: periodEnd } },
        });
        const sum = (k: keyof (typeof lines)[number]) => sumMoney(lines.map((l) => String(l[k])));
        const s = await tx.settlement.create({
          data: {
            tenantId,
            periodStart,
            periodEnd,
            ordersCount: lines.length,
            grossSales: sum('taxableValue'),
            merchantDiscounts: sum('merchantDiscount'),
            commission: sum('commission'),
            commissionGst: sum('commissionGst'),
            tcs: sum('tcs'),
            tds: sum('tds'),
            netPayable: sum('netAmount'),
          },
        });
        await tx.settlementLine.updateMany({
          where: { id: { in: lines.map((l) => l.id) } },
          data: { settlementId: s.id },
        });
        const tenant = await this.gst.tenantInfo(tenantId);
        if (Number(s.commission) > 0) {
          await this.gst.issue(tx, {
            type: 'COMMISSION',
            referenceId: s.id,
            tenantId,
            supplier: PLATFORM,
            recipient: {
              name: tenant?.legalName ?? tenant?.name ?? null,
              gstin: tenant?.gstin ?? null,
              stateCode: tenant?.stateCode ?? null,
            },
            hsnSac: '998599',
            taxableValue: Number(s.commission),
            ratePct: 18,
            prefix: 'FGC',
          });
        }
        return s;
      });
      if (settlement) created.push(settlement.id);
    }
    this.logger.log(
      `Settlement run ${periodStart.toISOString()}..${periodEnd.toISOString()}: ${created.length} settlements`,
    );
    return { created: created.length, settlementIds: created };
  }

  async list(q: ListSettlementsDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.SettlementWhereInput = {
      tenantId: q.tenantId,
      status: q.status as SettlementStatus | undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.settlement.findMany({ where, orderBy: { periodEnd: 'desc' }, skip, take }),
      this.prisma.settlement.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async get(id: string, tenantId?: string) {
    const s = await this.prisma.settlement.findUnique({
      where: { id },
      include: { lines: { orderBy: { orderDate: 'asc' } } },
    });
    if (!s || (tenantId && s.tenantId !== tenantId)) throw notFound('Settlement', id);
    return s;
  }

  async markPaid(id: string, payoutReference: string) {
    const s = await this.prisma.settlement.findUnique({ where: { id } });
    if (!s) throw notFound('Settlement', id);
    if (s.status === 'PAID') throw conflict('Settlement already paid', 'ALREADY_PAID');
    return this.prisma.settlement.update({
      where: { id },
      data: { status: 'PAID', payoutReference, paidAt: new Date() },
    });
  }

  /** Unsettled accruals for the merchant dashboard ("next payout"). */
  async pending(tenantId: string) {
    const agg = await this.prisma.settlementLine.aggregate({
      where: { tenantId, settlementId: null },
      _sum: { netAmount: true, commission: true, taxableValue: true },
      _count: { _all: true },
    });
    return {
      orders: agg._count._all,
      grossSales: agg._sum.taxableValue ?? 0,
      commission: agg._sum.commission ?? 0,
      estimatedPayout: agg._sum.netAmount ?? 0,
    };
  }
}

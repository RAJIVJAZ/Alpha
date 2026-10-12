import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import {
  EventEnvelope,
  EventTypes,
  PaymentEvent,
  PurchaseOrderEvent,
  TenantStatusChangedEvent,
} from '@foodgrid/types';
import { AppError } from '@foodgrid/utils';
import { OnDomainEvent, OutboxService, REDIS } from '@foodgrid/utils/server';
import { TenantDirectory } from '../common/tenant-directory.service';
import { B2bOrdersService } from '../orders/b2b-orders.service';

/**
 * - procurement.po.approved  → becomes a B2B sales order for the supplier
 *   (supplier then confirms / rejects in the supplier dashboard).
 * - procurement.po.cancelled → cancels the linked sales order if not shipped.
 * - payment.captured (B2B order) → marks it paid and frees the dealer's credit.
 */
/** A PO cancelled before its approval became an order; kept well past the event retries. */
const cancelledPo = (purchaseOrderId: string) => `po-cancelled:${purchaseOrderId}`;
const CANCELLED_TTL_SECONDS = 7 * 86_400;

@Injectable()
export class SupplierEventHandlers {
  private readonly logger = new Logger(SupplierEventHandlers.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: B2bOrdersService,
    private readonly outbox: OutboxService,
    private readonly tenants: TenantDirectory,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @OnDomainEvent(EventTypes.PurchaseOrderApproved)
  async onPoApproved(env: EventEnvelope<string, PurchaseOrderEvent>) {
    const po = env.data;
    if (
      await this.prisma.b2bOrder.findUnique({
        where: { sourcePurchaseOrderId: po.purchaseOrderId },
      })
    )
      return;
    // cancelled while this approval waited for a retry: the supplier must never see it
    if (await this.redis.exists(cancelledPo(po.purchaseOrderId))) return;
    const lines = po.items.filter((i) => i.productId);
    const address = po.deliveryAddress;
    try {
      await this.orders.place({
        buyerTenantId: po.tenantId,
        buyerName: po.buyerName,
        sellerTenantId: po.supplierTenantId,
        sourcePurchaseOrderId: po.purchaseOrderId,
        items: lines.map((l) => ({ productId: l.productId!, quantity: Number(l.quantity) })),
        deliveryAddress: {
          line1: address?.line1 ?? 'Outlet address on file',
          city: address?.city ?? '',
          state: address?.state ?? '',
          pincode: address?.pincode ?? '000000',
          lat: address?.lat,
          lng: address?.lng,
          contactName: address?.contactName,
          contactPhone: address?.contactPhone,
        },
        paymentTerms: (po.paymentTerms as 'PREPAID') ?? 'PREPAID',
        notes: po.notes ?? `PO ${po.poNumber}`,
      });
      // the cancellation may have landed while the order was being placed
      if (await this.redis.exists(cancelledPo(po.purchaseOrderId)))
        await this.cancelForPo(po.purchaseOrderId);
    } catch (err) {
      // Business rule failures (MOQ, stock, serviceability) are reported back to procurement
      // as a supplier rejection instead of retrying forever; an outage (5xx, a service
      // unreachable) is retried, since the supplier never saw the order.
      if (!(err instanceof AppError) || err.status >= 500) throw err;
      this.logger.warn(`PO ${po.poNumber} could not become a sales order: ${err.message}`);
      await this.prisma.$transaction((tx) =>
        this.outbox.enqueue(tx, {
          stream: 'marketplace',
          type: EventTypes.B2bOrderRejected,
          aggregateType: 'PurchaseOrder',
          aggregateId: po.purchaseOrderId,
          tenantId: po.supplierTenantId,
          data: {
            b2bOrderId: '',
            orderNumber: '',
            buyerTenantId: po.tenantId,
            sellerTenantId: po.supplierTenantId,
            sourcePurchaseOrderId: po.purchaseOrderId,
            status: 'REJECTED',
            total: po.total,
            note: err.message,
          },
        }),
      );
    }
  }

  @OnDomainEvent(EventTypes.PurchaseOrderCancelled)
  async onPoCancelled(env: EventEnvelope<string, PurchaseOrderEvent>) {
    // recorded first, so an approval still being retried (or placing right now) sees it
    await this.redis.set(cancelledPo(env.data.purchaseOrderId), '1', 'EX', CANCELLED_TTL_SECONDS);
    await this.cancelForPo(env.data.purchaseOrderId);
  }

  private async cancelForPo(purchaseOrderId: string) {
    const order = await this.prisma.b2bOrder.findUnique({
      where: { sourcePurchaseOrderId: purchaseOrderId },
    });
    if (!order || !['PLACED', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'PACKED'].includes(order.status))
      return;
    await this.orders.cancel(order.id, { reason: 'Purchase order cancelled by buyer' });
  }

  @OnDomainEvent(EventTypes.PaymentCaptured)
  async onPaymentCaptured(env: EventEnvelope<string, PaymentEvent>) {
    if (env.data.purpose === 'B2B_ORDER') await this.orders.markPaid(env.data.referenceId);
  }

  @OnDomainEvent(EventTypes.TenantStatusChanged)
  async onTenantStatus(env: EventEnvelope<string, TenantStatusChangedEvent>) {
    await this.tenants.invalidate(env.data.tenantId);
    if (env.data.status === 'SUSPENDED') {
      const res = await this.prisma.product.updateMany({
        where: { tenantId: env.data.tenantId, isActive: true },
        data: { isActive: false },
      });
      if (res.count)
        this.logger.log(`Delisted ${res.count} products of suspended seller ${env.data.tenantId}`);
    }
  }
}

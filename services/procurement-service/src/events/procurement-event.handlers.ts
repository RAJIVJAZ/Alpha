import { Injectable, Logger } from '@nestjs/common';
import type { PurchaseOrderStatus } from '@foodgrid/database';
import { B2bOrderEvent, EventEnvelope, EventTypes, StockLowEvent } from '@foodgrid/types';
import { OnDomainEvent } from '@foodgrid/utils/server';
import { AlertsService } from '../alerts/alerts.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { SettingsService } from '../settings/settings.service';

const STATUS_MAP: Record<string, PurchaseOrderStatus> = {
  [EventTypes.B2bOrderPlaced]: 'SENT_TO_SUPPLIER',
  [EventTypes.B2bOrderRejected]: 'SUPPLIER_REJECTED',
  [EventTypes.B2bOrderDispatched]: 'DISPATCHED',
  [EventTypes.B2bOrderInTransit]: 'IN_TRANSIT',
  [EventTypes.B2bOrderDelivered]: 'DELIVERED',
};

/**
 * - inventory.stock.low → re-assess the ingredient; auto-PO for urgent alerts.
 * - marketplace.order.* → supplier confirmation workflow & delivery tracking.
 */
@Injectable()
export class ProcurementEventHandlers {
  private readonly logger = new Logger(ProcurementEventHandlers.name);

  constructor(
    private readonly alerts: AlertsService,
    private readonly pos: PurchaseOrdersService,
    private readonly settings: SettingsService,
  ) {}

  @OnDomainEvent(EventTypes.StockLow)
  async onStockLow(env: EventEnvelope<string, StockLowEvent>) {
    const s = env.data;
    await this.alerts.scan(s.tenantId, s.outletId, s.ingredientId);
    const settings = await this.settings.get(s.tenantId);
    if (!settings.autoPoEnabled) return;
    const open = await this.alerts.list(s.tenantId, { status: 'OPEN', outletId: s.outletId });
    const urgent = open.filter((a) => a.ingredientId === s.ingredientId && (a.severity === 'CRITICAL' || a.severity === 'HIGH'));
    if (urgent.length) {
      const res = await this.pos.autoCreate(s.tenantId, null, { alertIds: urgent.map((a) => a.id) });
      this.logger.log(`Auto-PO for ${s.ingredientName}: ${res.created.length} PO(s), ${res.skipped.length} skipped`);
    }
  }

  @OnDomainEvent(
    EventTypes.B2bOrderPlaced,
    EventTypes.B2bOrderConfirmed,
    EventTypes.B2bOrderRejected,
    EventTypes.B2bOrderDispatched,
    EventTypes.B2bOrderInTransit,
    EventTypes.B2bOrderDelivered,
  )
  async onSupplierUpdate(env: EventEnvelope<string, B2bOrderEvent>) {
    const e = env.data;
    if (!e.sourcePurchaseOrderId) return;
    const status: PurchaseOrderStatus =
      env.type === EventTypes.B2bOrderConfirmed ? (e.status === 'PARTIALLY_CONFIRMED' ? 'PARTIALLY_CONFIRMED' : 'CONFIRMED') : STATUS_MAP[env.type]!;
    await this.pos.applySupplierUpdate(e.sourcePurchaseOrderId, {
      status,
      note: e.note ?? null,
      supplierOrderId: e.b2bOrderId || undefined,
      confirmedLines: e.confirmedLines,
      tracking: e.trackingInfo ?? null,
      expectedDeliveryAt: e.expectedDeliveryAt ?? null,
    });
  }
}

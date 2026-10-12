import { Injectable } from '@nestjs/common';
import {
  B2bOrderEvent,
  CommissionAccruedEvent,
  DeliveryEvent,
  EventEnvelope,
  EventTypes,
  OrderStatusChangedEvent,
  StockConsumedEvent,
  UserRegisteredEvent,
} from '@foodgrid/types';
import { dateOnly, istDate, round2 } from '@foodgrid/utils';
import { OnDomainEvent } from '@foodgrid/utils/server';
import type { Prisma } from '@foodgrid/database';
import { ProjectionsService } from '../projections/projections.service';
import { SERVICE_NAME } from '../service.config';

/** The consumer's own processed-event key for this handler (see EventConsumer.dispatch). */
const mark = (env: EventEnvelope, method: string) => ({
  consumer: `${SERVICE_NAME}:AnalyticsEventHandlers.${method}`,
  eventId: env.id,
  eventType: env.type,
});

@Injectable()
export class AnalyticsEventHandlers {
  constructor(private readonly projections: ProjectionsService) {}

  @OnDomainEvent(
    EventTypes.OrderPlaced,
    EventTypes.OrderAccepted,
    EventTypes.OrderReady,
    EventTypes.OrderPickedUp,
    EventTypes.OrderDelivered,
    EventTypes.OrderCompleted,
    EventTypes.OrderCancelled,
    EventTypes.OrderRejected,
  )
  async order(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    // ignore never-paid orders that were cancelled before placement
    if (env.data.status === 'CANCELLED' && !env.data.placedAt) return;
    await this.projections.upsertOrderFact(env.data);
  }

  @OnDomainEvent(EventTypes.CommissionAccrued)
  async commission(env: EventEnvelope<string, CommissionAccruedEvent>) {
    await this.projections.setCommission(env.data.orderId, env.data.commissionAmount);
  }

  @OnDomainEvent(EventTypes.StockConsumed)
  async foodCost(env: EventEnvelope<string, StockConsumedEvent>) {
    await this.projections.setFoodCost(env.data.orderId, Number(env.data.foodCost));
  }

  @OnDomainEvent(EventTypes.DeliveryDelivered)
  async delivered(env: EventEnvelope<string, DeliveryEvent>) {
    const d = env.data;
    if (!d.riderId) return;
    await this.projections.once(mark(env, 'delivered'), (tx) =>
      this.projections.riderDelivered(
        tx,
        d.riderId!,
        new Date(d.occurredAt),
        Number(d.riderEarning) + Number(d.tipAmount),
        d.distanceKm,
        d.deliveryMins ?? null,
      ),
    );
  }

  @OnDomainEvent(EventTypes.UserRegistered)
  async registered(env: EventEnvelope<string, UserRegisteredEvent>) {
    await this.projections.once(mark(env, 'registered'), (tx) =>
      this.projections.incrementPlatform(
        tx,
        dateOnly(istDate(new Date(env.occurredAt))),
        'newCustomers',
      ),
    );
  }

  /** B2B GMV is the confirmed total of orders not rejected or cancelled, on the day placed. */
  private async b2bGmv(
    tx: Prisma.TransactionClient,
    env: EventEnvelope<string, B2bOrderEvent>,
    delta: number,
  ) {
    if (!delta) return;
    const at = new Date(env.data.placedAt ?? env.occurredAt);
    await this.projections.supplierEvent(tx, env.data.sellerTenantId, at, { gmv: delta });
    await this.projections.incrementPlatform(tx, dateOnly(istDate(at)), 'b2bOrders', 0, delta);
  }

  @OnDomainEvent(EventTypes.B2bOrderConfirmed)
  async b2bConfirmed(env: EventEnvelope<string, B2bOrderEvent>) {
    // a partial confirmation re-bills the order for less
    if (env.data.previousTotal == null) return;
    const delta = round2(Number(env.data.total) - Number(env.data.previousTotal));
    await this.projections.once(mark(env, 'b2bConfirmed'), (tx) => this.b2bGmv(tx, env, delta));
  }

  @OnDomainEvent(EventTypes.B2bOrderPlaced)
  async b2bPlaced(env: EventEnvelope<string, B2bOrderEvent>) {
    const at = new Date(env.occurredAt);
    const total = Number(env.data.total);
    await this.projections.once(mark(env, 'b2bPlaced'), async (tx) => {
      await this.projections.supplierEvent(tx, env.data.sellerTenantId, at, {
        orders: 1,
        gmv: total,
      });
      await this.projections.incrementPlatform(tx, dateOnly(istDate(at)), 'b2bOrders', 1, total);
    });
  }

  @OnDomainEvent(EventTypes.B2bOrderDelivered)
  async b2bDelivered(env: EventEnvelope<string, B2bOrderEvent>) {
    await this.projections.once(mark(env, 'b2bDelivered'), (tx) =>
      this.projections.supplierEvent(tx, env.data.sellerTenantId, new Date(env.occurredAt), {
        delivered: 1,
        onTime: env.data.onTime ? 1 : 0,
      }),
    );
  }

  @OnDomainEvent(EventTypes.B2bOrderRejected)
  async b2bRejected(env: EventEnvelope<string, B2bOrderEvent>) {
    if (!env.data.b2bOrderId) return;
    await this.projections.once(mark(env, 'b2bRejected'), async (tx) => {
      await this.projections.supplierEvent(tx, env.data.sellerTenantId, new Date(env.occurredAt), {
        rejected: 1,
      });
      // rejected or cancelled: nothing was sold (the total is the latest, re-billed one)
      await this.b2bGmv(tx, env, -Number(env.data.total));
    });
  }
}

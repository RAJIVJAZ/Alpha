import { Injectable } from '@nestjs/common';
import {
  B2bOrderEvent,
  DeliveryEvent,
  EventEnvelope,
  EventTypes,
  OrderStatusChangedEvent,
  StockConsumedEvent,
  UserRegisteredEvent,
} from '@foodgrid/types';
import { dateOnly, istDate } from '@foodgrid/utils';
import { OnDomainEvent } from '@foodgrid/utils/server';
import { ProjectionsService } from '../projections/projections.service';

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

  @OnDomainEvent(EventTypes.StockConsumed)
  async foodCost(env: EventEnvelope<string, StockConsumedEvent>) {
    await this.projections.setFoodCost(env.data.orderId, Number(env.data.foodCost));
  }

  @OnDomainEvent(EventTypes.DeliveryDelivered)
  async delivered(env: EventEnvelope<string, DeliveryEvent>) {
    const d = env.data;
    if (!d.riderId) return;
    await this.projections.riderDelivered(
      d.riderId,
      new Date(d.occurredAt),
      Number(d.riderEarning) + Number(d.tipAmount),
      d.distanceKm,
      d.deliveryMins ?? null,
    );
  }

  @OnDomainEvent(EventTypes.UserRegistered)
  async registered(env: EventEnvelope<string, UserRegisteredEvent>) {
    await this.projections.incrementPlatform(
      dateOnly(istDate(new Date(env.occurredAt))),
      'newCustomers',
    );
  }

  @OnDomainEvent(EventTypes.B2bOrderPlaced)
  async b2bPlaced(env: EventEnvelope<string, B2bOrderEvent>) {
    const at = new Date(env.occurredAt);
    await this.projections.supplierEvent(env.data.sellerTenantId, at, {
      orders: 1,
      gmv: Number(env.data.total),
    });
    await this.projections.incrementPlatform(
      dateOnly(istDate(at)),
      'b2bOrders',
      1,
      Number(env.data.total),
    );
  }

  @OnDomainEvent(EventTypes.B2bOrderDelivered)
  async b2bDelivered(env: EventEnvelope<string, B2bOrderEvent>) {
    await this.projections.supplierEvent(env.data.sellerTenantId, new Date(env.occurredAt), {
      delivered: 1,
      onTime: env.data.onTime ? 1 : 0,
    });
  }

  @OnDomainEvent(EventTypes.B2bOrderRejected)
  async b2bRejected(env: EventEnvelope<string, B2bOrderEvent>) {
    if (!env.data.b2bOrderId) return;
    await this.projections.supplierEvent(env.data.sellerTenantId, new Date(env.occurredAt), {
      rejected: 1,
    });
  }
}

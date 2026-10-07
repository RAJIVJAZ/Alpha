import { Injectable, Logger } from '@nestjs/common';
import {
  B2bOrderEvent,
  DeliveryEvent,
  EventEnvelope,
  EventTypes,
  IncentiveAchievedEvent,
  OrderStatusChangedEvent,
} from '@foodgrid/types';
import { OnDomainEvent } from '@foodgrid/utils/server';
import { PaymentsService } from '../payments/payments.service';
import { SettlementsService } from '../settlements/settlements.service';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';

@Injectable()
export class PaymentEventHandlers {
  private readonly logger = new Logger(PaymentEventHandlers.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly settlements: SettlementsService,
    private readonly ledger: WalletLedgerService,
  ) {}

  /** Cancelled / rejected orders are refunded to the original instrument. */
  @OnDomainEvent(EventTypes.OrderCancelled, EventTypes.OrderRejected)
  async refundOrder(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    const n = await this.payments.refundAllFor(
      'ORDER',
      env.data.orderId,
      env.data.reason ?? `Order ${env.data.status.toLowerCase()}`,
    );
    if (n) this.logger.log(`Refunded ${n} payment(s) for order ${env.data.orderNumber}`);
  }

  @OnDomainEvent(EventTypes.OrderDelivered, EventTypes.OrderCompleted)
  async accrue(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    await this.settlements.accrueOrder(env.data);
  }

  /** Rider earnings land in the rider wallet; COD cash collected is owed back. */
  @OnDomainEvent(EventTypes.DeliveryDelivered)
  async riderEarnings(env: EventEnvelope<string, DeliveryEvent>) {
    const d = env.data;
    if (!d.riderUserId) return;
    const base = {
      ownerType: 'RIDER' as const,
      ownerId: d.riderUserId,
      referenceType: 'DELIVERY',
      referenceId: d.deliveryId,
    };
    if (Number(d.riderEarning) > 0) {
      await this.ledger.credit({
        ...base,
        amount: Number(d.riderEarning),
        reason: 'DELIVERY_EARNING',
        idempotencyKey: `earning:${d.deliveryId}`,
        description: `Delivery ${d.orderNumber}`,
      });
    }
    if (Number(d.tipAmount) > 0) {
      await this.ledger.credit({
        ...base,
        amount: Number(d.tipAmount),
        reason: 'TIP',
        idempotencyKey: `tip:${d.deliveryId}`,
        description: `Tip for ${d.orderNumber}`,
      });
    }
    if (d.isCod && Number(d.codAmount) > 0) {
      await this.ledger.debit({
        ...base,
        amount: Number(d.codAmount),
        reason: 'COD_COLLECTION',
        idempotencyKey: `cod:${d.deliveryId}`,
        description: `Cash collected for ${d.orderNumber}`,
        allowNegative: true,
      });
    }
  }

  @OnDomainEvent(EventTypes.IncentiveAchieved)
  async incentive(env: EventEnvelope<string, IncentiveAchievedEvent>) {
    await this.ledger.credit({
      ownerType: 'RIDER',
      ownerId: env.data.userId,
      amount: Number(env.data.rewardAmount),
      reason: 'INCENTIVE',
      idempotencyKey: `incentive:${env.data.riderIncentiveId}`,
      referenceType: 'INCENTIVE',
      referenceId: env.data.riderIncentiveId,
      description: env.data.schemeName,
    });
  }

  @OnDomainEvent(EventTypes.B2bOrderDelivered)
  async b2bDelivered(env: EventEnvelope<string, B2bOrderEvent>) {
    await this.settlements.accrueB2bOrder(env.data);
  }

  @OnDomainEvent(EventTypes.B2bOrderRejected)
  async b2bRejected(env: EventEnvelope<string, B2bOrderEvent>) {
    await this.payments.refundAllFor(
      'B2B_ORDER',
      env.data.b2bOrderId,
      env.data.note ?? 'Supplier rejected the order',
    );
  }
}

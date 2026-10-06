import { Injectable } from '@nestjs/common';
import { ApprovalDecidedEvent, EventEnvelope, EventTypes, OrderStatusChangedEvent } from '@foodgrid/types';
import { OnDomainEvent } from '@foodgrid/utils/server';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ServingService } from '../serving/serving.service';

@Injectable()
export class AdsEventHandlers {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly serving: ServingService,
  ) {}

  @OnDomainEvent(EventTypes.ApprovalDecided)
  async onApproval(env: EventEnvelope<string, ApprovalDecidedEvent>) {
    if (env.data.entityType !== 'AD_CAMPAIGN' || env.data.decision === 'CHANGES_REQUESTED') return;
    await this.campaigns.decide(env.data.entityId, env.data.decision === 'APPROVED', env.data.reviewedBy, env.data.notes);
  }

  @OnDomainEvent(EventTypes.OrderPlaced)
  async onOrder(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    const o = env.data;
    if (!o.customerId) return;
    await this.serving.attributeConversion(o.customerId, o.outletId, o.orderId, Number(o.total));
  }
}

import { Injectable } from '@nestjs/common';
import type { PaymentPurpose } from '@foodgrid/types';
import { AppError, badRequest } from '@foodgrid/utils';
import { InternalHttpService, ServiceName } from '@foodgrid/utils/server';

export interface Payable {
  referenceId: string;
  amount: string;
  userId: string | null;
  tenantId: string | null;
  payable: boolean;
  description: string;
}

const SOURCES: Partial<Record<PaymentPurpose, { service: ServiceName; path: (id: string) => string }>> = {
  ORDER: { service: 'order', path: (id) => `internal/orders/${id}/payable` },
  MEMBERSHIP: { service: 'order', path: (id) => `internal/memberships/${id}/payable` },
  MEAL_SUBSCRIPTION: { service: 'order', path: (id) => `internal/meal-subscriptions/${id}/payable` },
  B2B_ORDER: { service: 'supplier', path: (id) => `internal/marketplace/orders/${id}/payable` },
  AD_CAMPAIGN: { service: 'ads', path: (id) => `internal/ads/campaigns/${id}/payable` },
};

/**
 * Amounts are never taken from the client: the owning service is asked what
 * is due for the referenced entity.
 */
@Injectable()
export class PayableResolver {
  constructor(private readonly internal: InternalHttpService) {}

  async resolve(purpose: PaymentPurpose, referenceId: string | undefined, payerId: string): Promise<Payable> {
    const source = SOURCES[purpose];
    if (!source) throw badRequest(`Unsupported purpose ${purpose}`, 'UNSUPPORTED_PURPOSE');
    if (!referenceId) throw badRequest('referenceId is required', 'REFERENCE_REQUIRED');
    const payable = await this.internal.get<Payable>(source.service, source.path(referenceId), { timeoutMs: 3000 });
    if (purpose !== 'B2B_ORDER' && purpose !== 'AD_CAMPAIGN' && payable.userId && payable.userId !== payerId) {
      throw new AppError('NOT_YOUR_PAYMENT', 'This payment belongs to another account', 403);
    }
    if (!payable.payable) throw new AppError('NOT_PAYABLE', 'Nothing is due for this item', 409);
    return payable;
  }
}

import { Injectable } from '@nestjs/common';
import type {
  Delivery,
  DeliveryPricingPolicy,
  DeliveryStatus,
  DeliveryWait,
  EarningType,
  Prisma,
} from '@foodgrid/database';
import { haversineKm, round2, sumMoney } from '@foodgrid/utils';
import type { LivePosition } from '../common/geo-store';
import { riderPayout, waitingPay } from '../domain/fees';
import { PricingService, toPricing } from './pricing.service';

type Tx = Prisma.TransactionClient;

/** A GPS fix older than this cannot confirm an arrival. */
const MAX_FIX_AGE_MS = 5 * 60_000;

export interface PayLine {
  type: EarningType;
  amount: number;
  description: string;
}

const rupees = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * Rider pay for one delivery, from the pricing version the delivery was created with:
 *
 * - delivered: the greater of the minimum payout and the per-km rate times the payable
 *   distance (two lines, DISTANCE_PAY and the BASE_PAY top-up), surge, and waiting pay;
 * - cancelled or failed after the rider reached the pickup (a GPS-verified arrival, or the
 *   food picked up): the cancellation pay and waiting pay;
 * - otherwise nothing.
 *
 * Tips are added by the caller. Every amount becomes a RiderEarning line, and the total is
 * stored as Delivery.riderEarning, which payment-service credits to the rider wallet.
 */
@Injectable()
export class RiderPayService {
  constructor(private readonly pricing: PricingService) {}

  async policyFor(d: Pick<Delivery, 'pricingPolicyId'>): Promise<DeliveryPricingPolicy> {
    return (
      (d.pricingPolicyId ? await this.pricing.byId(d.pricingPolicyId) : null) ??
      (await this.pricing.current())
    );
  }

  /**
   * Opens the wait at the pickup. The arrival counts for waiting pay when the rider's last
   * fix is recent and within the policy's radius; the status changes either way.
   */
  async openWait(tx: Tx, d: Delivery, riderId: string, at: Date, pos: LivePosition | null) {
    const policy = await this.policyFor(d);
    const fix = pos && at.getTime() - new Date(pos.at).getTime() <= MAX_FIX_AGE_MS ? pos : null;
    const distanceM = fix
      ? Math.round(haversineKm(fix, { lat: d.pickupLat, lng: d.pickupLng }) * 1000)
      : null;
    return tx.deliveryWait.create({
      data: {
        deliveryId: d.id,
        riderId,
        policyId: policy.id,
        arrivedAt: at,
        arrivalLat: fix?.lat ?? null,
        arrivalLng: fix?.lng ?? null,
        arrivalDistanceM: distanceM,
        verified: distanceM != null && distanceM <= policy.arrivalRadiusM,
        thresholdMins: policy.waitingThresholdMins,
      },
    });
  }

  /** Ends the wait (at pickup, or when the delivery ends at the pickup) and prices it, once. */
  async closeWait(
    tx: Tx,
    d: Delivery,
    endedBy: DeliveryStatus,
    at: Date,
  ): Promise<DeliveryWait | null> {
    const wait = await tx.deliveryWait.findUnique({ where: { deliveryId: d.id } });
    if (!wait || wait.endedAt) return wait;
    const policy = (await this.pricing.byId(wait.policyId)) ?? (await this.policyFor(d));
    const { waitedMins, amount } = waitingPay(toPricing(policy), {
      arrivedAt: wait.arrivedAt,
      endedAt: at,
      verified: wait.verified,
    });
    const closed = await tx.deliveryWait.updateMany({
      where: { id: wait.id, endedAt: null },
      data: {
        endedAt: at,
        endedBy,
        waitedMins,
        amount,
        orderReadyAt: d.orderReadyAt && d.orderReadyAt <= at ? d.orderReadyAt : null,
      },
    });
    return closed.count ? tx.deliveryWait.findUnique({ where: { id: wait.id } }) : wait;
  }

  /** Pay lines for a delivered order (tip excluded). */
  async delivered(tx: Tx, d: Delivery): Promise<PayLine[]> {
    const wait = await tx.deliveryWait.findUnique({ where: { deliveryId: d.id } });
    if (!d.pricingPolicyId) {
      // created before pricing versions: pay the amount the rider accepted
      return [
        {
          type: 'BASE_PAY',
          amount: Number(d.riderEarning),
          description: `Delivery ${d.orderNumber}`,
        },
        ...this.waitingLine(wait),
      ];
    }
    const rules = toPricing(await this.policyFor(d));
    const pay = riderPayout(rules, d.distanceKm, d.surgeMultiplier);
    return [
      {
        type: 'DISTANCE_PAY',
        amount: pay.distancePay,
        description: `${pay.payableKm.toFixed(1)} km × ${rupees(rules.riderPerKm)}`,
      },
      {
        type: 'BASE_PAY',
        amount: pay.minimumTopUp,
        description: `Top-up to the ${rupees(rules.riderMinPayout)} minimum`,
      },
      { type: 'SURGE', amount: pay.surgePay, description: `Surge ×${d.surgeMultiplier}` },
      ...this.waitingLine(wait),
    ];
  }

  /**
   * Pay lines for a delivery cancelled or failed before the handover: the cancellation pay
   * once the rider reached the pickup, and any waiting pay already earned there.
   */
  async endedEarly(tx: Tx, d: Delivery, wait: DeliveryWait | null): Promise<PayLine[]> {
    if (!d.riderId) return [];
    const reachedPickup = !!d.pickedUpAt || !!wait?.verified;
    const rules = toPricing(await this.policyFor(d));
    return [
      ...(reachedPickup
        ? [
            {
              type: 'BASE_PAY' as const,
              amount: rules.cancellationPay,
              description: `Cancellation pay for ${d.orderNumber}`,
            },
          ]
        : []),
      ...this.waitingLine(wait),
    ];
  }

  /** Writes the non-zero lines (plus the tip) as earnings and returns their total. */
  async record(tx: Tx, d: Delivery, riderId: string, at: Date, lines: PayLine[], tip = 0) {
    const all = [...lines, { type: 'TIP' as const, amount: tip, description: 'Customer tip' }];
    for (const l of all.filter((x) => x.amount > 0))
      await tx.riderEarning.create({
        data: {
          riderId,
          deliveryId: d.id,
          type: l.type,
          amount: round2(l.amount),
          description: l.description,
          earnedAt: at,
        },
      });
    return total(lines);
  }

  private waitingLine(wait: DeliveryWait | null): PayLine[] {
    const amount = Number(wait?.amount ?? 0);
    return amount > 0
      ? [
          {
            type: 'WAITING_TIME',
            amount,
            description: `Waited ${wait!.waitedMins} min at pickup (over ${wait!.thresholdMins})`,
          },
        ]
      : [];
  }
}

/** Sum of pay lines (tip excluded), to the paisa. */
export function total(lines: PayLine[]): number {
  return sumMoney(lines.map((l) => l.amount));
}

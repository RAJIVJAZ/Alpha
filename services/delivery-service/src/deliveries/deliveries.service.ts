import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Delivery, DeliveryStatus, Prisma, RiderProfile } from '@foodgrid/database';
import { DeliveryEvent, EventTypes, IncentiveAchievedEvent } from '@foodgrid/types';
import { AppError, conflict, dateOnly, haversineKm, istDate, money, notFound, StateMachine } from '@foodgrid/utils';
import { businessCounter, InternalHttpService, OutboxService } from '@foodgrid/utils/server';
import { GeoStore } from '../common/geo-store';
import { toDeliveryEvent } from '../common/delivery-event';
import { deliveryContribution } from '../domain/incentives';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { CompleteDeliveryDto, FailDeliveryDto } from './dto/delivery.dto';

type Tx = Prisma.TransactionClient;

export const deliveryStateMachine = new StateMachine<DeliveryStatus>('Delivery', {
  UNASSIGNED: ['SEARCHING', 'ASSIGNED', 'CANCELLED'],
  SEARCHING: ['ASSIGNED', 'UNASSIGNED', 'CANCELLED'],
  ASSIGNED: ['AT_PICKUP', 'PICKED_UP', 'SEARCHING', 'CANCELLED'],
  AT_PICKUP: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['AT_DROP', 'DELIVERED', 'FAILED'],
  AT_DROP: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
});

const completed = businessCounter('deliveries_completed_total', 'Deliveries completed', ['outcome']);
/** Riders must be this close to the drop point to complete (GPS sanity check). */
const MAX_COMPLETION_DISTANCE_KM = 0.5;

/** Rider-side delivery flow: pickup → drop → proof of delivery. */
@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly gateway: TrackingGateway,
    private readonly geo: GeoStore,
    private readonly internal: InternalHttpService,
  ) {}

  private async ownDelivery(userId: string, id: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId } });
    if (!rider) throw notFound('Rider profile');
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery || delivery.riderId !== rider.id) throw notFound('Delivery', id);
    return { rider, delivery };
  }

  private async move(tx: Tx, delivery: Delivery, rider: RiderProfile, to: DeliveryStatus, data: Prisma.DeliveryUpdateInput, eventType?: string) {
    deliveryStateMachine.assert(delivery.status, to);
    const updated = await tx.delivery.update({ where: { id: delivery.id }, data: { ...data, status: to } });
    if (eventType) {
      await this.outbox.enqueue<DeliveryEvent>(tx, {
        stream: 'delivery',
        type: eventType,
        aggregateType: 'Delivery',
        aggregateId: delivery.id,
        tenantId: delivery.tenantId,
        data: toDeliveryEvent(updated, rider),
      });
    }
    this.gateway.toOrder(delivery.orderId, 'delivery:status', { status: to, at: new Date().toISOString() });
    return updated;
  }

  async get(userId: string, id: string) {
    const { delivery } = await this.ownDelivery(userId, id);
    return delivery;
  }

  async arrivedAtPickup(userId: string, id: string) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    return this.prisma.$transaction((tx) => this.move(tx, delivery, rider, 'AT_PICKUP', { arrivedPickupAt: new Date() }));
  }

  async pickedUp(userId: string, id: string) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    return this.prisma.$transaction((tx) => this.move(tx, delivery, rider, 'PICKED_UP', { pickedUpAt: new Date() }, EventTypes.DeliveryPickedUp));
  }

  async arrivedAtDrop(userId: string, id: string) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    return this.prisma.$transaction((tx) => this.move(tx, delivery, rider, 'AT_DROP', { arrivedDropAt: new Date() }));
  }

  /**
   * Proof of delivery: the customer's OTP, or a photo for contact-less drops.
   * Riders must be near the drop location. Earnings, attendance and
   * incentives are updated atomically and delivery.delivered is published.
   */
  async complete(userId: string, id: string, dto: CompleteDeliveryDto) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    if (delivery.deliveryOtp) {
      if (dto.otp) {
        if (dto.otp !== delivery.deliveryOtp) throw new AppError('OTP_MISMATCH', 'Incorrect delivery OTP', 400);
      } else if (!dto.proofPhotoUrl) {
        throw new AppError('PROOF_REQUIRED', 'Enter the customer OTP or upload a delivery photo', 400);
      }
    }
    if (delivery.isCod && !dto.codCollected) throw conflict('Collect the cash before completing a COD order', 'COD_NOT_COLLECTED');
    const pos = await this.geo.last(rider.id);
    if (pos && haversineKm(pos, { lat: delivery.dropLat, lng: delivery.dropLng }) > MAX_COMPLETION_DISTANCE_KM) {
      throw new AppError('TOO_FAR_FROM_DROP', 'You seem to be away from the drop location', 409);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await this.move(
        tx,
        delivery,
        rider,
        'DELIVERED',
        { deliveredAt: now, proofPhotoUrl: dto.proofPhotoUrl, proofSignatureUrl: dto.proofSignatureUrl, proofNote: dto.note },
        EventTypes.DeliveryDelivered,
      );
      await this.recordEarnings(tx, d, rider.id, now);
      const remaining = await tx.delivery.count({ where: { riderId: rider.id, status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'] } } });
      await tx.riderProfile.update({ where: { id: rider.id }, data: { totalDeliveries: { increment: 1 }, isOnDelivery: remaining > 0 } });
      await tx.riderAttendance.upsert({
        where: { riderId_date: { riderId: rider.id, date: dateOnly(istDate(now)) } },
        create: { riderId: rider.id, date: dateOnly(istDate(now)), deliveryCount: 1, distanceKm: d.distanceKm },
        update: { deliveryCount: { increment: 1 }, distanceKm: { increment: d.distanceKm } },
      });
      await this.progressIncentives(tx, rider, now);
      return d;
    });
    completed.inc({ outcome: 'delivered' });
    this.checkTrajectory(rider.id, updated).catch(() => undefined);
    return updated;
  }

  async fail(userId: string, id: string, dto: FailDeliveryDto) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await this.move(tx, delivery, rider, 'FAILED', { failureReason: dto.reason, proofPhotoUrl: dto.proofPhotoUrl }, EventTypes.DeliveryFailed);
      await tx.riderProfile.update({ where: { id: rider.id }, data: { isOnDelivery: false } });
      return d;
    });
    completed.inc({ outcome: 'failed' });
    return updated;
  }

  private async recordEarnings(tx: Tx, d: Delivery, riderId: string, at: Date) {
    const lines: { type: 'BASE_PAY' | 'DISTANCE_PAY' | 'SURGE' | 'TIP'; amount: number; description: string }[] = [];
    const total = Number(d.riderEarning);
    const surgeShare = d.surgeMultiplier > 1 ? total - total / d.surgeMultiplier : 0;
    lines.push({ type: 'BASE_PAY', amount: total - surgeShare, description: `Delivery ${d.orderNumber} (${d.distanceKm.toFixed(1)} km)` });
    if (surgeShare > 0) lines.push({ type: 'SURGE', amount: surgeShare, description: `Surge ×${d.surgeMultiplier}` });
    if (Number(d.tipAmount) > 0) lines.push({ type: 'TIP', amount: Number(d.tipAmount), description: 'Customer tip' });
    for (const l of lines) {
      await tx.riderEarning.create({ data: { riderId, deliveryId: d.id, type: l.type, amount: Math.round(l.amount * 100) / 100, description: l.description, earnedAt: at } });
    }
  }

  private async progressIncentives(tx: Tx, rider: RiderProfile, at: Date) {
    const schemes = await tx.incentiveScheme.findMany({
      where: { isActive: true, startsAt: { lte: at }, endsAt: { gte: at }, OR: [{ zoneId: null }, { zoneId: rider.zoneId }], AND: [{ OR: [{ city: null }, { city: rider.city }] }] },
    });
    for (const s of schemes) {
      const inc = deliveryContribution(
        { type: s.type, target: s.target, peakWindows: s.peakWindows as { start: string; end: string }[] | null, minRating: s.minRating, startsAt: s.startsAt, endsAt: s.endsAt },
        at,
        rider.rating,
      );
      if (!inc) continue;
      const progress = await tx.riderIncentive.upsert({
        where: { riderId_schemeId: { riderId: rider.id, schemeId: s.id } },
        create: { riderId: rider.id, schemeId: s.id, progress: inc, target: s.target, rewardAmount: s.rewardAmount },
        update: { progress: { increment: inc } },
      });
      if (progress.status === 'IN_PROGRESS' && progress.progress >= progress.target) {
        await tx.riderIncentive.update({ where: { id: progress.id }, data: { status: 'ACHIEVED', achievedAt: at } });
        await tx.riderEarning.create({ data: { riderId: rider.id, type: 'INCENTIVE', amount: s.rewardAmount, description: s.name, earnedAt: at } });
        await this.outbox.enqueue<IncentiveAchievedEvent>(tx, {
          stream: 'delivery',
          type: EventTypes.IncentiveAchieved,
          aggregateType: 'RiderIncentive',
          aggregateId: progress.id,
          data: { riderIncentiveId: progress.id, riderId: rider.id, userId: rider.userId, schemeName: s.name, rewardAmount: money(s.rewardAmount.toString()) },
        });
      }
    }
  }

  /** Post-delivery GPS trail audit (fraud detection, fire-and-forget). */
  private async checkTrajectory(riderId: string, d: Delivery) {
    const pings = await this.prisma.riderLocationPing.findMany({ where: { deliveryId: d.id }, orderBy: { recordedAt: 'asc' }, take: 2000 });
    await this.internal.post('ai', 'internal/ai/fraud/rider-trajectory', {
      riderId,
      deliveryId: d.id,
      pings: pings.map((p) => ({ lat: p.lat, lng: p.lng, at: p.recordedAt.toISOString() })),
      drop: { lat: d.dropLat, lng: d.dropLng },
    });
  }

  /** Optimised route for the rider's open deliveries (batching aware). */
  async route(userId: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId } });
    if (!rider) throw notFound('Rider profile');
    const open = await this.prisma.delivery.findMany({ where: { riderId: rider.id, status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'] } } });
    if (!open.length) return { stops: [], totalKm: 0, totalMins: 0, navigationUrl: '' };
    const pos = (await this.geo.last(rider.id)) ?? { lat: rider.currentLat ?? open[0]!.pickupLat, lng: rider.currentLng ?? open[0]!.pickupLng };
    const stops = open.flatMap((d) => [
      ...(['ASSIGNED', 'AT_PICKUP'].includes(d.status) ? [{ id: `${d.id}:pickup`, type: 'PICKUP', orderId: d.orderId, lat: d.pickupLat, lng: d.pickupLng, label: d.pickupName }] : []),
      { id: `${d.id}:drop`, type: 'DROP', orderId: d.orderId, lat: d.dropLat, lng: d.dropLng, label: d.dropAddress },
    ]);
    return this.internal.post('ai', 'internal/ai/routes/optimize', { start: { lat: pos.lat, lng: pos.lng }, stops }, { timeoutMs: 2000 });
  }
}

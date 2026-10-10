import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import type { Delivery, DeliveryStatus, Prisma, RiderProfile } from '@foodgrid/database';
import { DeliveryEvent, EventTypes } from '@foodgrid/types';
import {
  AppError,
  badRequest,
  conflict,
  dateOnly,
  haversineKm,
  istDate,
  notFound,
  StateMachine,
} from '@foodgrid/utils';
import { businessCounter, InternalHttpService, OutboxService, REDIS } from '@foodgrid/utils/server';
import { GeoStore } from '../common/geo-store';
import { toDeliveryEvent } from '../common/delivery-event';
import { isOwnUpload } from '../common/own-upload';
import { DEFAULT_TARIFF, splitEarning } from '../domain/fees';
import { IncentivesService } from '../incentives/incentives.service';
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

const completed = businessCounter('deliveries_completed_total', 'Deliveries completed', [
  'outcome',
]);
/** Riders must be this close to the drop point to complete (GPS sanity check). */
const MAX_COMPLETION_DISTANCE_KM = 0.5;
/** A position older than this cannot vouch for where the rider is now. */
const MAX_POSITION_AGE_MS = 5 * 60_000;
/** Code tries per delivery per 15 minutes, so the 4 digits cannot be guessed at the door. */
const MAX_OTP_ATTEMPTS = 5;
const otpAttemptsKey = (deliveryId: string) => `delivery:otp-attempts:${deliveryId}`;

function assertOwnProof(url: string | undefined, userId: string) {
  if (url && !isOwnUpload(url, userId, 'delivery-proof'))
    throw badRequest(
      'Take the proof photo in the rider app so it is uploaded to FoodGrid',
      'INVALID_PROOF_PHOTO',
    );
}

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
    private readonly incentives: IncentivesService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private async ownDelivery(userId: string, id: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId } });
    if (!rider) throw notFound('Rider profile');
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery || delivery.riderId !== rider.id) throw notFound('Delivery', id);
    return { rider, delivery };
  }

  private async move(
    tx: Tx,
    delivery: Delivery,
    rider: RiderProfile,
    to: DeliveryStatus,
    data: Prisma.DeliveryUpdateManyMutationInput,
    eventType?: string,
  ) {
    deliveryStateMachine.assert(delivery.status, to);
    // only from the status read: a repeated or parallel request must not apply (and pay) a step twice
    const { count } = await tx.delivery.updateMany({
      where: { id: delivery.id, status: delivery.status },
      data: { ...data, status: to },
    });
    if (!count)
      throw conflict('This delivery was just updated. Refresh and try again', 'DELIVERY_CHANGED');
    const updated = await tx.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
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
    this.gateway.toOrder(delivery.orderId, 'delivery:status', {
      status: to,
      at: new Date().toISOString(),
    });
    return updated;
  }

  async get(userId: string, id: string) {
    const { delivery } = await this.ownDelivery(userId, id);
    return delivery;
  }

  async arrivedAtPickup(userId: string, id: string) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    return this.prisma.$transaction((tx) =>
      this.move(tx, delivery, rider, 'AT_PICKUP', { arrivedPickupAt: new Date() }),
    );
  }

  async pickedUp(userId: string, id: string) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    return this.prisma.$transaction((tx) =>
      this.move(
        tx,
        delivery,
        rider,
        'PICKED_UP',
        { pickedUpAt: new Date() },
        EventTypes.DeliveryPickedUp,
      ),
    );
  }

  async arrivedAtDrop(userId: string, id: string) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    return this.prisma.$transaction((tx) =>
      this.move(tx, delivery, rider, 'AT_DROP', { arrivedDropAt: new Date() }),
    );
  }

  /**
   * Proof of delivery: the customer's OTP, always (a photo only adds evidence).
   * Riders must be near the drop location. Earnings, attendance and
   * incentives are updated atomically and delivery.delivered is published.
   */
  async complete(userId: string, id: string, dto: CompleteDeliveryDto) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    // every delivery order gets a code at checkout; one without it cannot be proven delivered
    if (!delivery.deliveryOtp)
      throw conflict(
        'This order has no delivery code. Call support to close it',
        'OTP_UNAVAILABLE',
      );
    if (!dto.otp)
      throw badRequest("Enter the 4-digit delivery code from the customer's app", 'OTP_REQUIRED');
    // counted before checking, so parallel guesses cannot get past the limit
    const attempts = await this.redis.incr(otpAttemptsKey(delivery.id));
    if (attempts === 1) await this.redis.expire(otpAttemptsKey(delivery.id), 15 * 60);
    if (attempts > MAX_OTP_ATTEMPTS)
      throw new AppError(
        'OTP_LOCKED',
        'Too many wrong codes. Try again in 15 minutes or call support',
        429,
      );
    if (dto.otp !== delivery.deliveryOtp)
      throw badRequest(
        "That code doesn't match. Ask the customer for the code shown in their app",
        'OTP_MISMATCH',
      );
    // the right code: retries after a location or cash error must not use up tries
    await this.redis.del(otpAttemptsKey(delivery.id));
    assertOwnProof(dto.proofPhotoUrl, userId);
    assertOwnProof(dto.proofSignatureUrl, userId);
    if (delivery.isCod && !dto.codCollected)
      throw conflict('Collect the cash before completing a COD order', 'COD_NOT_COLLECTED');
    // fail closed: without a recent fix there is nothing to check the drop against
    const pos = await this.geo.last(rider.id);
    if (!pos || Date.now() - new Date(pos.at).getTime() > MAX_POSITION_AGE_MS) {
      throw new AppError(
        'LOCATION_REQUIRED',
        'Turn on location so we can confirm you are at the drop point',
        409,
      );
    }
    if (
      haversineKm(pos, { lat: delivery.dropLat, lng: delivery.dropLng }) >
      MAX_COMPLETION_DISTANCE_KM
    ) {
      throw new AppError('TOO_FAR_FROM_DROP', 'You seem to be away from the drop location', 409);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await this.move(
        tx,
        delivery,
        rider,
        'DELIVERED',
        {
          deliveredAt: now,
          proofPhotoUrl: dto.proofPhotoUrl,
          proofSignatureUrl: dto.proofSignatureUrl,
          proofNote: dto.note,
        },
        EventTypes.DeliveryDelivered,
      );
      await this.recordEarnings(tx, d, rider.id, now);
      const remaining = await tx.delivery.count({
        where: {
          riderId: rider.id,
          status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'] },
        },
      });
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { totalDeliveries: { increment: 1 }, isOnDelivery: remaining > 0 },
      });
      await tx.riderAttendance.upsert({
        where: { riderId_date: { riderId: rider.id, date: dateOnly(istDate(now)) } },
        create: {
          riderId: rider.id,
          date: dateOnly(istDate(now)),
          deliveryCount: 1,
          distanceKm: d.distanceKm,
        },
        update: { deliveryCount: { increment: 1 }, distanceKm: { increment: d.distanceKm } },
      });
      await this.incentives.afterDelivery(tx, rider, now);
      return d;
    });
    completed.inc({ outcome: 'delivered' });
    this.checkTrajectory(rider.id, updated).catch(() => undefined);
    return updated;
  }

  async fail(userId: string, id: string, dto: FailDeliveryDto) {
    const { rider, delivery } = await this.ownDelivery(userId, id);
    assertOwnProof(dto.proofPhotoUrl, userId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await this.move(
        tx,
        delivery,
        rider,
        'FAILED',
        { failureReason: dto.reason, proofPhotoUrl: dto.proofPhotoUrl },
        EventTypes.DeliveryFailed,
      );
      await tx.riderProfile.update({ where: { id: rider.id }, data: { isOnDelivery: false } });
      return d;
    });
    completed.inc({ outcome: 'failed' });
    return updated;
  }

  /** Earnings statement lines: the quoted pay split into base, distance and surge, plus the tip. */
  private async recordEarnings(tx: Tx, d: Delivery, riderId: string, at: Date) {
    const zone = d.zoneId
      ? await tx.deliveryZone.findUnique({
          where: { id: d.zoneId },
          select: { riderBasePay: true },
        })
      : null;
    const pay = splitEarning(
      Number(d.riderEarning),
      d.surgeMultiplier,
      zone ? Number(zone.riderBasePay) : DEFAULT_TARIFF.riderBasePay,
    );
    const lines = [
      { type: 'BASE_PAY' as const, amount: pay.basePay, description: `Delivery ${d.orderNumber}` },
      {
        type: 'DISTANCE_PAY' as const,
        amount: pay.distancePay,
        description: `${d.distanceKm.toFixed(1)} km`,
      },
      { type: 'SURGE' as const, amount: pay.surgePay, description: `Surge ×${d.surgeMultiplier}` },
      { type: 'TIP' as const, amount: Number(d.tipAmount), description: 'Customer tip' },
    ];
    for (const l of lines.filter((x) => x.amount > 0)) {
      await tx.riderEarning.create({
        data: {
          riderId,
          deliveryId: d.id,
          type: l.type,
          amount: l.amount,
          description: l.description,
          earnedAt: at,
        },
      });
    }
  }

  /** Post-delivery GPS trail audit (fraud detection, fire-and-forget). */
  private async checkTrajectory(riderId: string, d: Delivery) {
    const pings = await this.prisma.riderLocationPing.findMany({
      where: { deliveryId: d.id },
      orderBy: { recordedAt: 'asc' },
      take: 2000,
    });
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
    const open = await this.prisma.delivery.findMany({
      where: {
        riderId: rider.id,
        status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'] },
      },
    });
    if (!open.length) return { stops: [], totalKm: 0, totalMins: 0, navigationUrl: '' };
    const pos = (await this.geo.last(rider.id)) ?? {
      lat: rider.currentLat ?? open[0]!.pickupLat,
      lng: rider.currentLng ?? open[0]!.pickupLng,
    };
    const stops = open.flatMap((d) => [
      ...(['ASSIGNED', 'AT_PICKUP'].includes(d.status)
        ? [
            {
              id: `${d.id}:pickup`,
              type: 'PICKUP',
              orderId: d.orderId,
              lat: d.pickupLat,
              lng: d.pickupLng,
              label: d.pickupName,
            },
          ]
        : []),
      {
        id: `${d.id}:drop`,
        type: 'DROP',
        orderId: d.orderId,
        lat: d.dropLat,
        lng: d.dropLng,
        label: d.dropAddress,
      },
    ]);
    return this.internal.post(
      'ai',
      'internal/ai/routes/optimize',
      { start: { lat: pos.lat, lng: pos.lng }, stops },
      { timeoutMs: 2000 },
    );
  }
}

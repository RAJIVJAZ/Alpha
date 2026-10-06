import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Delivery } from '@foodgrid/database';
import { DeliveryEvent, EventTypes, OrderStatusChangedEvent } from '@foodgrid/types';
import { conflict, estimateRoadKm, notFound, round2 } from '@foodgrid/utils';
import { businessCounter, InternalHttpService, OutboxService } from '@foodgrid/utils/server';
import { GeoStore } from '../common/geo-store';
import { toDeliveryEvent } from '../common/delivery-event';
import { rankCandidates, searchRadiusKm, updateAcceptanceRate } from '../domain/dispatch';
import { riderEarning } from '../domain/fees';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { ZonesService } from '../zones/zones.service';

const OFFER_TTL_SECONDS = 45;
const MAX_ATTEMPTS = 8;
const offersSent = businessCounter('delivery_offers_total', 'Delivery offers sent to riders', ['outcome']);

/**
 * Rider dispatch: creates the delivery when the restaurant accepts the order,
 * offers it to the best nearby rider (Redis GEO search + scoring), and keeps
 * re-offering with a widening radius until someone accepts.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoStore,
    private readonly zones: ZonesService,
    private readonly gateway: TrackingGateway,
    private readonly outbox: OutboxService,
    private readonly internal: InternalHttpService,
  ) {}

  async createFromOrder(o: OrderStatusChangedEvent): Promise<Delivery | null> {
    if (o.type !== 'DELIVERY' || !o.deliveryAddress) return null;
    const existing = await this.prisma.delivery.findUnique({ where: { orderId: o.orderId } });
    if (existing) return existing;
    const pickup = { lat: o.outletLat, lng: o.outletLng };
    const drop = { lat: o.deliveryAddress.lat, lng: o.deliveryAddress.lng };
    const zone = await this.zones.zoneFor(pickup);
    const distanceKm = o.distanceKm ?? round2(estimateRoadKm(pickup, drop));
    const surge = zone ? await this.zones.surge(zone) : 1;
    const earning = zone
      ? riderEarning({ baseFee: Number(zone.baseFee), perKmFee: Number(zone.perKmFee), freeKm: zone.freeKm, riderBasePay: Number(zone.riderBasePay), riderPerKm: Number(zone.riderPerKm) }, distanceKm, surge)
      : riderEarning({ baseFee: 25, perKmFee: 8, freeKm: 2, riderBasePay: 30, riderPerKm: 6 }, distanceKm, surge);
    const a = o.deliveryAddress;
    const delivery = await this.prisma.delivery.create({
      data: {
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        tenantId: o.tenantId,
        outletId: o.outletId,
        customerId: o.customerId,
        zoneId: zone?.id,
        pickupName: o.outletName,
        pickupAddress: o.outletAddress,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupPhone: o.outletPhone,
        dropName: a.contactName ?? o.customerName,
        dropAddress: [a.line1, a.line2, a.landmark, a.city, a.pincode].filter(Boolean).join(', '),
        dropLat: drop.lat,
        dropLng: drop.lng,
        dropPhone: a.contactPhone ?? o.customerPhone,
        distanceKm,
        estimatedMins: Math.round((distanceKm / 22) * 60) + 10,
        orderValue: Number(o.total),
        isCod: o.paymentMethod === 'COD',
        codAmount: o.paymentMethod === 'COD' ? Number(o.total) : 0,
        tipAmount: Number(o.tip),
        riderEarning: earning.total,
        surgeMultiplier: surge,
        deliveryOtp: o.deliveryOtp ?? null,
        readyAt: o.estimatedReadyAt ? new Date(o.estimatedReadyAt) : null,
        status: 'SEARCHING',
      },
    });
    await this.dispatch(delivery.id);
    return delivery;
  }

  /** Offers the delivery to the next best rider. Returns the offered rider id, if any. */
  async dispatch(deliveryId: string): Promise<string | null> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, include: { offers: true } });
    if (!delivery || !['UNASSIGNED', 'SEARCHING'].includes(delivery.status)) return null;
    if (delivery.offers.some((o) => o.status === 'PENDING' && o.expiresAt > new Date())) return null;
    if (delivery.searchAttempts >= MAX_ATTEMPTS) {
      if (delivery.status !== 'UNASSIGNED') {
        await this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'UNASSIGNED' } });
        this.gateway.toOps('delivery:unassigned', { deliveryId, orderNumber: delivery.orderNumber });
      }
      return null;
    }

    const radius = searchRadiusKm(Math.floor(delivery.searchAttempts / 2));
    const nearby = await this.geo.nearby(delivery.pickupLat, delivery.pickupLng, radius);
    const tried = new Set(delivery.offers.map((o) => o.riderId));
    const riders = nearby.length
      ? await this.prisma.riderProfile.findMany({
          where: {
            id: { in: nearby.map((n) => n.riderId) },
            status: 'ACTIVE',
            isOnline: true,
            lastLocationAt: { gte: new Date(Date.now() - 5 * 60_000) },
          },
          include: { deliveries: { where: { status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'] } }, select: { id: true } } },
        })
      : [];
    const lastDone = await this.prisma.delivery.groupBy({
      by: ['riderId'],
      where: { riderId: { in: riders.map((r) => r.id) }, status: 'DELIVERED' },
      _max: { deliveredAt: true },
    });
    const lastBy = new Map(lastDone.map((l) => [l.riderId, l._max.deliveredAt]));
    const distance = new Map(nearby.map((n) => [n.riderId, n.distanceKm]));
    const ranked = rankCandidates(
      riders.map((r) => ({
        riderId: r.id,
        distanceToPickupKm: distance.get(r.id) ?? radius,
        rating: r.rating,
        acceptanceRate: r.acceptanceRate,
        idleMinutes: lastBy.get(r.id) ? (Date.now() - lastBy.get(r.id)!.getTime()) / 60_000 : 60,
        activeDeliveries: r.deliveries.length,
      })),
      radius,
      tried,
    );

    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { searchAttempts: { increment: 1 }, status: 'SEARCHING' } });
    const best = ranked[0];
    if (!best) return null;
    const offer = await this.prisma.deliveryOffer.create({
      data: {
        deliveryId,
        riderId: best.riderId,
        score: best.score,
        distanceToPickupKm: round2(best.distanceToPickupKm),
        estimatedEarning: delivery.riderEarning,
        expiresAt: new Date(Date.now() + OFFER_TTL_SECONDS * 1000),
      },
    });
    offersSent.inc({ outcome: 'sent' });
    const payload = {
      offerId: offer.id,
      deliveryId,
      orderNumber: delivery.orderNumber,
      pickup: { name: delivery.pickupName, address: delivery.pickupAddress, lat: delivery.pickupLat, lng: delivery.pickupLng },
      drop: { address: delivery.dropAddress, lat: delivery.dropLat, lng: delivery.dropLng },
      distanceKm: delivery.distanceKm,
      distanceToPickupKm: offer.distanceToPickupKm,
      earning: delivery.riderEarning,
      isCod: delivery.isCod,
      expiresAt: offer.expiresAt,
    };
    this.gateway.toRider(best.riderId, 'offer:new', payload);
    const rider = riders.find((r) => r.id === best.riderId);
    if (rider) {
      this.internal
        .post('notification', 'internal/notifications/send', {
          userId: rider.userId,
          channel: 'PUSH',
          app: 'RIDER',
          templateKey: 'rider.offer',
          data: { orderNumber: delivery.orderNumber, earning: Number(delivery.riderEarning).toFixed(0), distance: delivery.distanceKm.toFixed(1), offerId: offer.id },
        })
        .catch(() => undefined);
    }
    return best.riderId;
  }

  async accept(riderUserId: string, offerId: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId: riderUserId } });
    if (!rider) throw notFound('Rider profile');
    const result = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.deliveryOffer.findUnique({ where: { id: offerId } });
      if (!offer || offer.riderId !== rider.id) throw notFound('Offer', offerId);
      if (offer.status !== 'PENDING' || offer.expiresAt < new Date()) throw conflict('This offer has expired', 'OFFER_EXPIRED');
      const assigned = await tx.delivery.updateMany({
        where: { id: offer.deliveryId, status: { in: ['UNASSIGNED', 'SEARCHING'] } },
        data: { status: 'ASSIGNED', riderId: rider.id, assignedAt: new Date() },
      });
      if (!assigned.count) throw conflict('Delivery already assigned', 'ALREADY_ASSIGNED');
      await tx.deliveryOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      await tx.deliveryOffer.updateMany({ where: { deliveryId: offer.deliveryId, status: 'PENDING', id: { not: offerId } }, data: { status: 'CANCELLED' } });
      await tx.riderProfile.update({ where: { id: rider.id }, data: { isOnDelivery: true, acceptanceRate: updateAcceptanceRate(rider.acceptanceRate, true) } });
      const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: offer.deliveryId } });
      await this.outbox.enqueue<DeliveryEvent>(tx, {
        stream: 'delivery',
        type: EventTypes.DeliveryAssigned,
        aggregateType: 'Delivery',
        aggregateId: delivery.id,
        tenantId: delivery.tenantId,
        data: toDeliveryEvent(delivery, rider),
      });
      return delivery;
    });
    offersSent.inc({ outcome: 'accepted' });
    this.gateway.toOrder(result.orderId, 'delivery:status', { status: 'ASSIGNED', rider: { name: rider.name, phone: rider.phone } });
    return result;
  }

  async reject(riderUserId: string, offerId: string, reason?: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId: riderUserId } });
    if (!rider) throw notFound('Rider profile');
    const offer = await this.prisma.deliveryOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.riderId !== rider.id) throw notFound('Offer', offerId);
    if (offer.status !== 'PENDING') throw conflict('Offer is no longer pending', 'OFFER_CLOSED');
    await this.prisma.$transaction([
      this.prisma.deliveryOffer.update({ where: { id: offerId }, data: { status: 'REJECTED', respondedAt: new Date(), rejectReason: reason } }),
      this.prisma.riderProfile.update({ where: { id: rider.id }, data: { acceptanceRate: updateAcceptanceRate(rider.acceptanceRate, false) } }),
    ]);
    offersSent.inc({ outcome: 'rejected' });
    await this.dispatch(offer.deliveryId);
    return { rejected: true };
  }

  /** Expires stale offers and re-dispatches searching deliveries (runs every 10s). */
  async sweep() {
    const now = new Date();
    const expired = await this.prisma.deliveryOffer.findMany({ where: { status: 'PENDING', expiresAt: { lt: now } }, select: { id: true, riderId: true, deliveryId: true } });
    if (expired.length) {
      await this.prisma.deliveryOffer.updateMany({ where: { id: { in: expired.map((e) => e.id) } }, data: { status: 'EXPIRED' } });
      for (const e of expired) {
        const r = await this.prisma.riderProfile.findUnique({ where: { id: e.riderId } });
        if (r) await this.prisma.riderProfile.update({ where: { id: r.id }, data: { acceptanceRate: updateAcceptanceRate(r.acceptanceRate, false, 0.05) } });
        offersSent.inc({ outcome: 'expired' });
      }
    }
    const searching = await this.prisma.delivery.findMany({ where: { status: { in: ['SEARCHING', 'UNASSIGNED'] }, searchAttempts: { lt: MAX_ATTEMPTS } }, select: { id: true }, take: 200 });
    for (const d of searching) await this.dispatch(d.id).catch((err: Error) => this.logger.warn(`dispatch ${d.id}: ${err.message}`));
    return { expired: expired.length, searching: searching.length };
  }

  /** Ops override: assign a delivery to a specific rider. */
  async reassign(deliveryId: string, riderId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw notFound('Delivery', deliveryId);
    if (['PICKED_UP', 'AT_DROP', 'DELIVERED'].includes(delivery.status)) throw conflict('Delivery already picked up', 'PICKED_UP');
    await this.prisma.$transaction(async (tx) => {
      if (delivery.riderId) await tx.riderProfile.update({ where: { id: delivery.riderId }, data: { isOnDelivery: false } });
      await tx.deliveryOffer.updateMany({ where: { deliveryId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      await tx.delivery.update({ where: { id: deliveryId }, data: { riderId: null, status: 'SEARCHING', searchAttempts: 0 } });
      await tx.deliveryOffer.create({
        data: { deliveryId, riderId, score: 1, distanceToPickupKm: 0, estimatedEarning: delivery.riderEarning, expiresAt: new Date(Date.now() + 120_000) },
      });
    });
    this.gateway.toRider(riderId, 'offer:new', { deliveryId, orderNumber: delivery.orderNumber, forced: true });
    return { reassigned: true };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import type { DeliveryZone, Prisma } from '@foodgrid/database';
import { estimateRoadKm, istParts, LatLng, pointInPolygon, round2, travelMinutes } from '@foodgrid/utils';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import { deliveryFee } from '../domain/fees';
import { DeliveryZoneDto, UpdateDeliveryZoneDto } from './dto/zone.dto';

const MAX_DELIVERY_KM = 15;
const surgeKey = (zoneId: string) => `surge:${zoneId}`;

/** Delivery zones, serviceability, fee quotes and live surge. */
/**
 * Minutes promised on top of preparation and riding time: accepting the order,
 * the rider's wait at pickup and the hand-over at the door. Customers judge
 * "on time" against this promise, so it has to be honest.
 */
export const HANDOVER_BUFFER_MINS = 12;

@Injectable()
export class ZonesService {
  private readonly logger = new Logger(ZonesService.name);
  private cache: { at: number; zones: DeliveryZone[] } = { at: 0, zones: [] };

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async active(): Promise<DeliveryZone[]> {
    if (Date.now() - this.cache.at > 60_000) {
      this.cache = { at: Date.now(), zones: await this.prisma.deliveryZone.findMany({ where: { isActive: true } }) };
    }
    return this.cache.zones;
  }

  async zoneFor(p: LatLng): Promise<DeliveryZone | null> {
    const zones = await this.active();
    return zones.find((z) => pointInPolygon(p, z.polygon as [number, number][])) ?? null;
  }

  async surge(zone: DeliveryZone): Promise<number> {
    const cached = await this.redis.get(surgeKey(zone.id));
    return cached ? Number(cached) : zone.surgeMultiplier;
  }

  /** Quote used by order-service at cart/checkout time. */
  async quote(pickup: LatLng, drop: LatLng, prepMins = 20) {
    const zone = await this.zoneFor(pickup);
    const distanceKm = round2(estimateRoadKm(pickup, drop));
    if (!zone) return { serviceable: false, reason: 'Pickup outside delivery zones', distanceKm, deliveryFee: 0, etaMins: 0, surgeMultiplier: 1, zoneId: null };
    const surge = await this.surge(zone);
    const tariff = { baseFee: Number(zone.baseFee), perKmFee: Number(zone.perKmFee), freeKm: zone.freeKm, riderBasePay: Number(zone.riderBasePay), riderPerKm: Number(zone.riderPerKm) };
    return {
      serviceable: distanceKm <= MAX_DELIVERY_KM,
      distanceKm,
      deliveryFee: deliveryFee(tariff, distanceKm, surge),
      etaMins: prepMins + travelMinutes(distanceKm) + HANDOVER_BUFFER_MINS,
      surgeMultiplier: surge,
      zoneId: zone.id,
    };
  }

  /** Recomputes surge per zone from live demand/supply (every minute). */
  async recomputeSurge() {
    const zones = await this.active();
    for (const z of zones) {
      const [pending, online] = await Promise.all([
        this.prisma.delivery.count({ where: { zoneId: z.id, status: { in: ['UNASSIGNED', 'SEARCHING'] } } }),
        this.prisma.riderProfile.count({ where: { zoneId: z.id, isOnline: true, isOnDelivery: false, status: 'ACTIVE' } }),
      ]);
      let multiplier = 1;
      try {
        const res = await this.internal.post<{ multiplier: number }>(
          'ai',
          'internal/ai/pricing/delivery-surge',
          { pendingOrders: pending, onlineRiders: online, hourOfDay: istParts().hour },
          { timeoutMs: 1000 },
        );
        multiplier = res.multiplier;
      } catch {
        multiplier = pending > online * 1.2 ? Math.min(2, 1 + 0.3 * (pending / Math.max(1, online) - 1.2)) : 1;
      }
      await this.redis.set(surgeKey(z.id), String(Math.max(z.surgeMultiplier, multiplier)), 'EX', 180);
    }
  }

  list() {
    return this.prisma.deliveryZone.findMany({ orderBy: [{ city: 'asc' }, { name: 'asc' }], include: { _count: { select: { riders: true } } } });
  }

  create(dto: DeliveryZoneDto) {
    this.cache.at = 0;
    return this.prisma.deliveryZone.create({ data: { ...dto, polygon: dto.polygon as unknown as Prisma.InputJsonValue } });
  }

  update(id: string, dto: UpdateDeliveryZoneDto) {
    this.cache.at = 0;
    return this.prisma.deliveryZone.update({ where: { id }, data: { ...dto, polygon: dto.polygon as unknown as Prisma.InputJsonValue | undefined } });
  }
}

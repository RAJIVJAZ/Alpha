import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma, RiderProfile, RiderStatus } from '@foodgrid/database';
import {
  conflict,
  dateOnly,
  enumLabel,
  forbidden,
  istDate,
  normalizePage,
  notFound,
  paginate,
} from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { GeoStore } from '../common/geo-store';
import { splitByIstDay } from '../domain/attendance';
import { IncentivesService } from '../incentives/incentives.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { ZonesService } from '../zones/zones.service';
import {
  AdminRiderStatusDto,
  ListRidersDto,
  LocationPingDto,
  RiderOnboardingDto,
} from './dto/rider.dto';

@Injectable()
export class RidersService {
  private readonly logger = new Logger(RidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoStore,
    private readonly zones: ZonesService,
    private readonly gateway: TrackingGateway,
    private readonly internal: InternalHttpService,
    private readonly incentives: IncentivesService,
  ) {}

  async byUser(userId: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId } });
    if (!rider) throw notFound('Rider profile');
    return rider;
  }

  async activeByUser(userId: string) {
    const rider = await this.byUser(userId);
    if (rider.status !== 'ACTIVE')
      throw forbidden('Your rider account is not active', 'RIDER_INACTIVE');
    return rider;
  }

  /** Rider sign-up; documents go to the admin approval queue. */
  async onboard(user: { sub: string; phone?: string }, dto: RiderOnboardingDto) {
    const existing = await this.prisma.riderProfile.findUnique({ where: { userId: user.sub } });
    if (existing && existing.status !== 'REJECTED')
      throw conflict('You have already applied', 'ALREADY_APPLIED');
    const data = {
      name: dto.name,
      phone: user.phone ?? '',
      city: dto.city,
      vehicleType: dto.vehicleType,
      vehicleNumber: dto.vehicleNumber,
      licenseNumber: dto.licenseNumber,
      aadhaarLast4: dto.aadhaarLast4,
      upiId: dto.upiId,
      documents: (dto.documents ?? []) as unknown as Prisma.InputJsonValue,
      status: 'PENDING_APPROVAL' as const,
    };
    const rider = existing
      ? await this.prisma.riderProfile.update({ where: { id: existing.id }, data })
      : await this.prisma.riderProfile.create({ data: { ...data, userId: user.sub } });
    await this.internal.post('user', 'internal/approvals', {
      entityType: 'RIDER',
      entityId: rider.id,
      title: `Rider onboarding: ${rider.name} (${rider.city}, ${enumLabel(rider.vehicleType)})`,
      submittedBy: user.sub,
      documents: dto.documents ?? [],
      metadata: { userId: user.sub, city: rider.city, vehicleNumber: rider.vehicleNumber },
    });
    return rider;
  }

  /** Check-in: rider goes online, attendance starts for the day. */
  async goOnline(userId: string, ping: LocationPingDto) {
    const rider = await this.activeByUser(userId);
    const zone = await this.zones.zoneFor(ping);
    const now = new Date();
    const date = dateOnly(istDate(now));
    await this.prisma.$transaction([
      this.prisma.riderProfile.update({
        where: { id: rider.id },
        data: {
          isOnline: true,
          currentLat: ping.lat,
          currentLng: ping.lng,
          lastLocationAt: now,
          zoneId: zone?.id ?? rider.zoneId,
        },
      }),
      this.prisma.riderAttendance.upsert({
        where: { riderId_date: { riderId: rider.id, date } },
        create: {
          riderId: rider.id,
          date,
          status: 'PRESENT',
          checkInAt: now,
          checkInLat: ping.lat,
          checkInLng: ping.lng,
        },
        update: { status: 'PRESENT', checkInAt: undefined, checkOutAt: null },
      }),
    ]);
    await this.geo.update(rider.id, { lat: ping.lat, lng: ping.lng, at: now.toISOString() });
    await this.geo.startSession(rider.id, now);
    return { online: true, zone: zone ? { id: zone.id, name: zone.name } : null };
  }

  async goOffline(userId: string) {
    const rider = await this.byUser(userId);
    if (rider.isOnDelivery)
      throw conflict('Finish your current delivery before going offline', 'ON_DELIVERY');
    return { online: false, sessionMinutes: await this.endShift(rider, new Date()) };
  }

  /**
   * Riders not on a delivery whose last position is older than `cutoff` (app
   * killed, no network) go offline; their shift ends at that last position.
   */
  async takeStaleOffline(cutoff: Date) {
    const stale = await this.prisma.riderProfile.findMany({
      where: { isOnline: true, isOnDelivery: false, lastLocationAt: { lt: cutoff } },
    });
    for (const rider of stale) {
      // claimed one by one: a rider who pinged or took an order since the query stays online
      const { count } = await this.prisma.riderProfile.updateMany({
        where: {
          id: rider.id,
          isOnline: true,
          isOnDelivery: false,
          lastLocationAt: { lt: cutoff },
        },
        data: { isOnline: false },
      });
      if (count) await this.endShift(rider, rider.lastLocationAt ?? cutoff);
    }
  }

  /**
   * Takes the rider offline and credits the online session to attendance, split
   * by IST day so shifts across midnight keep their minutes, then re-totals
   * LOGIN_HOURS incentives. Returns the minutes credited.
   */
  private async endShift(rider: RiderProfile, end: Date) {
    const started = await this.geo.endSession(rider.id);
    const days = started ? splitByIstDay(started, end) : [];
    await this.prisma.$transaction(async (tx) => {
      await tx.riderProfile.update({ where: { id: rider.id }, data: { isOnline: false } });
      for (const d of days) {
        const date = dateOnly(d.date);
        await tx.riderAttendance.upsert({
          where: { riderId_date: { riderId: rider.id, date } },
          create: { riderId: rider.id, date, status: 'PRESENT', onlineMinutes: d.minutes },
          update: { onlineMinutes: { increment: d.minutes } },
        });
      }
      if (!started) return; // was not online: nothing to check out
      await tx.riderAttendance.updateMany({
        where: { riderId: rider.id, date: dateOnly(istDate(end)) },
        data: { checkOutAt: end },
      });
      if (days.length) await this.incentives.afterOnlineSession(tx, rider, started, end);
    });
    await this.geo.remove(rider.id);
    return days.reduce((sum, d) => sum + d.minutes, 0);
  }

  /** High-frequency location updates from the rider app. */
  async ping(userId: string, dto: LocationPingDto) {
    const rider = await this.byUser(userId);
    if (!rider.isOnline) return { accepted: false, reason: 'OFFLINE' };
    const now = new Date();
    await this.geo.update(rider.id, {
      lat: dto.lat,
      lng: dto.lng,
      heading: dto.heading,
      speedKmph: dto.speedKmph,
      at: now.toISOString(),
    });
    const active = await this.prisma.delivery.findMany({
      where: {
        riderId: rider.id,
        status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'] },
      },
      select: { id: true, orderId: true },
    });
    for (const d of active) {
      this.gateway.toOrder(d.orderId, 'rider:location', {
        orderId: d.orderId,
        deliveryId: d.id,
        lat: dto.lat,
        lng: dto.lng,
        heading: dto.heading,
        at: now.toISOString(),
      });
    }
    this.gateway.toOps('rider:location', {
      riderId: rider.id,
      lat: dto.lat,
      lng: dto.lng,
      onDelivery: active.length > 0,
    });
    if (await this.geo.shouldPersist(rider.id)) {
      await this.prisma.$transaction([
        this.prisma.riderLocationPing.create({
          data: {
            riderId: rider.id,
            deliveryId: active[0]?.id,
            lat: dto.lat,
            lng: dto.lng,
            accuracyM: dto.accuracyM,
            speedKmph: dto.speedKmph,
            heading: dto.heading,
            batteryPct: dto.batteryPct,
          },
        }),
        this.prisma.riderProfile.update({
          where: { id: rider.id },
          data: { currentLat: dto.lat, currentLng: dto.lng, lastLocationAt: now },
        }),
      ]);
    }
    return { accepted: true };
  }

  async attendance(userId: string, month?: string) {
    const rider = await this.byUser(userId);
    const m = month ?? istDate().slice(0, 7);
    const from = dateOnly(`${m}-01`);
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    const days = await this.prisma.riderAttendance.findMany({
      where: { riderId: rider.id, date: { gte: from, lt: to } },
      orderBy: { date: 'asc' },
    });
    return {
      month: m,
      presentDays: days.filter((d) => d.status === 'PRESENT').length,
      onlineHours: Math.round(days.reduce((s, d) => s + d.onlineMinutes, 0) / 6) / 10,
      deliveries: days.reduce((s, d) => s + d.deliveryCount, 0),
      days,
    };
  }

  async offers(userId: string) {
    const rider = await this.byUser(userId);
    return this.prisma.deliveryOffer.findMany({
      where: { riderId: rider.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      include: {
        delivery: {
          select: {
            id: true,
            orderNumber: true,
            pickupName: true,
            pickupAddress: true,
            pickupLat: true,
            pickupLng: true,
            dropAddress: true,
            dropLat: true,
            dropLng: true,
            distanceKm: true,
            isCod: true,
            codAmount: true,
          },
        },
      },
    });
  }

  async current(userId: string) {
    const rider = await this.byUser(userId);
    return this.prisma.delivery.findMany({
      where: {
        riderId: rider.id,
        status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'] },
      },
      orderBy: { assignedAt: 'asc' },
    });
  }

  async history(userId: string, page = 1) {
    const rider = await this.byUser(userId);
    const p = normalizePage({ page, pageSize: 30 });
    const where = {
      riderId: rider.id,
      status: { in: ['DELIVERED', 'FAILED', 'CANCELLED'] as never[] },
    };
    const [rows, total] = await Promise.all([
      this.prisma.delivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return paginate(rows, total, p.page, p.pageSize);
  }

  // ─── admin ───────────────────────────────────────────────────────────────
  async adminList(q: ListRidersDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.RiderProfileWhereInput = {
      status: q.status as RiderStatus | undefined,
      city: q.city,
      ...(q.online === 'true' ? { isOnline: true } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: q.q } },
              { vehicleNumber: { contains: q.q.toUpperCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.riderProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { zone: { select: { name: true } } },
      }),
      this.prisma.riderProfile.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async adminSetStatus(id: string, dto: AdminRiderStatusDto) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { id } });
    if (!rider) throw notFound('Rider', id);
    // a left-over session would later be credited from its old start as online time
    if (dto.status !== 'ACTIVE') await this.endShift(rider, new Date());
    return this.prisma.riderProfile.update({
      where: { id },
      data: {
        status: dto.status,
        zoneId: dto.zoneId,
        ...(dto.status !== 'ACTIVE' ? { isOnline: false } : {}),
      },
    });
  }

  async liveMap(city?: string) {
    const riders = await this.prisma.riderProfile.findMany({
      where: { isOnline: true, status: 'ACTIVE', ...(city ? { city } : {}) },
      select: {
        id: true,
        name: true,
        isOnDelivery: true,
        currentLat: true,
        currentLng: true,
        lastLocationAt: true,
        vehicleType: true,
      },
    });
    const live = await Promise.all(
      riders.map(async (r) => ({ ...r, live: await this.geo.last(r.id) })),
    );
    return live.map((r) => ({
      ...r,
      lat: r.live?.lat ?? r.currentLat,
      lng: r.live?.lng ?? r.currentLng,
    }));
  }
}

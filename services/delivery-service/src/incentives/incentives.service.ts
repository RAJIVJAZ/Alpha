import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { IncentiveScheme, IncentiveType, Prisma, RiderProfile } from '@foodgrid/database';
import { EventTypes, IncentiveAchievedEvent } from '@foodgrid/types';
import { dateOnly, istDate, money, notFound } from '@foodgrid/utils';
import { OutboxService } from '@foodgrid/utils/server';
import { attendanceProgress, deliveryContribution } from '../domain/incentives';
import { IncentiveSchemeDto, UpdateIncentiveSchemeDto } from './dto/incentive.dto';

type Tx = Prisma.TransactionClient;

/** Incentive management (admin) and progress tracking (rider). */
@Injectable()
export class IncentivesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  list(active?: boolean) {
    return this.prisma.incentiveScheme.findMany({
      where: active === undefined ? {} : { isActive: active },
      orderBy: { startsAt: 'desc' },
      include: { _count: { select: { progress: true } } },
    });
  }

  create(dto: IncentiveSchemeDto) {
    return this.prisma.incentiveScheme.create({
      data: {
        ...dto,
        peakWindows: dto.peakWindows as Prisma.InputJsonValue | undefined,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
      },
    });
  }

  update(id: string, dto: UpdateIncentiveSchemeDto) {
    return this.prisma.incentiveScheme.update({
      where: { id },
      data: {
        ...dto,
        peakWindows: dto.peakWindows as Prisma.InputJsonValue | undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  async forRider(userId: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId } });
    if (!rider) throw notFound('Rider profile');
    const now = new Date();
    const schemes = await this.prisma.incentiveScheme.findMany({
      where: {
        isActive: true,
        endsAt: { gte: now },
        OR: [{ zoneId: null }, { zoneId: rider.zoneId }],
        AND: [{ OR: [{ city: null }, { city: rider.city }] }],
      },
      include: { progress: { where: { riderId: rider.id } } },
      orderBy: { endsAt: 'asc' },
    });
    return schemes.map((s) => {
      const p = s.progress[0];
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        type: s.type,
        target: s.target,
        progress: p?.progress ?? 0,
        rewardAmount: s.rewardAmount,
        status: p?.status ?? 'IN_PROGRESS',
        peakWindows: s.peakWindows,
        minRating: s.minRating,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        percent: Math.min(100, Math.round(((p?.progress ?? 0) / s.target) * 100)),
      };
    });
  }

  /**
   * After a completed delivery (attendance already counted it): per-delivery
   * schemes advance by its contribution and STREAK schemes re-total.
   */
  async afterDelivery(tx: Tx, rider: RiderProfile, at: Date) {
    for (const s of await this.running(tx, rider, at, at, [
      'ORDER_COUNT',
      'PEAK_HOURS',
      'RATING',
      'STREAK',
    ])) {
      if (s.type === 'STREAK') {
        await this.retotal(tx, rider, s, at);
        continue;
      }
      const inc = deliveryContribution(
        { ...s, peakWindows: s.peakWindows as { start: string; end: string }[] | null },
        at,
        rider.rating,
      );
      if (inc) await this.advance(tx, rider, s, { increment: inc }, at);
    }
  }

  /** After an online session from..to was credited to attendance: LOGIN_HOURS schemes re-total. */
  async afterOnlineSession(tx: Tx, rider: RiderProfile, from: Date, to: Date) {
    for (const s of await this.running(tx, rider, from, to, ['LOGIN_HOURS']))
      await this.retotal(tx, rider, s, to);
  }

  /** Active schemes overlapping from..to that apply to the rider's zone and city. */
  private running(tx: Tx, rider: RiderProfile, from: Date, to: Date, types: IncentiveType[]) {
    return tx.incentiveScheme.findMany({
      where: {
        isActive: true,
        type: { in: types },
        startsAt: { lte: to },
        endsAt: { gte: from },
        OR: [{ zoneId: null }, { zoneId: rider.zoneId }],
        AND: [{ OR: [{ city: null }, { city: rider.city }] }],
      },
    });
  }

  /**
   * Recomputes an attendance-based scheme from the rider's attendance days in its window.
   * shortcut: whole IST days count, so a scheme starting mid-day gets that day's earlier
   * minutes too; store per-session rows if schemes ever start off midnight.
   */
  private async retotal(tx: Tx, rider: RiderProfile, s: IncentiveScheme, at: Date) {
    if (s.minRating && rider.rating < s.minRating) return;
    const days = await tx.riderAttendance.findMany({
      where: {
        riderId: rider.id,
        // endsAt is exclusive (midnight IST), so its last day is the one before
        date: {
          gte: dateOnly(istDate(s.startsAt)),
          lte: dateOnly(istDate(new Date(s.endsAt.getTime() - 1))),
        },
      },
      select: { date: true, onlineMinutes: true, deliveryCount: true },
    });
    const progress = attendanceProgress(s.type, days);
    if (progress) await this.advance(tx, rider, s, { set: progress }, at);
  }

  /** Moves a rider's progress on a scheme and pays the reward once when the target is reached. */
  private async advance(
    tx: Tx,
    rider: RiderProfile,
    s: IncentiveScheme,
    change: { increment: number } | { set: number },
    at: Date,
  ) {
    const progress = await tx.riderIncentive.upsert({
      where: { riderId_schemeId: { riderId: rider.id, schemeId: s.id } },
      create: {
        riderId: rider.id,
        schemeId: s.id,
        progress: 'set' in change ? change.set : change.increment,
        target: s.target,
        rewardAmount: s.rewardAmount,
      },
      update: { progress: change },
    });
    if (progress.status !== 'IN_PROGRESS' || progress.progress < progress.target) return;
    await tx.riderIncentive.update({
      where: { id: progress.id },
      data: { status: 'ACHIEVED', achievedAt: at },
    });
    await tx.riderEarning.create({
      data: {
        riderId: rider.id,
        type: 'INCENTIVE',
        amount: s.rewardAmount,
        description: s.name,
        earnedAt: at,
      },
    });
    await this.outbox.enqueue<IncentiveAchievedEvent>(tx, {
      stream: 'delivery',
      type: EventTypes.IncentiveAchieved,
      aggregateType: 'RiderIncentive',
      aggregateId: progress.id,
      data: {
        riderIncentiveId: progress.id,
        riderId: rider.id,
        userId: rider.userId,
        schemeName: s.name,
        rewardAmount: money(s.rewardAmount.toString()),
      },
    });
  }
}

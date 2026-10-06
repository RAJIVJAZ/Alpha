import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { notFound } from '@foodgrid/utils';
import { IncentiveSchemeDto, UpdateIncentiveSchemeDto } from './dto/incentive.dto';

/** Incentive management (admin) and progress tracking (rider). */
@Injectable()
export class IncentivesService {
  constructor(private readonly prisma: PrismaService) {}

  list(active?: boolean) {
    return this.prisma.incentiveScheme.findMany({
      where: active === undefined ? {} : { isActive: active },
      orderBy: { startsAt: 'desc' },
      include: { _count: { select: { progress: true } } },
    });
  }

  create(dto: IncentiveSchemeDto) {
    return this.prisma.incentiveScheme.create({
      data: { ...dto, peakWindows: dto.peakWindows as Prisma.InputJsonValue | undefined, startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) },
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
      where: { isActive: true, endsAt: { gte: now }, OR: [{ zoneId: null }, { zoneId: rider.zoneId }], AND: [{ OR: [{ city: null }, { city: rider.city }] }] },
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
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        percent: Math.min(100, Math.round(((p?.progress ?? 0) / s.target) * 100)),
      };
    });
  }
}

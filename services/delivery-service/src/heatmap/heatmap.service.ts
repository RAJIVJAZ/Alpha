import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { buildHeatmap } from '../domain/heatmap';
import { ZonesService } from '../zones/zones.service';

/** Demand vs supply heat map (last 60 minutes) for riders and ops. */
@Injectable()
export class HeatmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zones: ZonesService,
  ) {}

  async build(city?: string) {
    const since = new Date(Date.now() - 60 * 60_000);
    const zoneIds = city ? (await this.zones.active()).filter((z) => z.city === city).map((z) => z.id) : undefined;
    const [demand, riders] = await Promise.all([
      this.prisma.delivery.findMany({
        where: { createdAt: { gte: since }, ...(zoneIds ? { zoneId: { in: zoneIds } } : {}) },
        select: { pickupLat: true, pickupLng: true },
      }),
      this.prisma.riderProfile.findMany({
        where: { isOnline: true, isOnDelivery: false, status: 'ACTIVE', currentLat: { not: null }, ...(city ? { city } : {}) },
        select: { currentLat: true, currentLng: true },
      }),
    ]);
    const cells = buildHeatmap(
      demand.map((d) => ({ lat: d.pickupLat, lng: d.pickupLng })),
      riders.map((r) => ({ lat: r.currentLat!, lng: r.currentLng! })),
    );
    const zones = await Promise.all(
      (await this.zones.active()).filter((z) => !city || z.city === city).map(async (z) => ({ id: z.id, name: z.name, surge: await this.zones.surge(z), polygon: z.polygon })),
    );
    return { generatedAt: new Date().toISOString(), cells, hotspots: cells.filter((c) => c.pressure > 1).slice(0, 10), zones };
  }
}

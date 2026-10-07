import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { dateOnly, round2 } from '@foodgrid/utils';
import { SignalDto } from './dto';

interface OwmForecast {
  list: { dt: number; main: { temp_max: number }; rain?: { '3h'?: number } }[];
}

/** External demand drivers: festival calendar, weather and local events. */
@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  between(city: string | null, from: Date, to: Date) {
    return this.prisma.externalSignal.findMany({
      where: { date: { gte: from, lte: to }, OR: [{ city: null }, ...(city ? [{ city }] : [])] },
      orderBy: { date: 'asc' },
    });
  }

  list(q: { from?: string; to?: string; city?: string }) {
    return this.prisma.externalSignal.findMany({
      where: {
        city: q.city,
        date: {
          gte: q.from ? dateOnly(q.from.slice(0, 10)) : undefined,
          lte: q.to ? dateOnly(q.to.slice(0, 10)) : undefined,
        },
      },
      orderBy: { date: 'asc' },
      take: 500,
    });
  }

  create(dto: SignalDto) {
    return this.prisma.externalSignal.create({
      data: { ...dto, date: dateOnly(dto.date.slice(0, 10)), categories: dto.categories ?? [] },
    });
  }

  remove(id: string) {
    return this.prisma.externalSignal.delete({ where: { id } });
  }

  /**
   * Pulls the OpenWeather 5-day forecast and stores WEATHER signals:
   * heavy rain lifts delivery demand; heat lifts beverages and dairy.
   */
  async syncWeather(cities: { name: string; lat: number; lng: number }[]) {
    const key = process.env.OPENWEATHER_API_KEY;
    if (!key) return { synced: 0, skipped: 'OPENWEATHER_API_KEY not configured' };
    let synced = 0;
    for (const city of cities) {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${city.lat}&lon=${city.lng}&units=metric&appid=${key}`,
        {
          signal: AbortSignal.timeout(5000),
        },
      ).catch((err: Error) => {
        this.logger.warn(`weather fetch failed for ${city.name}: ${err.message}`);
        return null;
      });
      if (!res?.ok) continue;
      const data = (await res.json()) as OwmForecast;
      const days = new Map<string, { rain: number; tmax: number }>();
      for (const slot of data.list) {
        const d = new Date((slot.dt + 19800) * 1000).toISOString().slice(0, 10);
        const agg = days.get(d) ?? { rain: 0, tmax: -50 };
        agg.rain += slot.rain?.['3h'] ?? 0;
        agg.tmax = Math.max(agg.tmax, slot.main.temp_max);
        days.set(d, agg);
      }
      for (const [d, w] of days) {
        const signals: { name: string; impact: number; categories: string[] }[] = [];
        if (w.rain > 10) signals.push({ name: 'Heavy rain', impact: 1.25, categories: [] });
        else if (w.rain > 2) signals.push({ name: 'Rain', impact: 1.1, categories: [] });
        if (w.tmax >= 38)
          signals.push({
            name: 'Heatwave',
            impact: 1.3,
            categories: ['BEVERAGES', 'DAIRY', 'FRUITS'],
          });
        for (const s of signals) {
          await this.prisma.externalSignal.upsert({
            where: {
              type_name_city_date: {
                type: 'WEATHER',
                name: s.name,
                city: city.name,
                date: dateOnly(d),
              },
            },
            create: {
              type: 'WEATHER',
              name: s.name,
              city: city.name,
              date: dateOnly(d),
              impact: s.impact,
              categories: s.categories,
              data: { rainMm: round2(w.rain), tempMax: w.tmax },
            },
            update: { impact: s.impact, data: { rainMm: round2(w.rain), tempMax: w.tmax } },
          });
          synced++;
        }
      }
    }
    return { synced };
  }
}

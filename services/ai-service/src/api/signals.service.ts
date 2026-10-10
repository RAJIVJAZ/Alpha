import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { dateOnly, istDate, round2 } from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { SignalDto } from './dto';

interface WeatherCity {
  name: string;
  lat: number;
  lng: number;
}

/** Signal names syncWeather owns (manual WEATHER signals use other names). */
const WEATHER_SIGNALS = ['Heavy rain', 'Rain', 'Heatwave'];

interface OwmForecast {
  list: { dt: number; main: { temp_max: number }; rain?: { '3h'?: number } }[];
}

/** External demand drivers: festival calendar, weather and local events. */
@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

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
   * Pulls the OpenWeather 5-day forecast for every city with an active outlet
   * and stores WEATHER signals under that city's name, which is what demand
   * forecasts look up: heavy rain lifts delivery demand; heat lifts beverages
   * and dairy.
   */
  async syncWeather() {
    const key = process.env.OPENWEATHER_API_KEY;
    if (!key) return { synced: 0, cities: 0, skipped: 'OPENWEATHER_API_KEY not configured' };
    const cities = await this.internal.get<WeatherCity[]>('order', 'internal/outlets/cities');
    let synced = 0;
    // shortcut: one request per city in sequence, fine for tens of cities; throttle once
    // there are more cities than OpenWeather's 60 calls/minute allows
    for (const city of cities) {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${city.lat}&lon=${city.lng}&units=metric&appid=${key}`,
        { signal: AbortSignal.timeout(5000) },
      ).catch((err: Error) => {
        this.logger.warn(`weather fetch failed for ${city.name}: ${err.message}`);
        return null;
      });
      if (!res) continue;
      if (!res.ok) {
        this.logger.warn(`weather fetch failed for ${city.name}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json().catch(() => null)) as OwmForecast | null;
      if (!Array.isArray(data?.list)) {
        this.logger.warn(`weather forecast for ${city.name} has no list`);
        continue;
      }
      const today = istDate();
      const days = new Map<string, { rain: number; tmax: number }>();
      for (const slot of data.list) {
        const d = istDate(new Date(slot.dt * 1000));
        // today's past slots are gone from the forecast, so leave today as earlier runs saw it
        if (d <= today) continue;
        const agg = days.get(d) ?? { rain: 0, tmax: -50 };
        agg.rain += slot.rain?.['3h'] ?? 0;
        agg.tmax = Math.max(agg.tmax, slot.main.temp_max);
        days.set(d, agg);
      }
      const rows: Prisma.ExternalSignalCreateManyInput[] = [];
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
        for (const s of signals)
          rows.push({
            type: 'WEATHER',
            name: s.name,
            city: city.name,
            date: dateOnly(d),
            impact: s.impact,
            categories: s.categories,
            data: { rainMm: round2(w.rain), tempMax: w.tmax },
          });
      }
      // replace the days this forecast covers, so a day downgraded from heavy rain to
      // rain (or no longer hot) does not keep the earlier signal as well
      await this.prisma.$transaction([
        this.prisma.externalSignal.deleteMany({
          where: {
            type: 'WEATHER',
            name: { in: WEATHER_SIGNALS },
            city: city.name,
            date: { in: [...days.keys()].map((d) => dateOnly(d)) },
          },
        }),
        // a manual sync racing the scheduled one inserts the same rows
        this.prisma.externalSignal.createMany({ data: rows, skipDuplicates: true }),
      ]);
      synced += rows.length;
    }
    return { synced, cities: cities.length };
  }
}

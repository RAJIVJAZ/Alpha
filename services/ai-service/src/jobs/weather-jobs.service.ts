import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS, withLock } from '@foodgrid/utils/server';
import { SignalsService } from '../api/signals.service';

/** Keeps future WEATHER signals fresh for the demand forecasts. */
@Injectable()
export class WeatherJobsService {
  private readonly logger = new Logger(WeatherJobsService.name);
  private warnedNoKey = false;

  constructor(
    private readonly signals: SignalsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** OpenWeather's 5-day forecast is published in 3-hour slots. */
  @Cron(CronExpression.EVERY_3_HOURS)
  async syncWeather() {
    if (!process.env.OPENWEATHER_API_KEY) {
      if (!this.warnedNoKey)
        this.logger.warn('OPENWEATHER_API_KEY is not set: demand forecasts get no weather');
      this.warnedNoKey = true;
      return;
    }
    const result = await withLock(this.redis, 'ai:weather-sync', 1800, () =>
      this.signals.syncWeather(),
    );
    if (result) this.logger.log(`weather: ${result.synced} signals for ${result.cities} cities`);
  }
}

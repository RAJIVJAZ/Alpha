import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { SignalsService } from '../api/signals.service';
import { WeatherJobsService } from './weather-jobs.service';

describe('WeatherJobsService', () => {
  const signals = { syncWeather: jest.fn() };
  const redis = { set: jest.fn(), eval: jest.fn() };
  const job = () =>
    new WeatherJobsService(signals as unknown as SignalsService, redis as unknown as Redis);
  const savedKey = process.env.OPENWEATHER_API_KEY;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    signals.syncWeather.mockResolvedValue({ synced: 4, cities: 2 });
    redis.eval.mockResolvedValue(1);
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = savedKey;
    jest.restoreAllMocks();
  });

  it('skips without a key, warning once rather than every run', async () => {
    delete process.env.OPENWEATHER_API_KEY;
    const j = job();
    await j.syncWeather();
    await j.syncWeather();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/OPENWEATHER_API_KEY/);
    expect(redis.set).not.toHaveBeenCalled();
    expect(signals.syncWeather).not.toHaveBeenCalled();
  });

  it('syncs under the distributed lock when the key is set', async () => {
    process.env.OPENWEATHER_API_KEY = 'owm-key';
    redis.set.mockResolvedValue('OK');
    await job().syncWeather();
    expect(redis.set).toHaveBeenCalledWith(
      'lock:ai:weather-sync',
      expect.any(String),
      'EX',
      1800,
      'NX',
    );
    expect(signals.syncWeather).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves the run to the replica holding the lock', async () => {
    process.env.OPENWEATHER_API_KEY = 'owm-key';
    redis.set.mockResolvedValue(null);
    await job().syncWeather();
    expect(signals.syncWeather).not.toHaveBeenCalled();
  });
});

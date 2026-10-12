import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { SettingsDto } from './po.dto';

// same options as the services' global pipe
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const parse = (body: object) => pipe.transform(body, { type: 'body', metatype: SettingsDto });

describe('SettingsDto', () => {
  it.each([3, 14, 90])('accepts a %i-day forecast horizon', async (days) => {
    await expect(parse({ forecastHorizonDays: days })).resolves.toMatchObject({
      forecastHorizonDays: days,
    });
  });

  // ai-service forecasts at most 90 days ahead, in whole days
  it.each([2, 91, 120, 14.5])('rejects a %p-day forecast horizon', async (days) => {
    await expect(parse({ forecastHorizonDays: days })).rejects.toThrow();
  });
});

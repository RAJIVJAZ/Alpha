import { ArgumentsHost, BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { AppError } from '../errors';
import { AllExceptionsFilter } from './exception.filter';

class Dto {
  @IsString() phone!: string;
  @Matches(/^\d{6}$/) code!: string;
}

function run(err: unknown) {
  const out: { status?: number; body?: Record<string, unknown> } = {};
  const res = { status: (s: number) => ((out.status = s), res), json: (b: Record<string, unknown>) => (out.body = b) };
  const host = { getType: () => 'http', switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ id: 'req-1', url: '/x', method: 'POST' }) }) };
  new AllExceptionsFilter().catch(err, host as unknown as ArgumentsHost);
  return out;
}

describe('AllExceptionsFilter', () => {
  it('maps ValidationPipe failures to VALIDATION_FAILED with field errors in details', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    const err = await pipe.transform({ phone: 1, code: '12ab' }, { type: 'body', metatype: Dto }).catch((e: unknown) => e);
    const { status, body } = run(err);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Validation failed', requestId: 'req-1' });
    expect((body!.details as { errors: string[] }).errors.length).toBe(2);
  });

  it('gives framework HTTP errors a code derived from the status', () => {
    expect(run(new NotFoundException('Cannot GET /nope')).body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(run(new BadRequestException('bad')).body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
  });

  it('keeps explicit AppError codes and details', () => {
    expect(run(new AppError('OTP_INVALID', 'Incorrect code', 400, { remainingAttempts: 3 })).body).toMatchObject({
      statusCode: 400,
      code: 'OTP_INVALID',
      details: { remainingAttempts: 3 },
    });
  });

  it('hides internals of unexpected errors', () => {
    expect(run(new Error('secret connection string')).body).toMatchObject({ statusCode: 500, code: 'INTERNAL', message: 'Internal server error' });
  });
});

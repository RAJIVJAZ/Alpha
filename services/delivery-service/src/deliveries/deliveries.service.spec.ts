import 'reflect-metadata';
import type Redis from 'ioredis';
import type { PrismaService } from '@foodgrid/database/nest';
import type { InternalHttpService, OutboxService } from '@foodgrid/utils/server';
import type { GeoStore, LivePosition } from '../common/geo-store';
import { riderView } from '../common/rider-view';
import type { IncentivesService } from '../incentives/incentives.service';
import type { TrackingGateway } from '../tracking/tracking.gateway';
import { isOwnUpload } from '../common/own-upload';
import { DeliveriesService } from './deliveries.service';

const DROP = { lat: 12.9352, lng: 77.6245 };
const rider = { id: 'rider-1', userId: 'user-1' };
const delivery = {
  id: 'del-1',
  riderId: 'rider-1',
  status: 'AT_DROP',
  deliveryOtp: '4821',
  isCod: false,
  dropLat: DROP.lat,
  dropLng: DROP.lng,
};

/** Reaching the transaction means every pre-check passed. */
const PASSED_CHECKS = new Error('passed pre-checks');

/** In-memory stand-in for the attempt counter (INCR/EXPIRE/DEL). */
function fakeRedis() {
  const counts = new Map<string, number>();
  return {
    incr: async (k: string) => {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return counts.get(k)!;
    },
    expire: async () => 1,
    del: async (k: string) => Number(counts.delete(k)),
  };
}

function service(
  position: LivePosition | null,
  row: { deliveryOtp?: string | null } = {},
  redis = fakeRedis(),
) {
  const prisma = {
    riderProfile: { findUnique: jest.fn().mockResolvedValue(rider) },
    delivery: { findUnique: jest.fn().mockResolvedValue({ ...delivery, ...row }) },
    $transaction: jest.fn().mockRejectedValue(PASSED_CHECKS),
  };
  const geo = { last: jest.fn().mockResolvedValue(position) };
  return new DeliveriesService(
    prisma as unknown as PrismaService,
    {} as OutboxService,
    {} as TrackingGateway,
    geo as unknown as GeoStore,
    {} as InternalHttpService,
    {} as IncentivesService,
    redis as unknown as Redis,
  );
}

const fix = (lat: number, lng: number, ageMs: number): LivePosition =>
  ({ lat, lng, at: new Date(Date.now() - ageMs).toISOString() }) as LivePosition;

describe('DeliveriesService.complete geofence', () => {
  const proof = { otp: '4821' };

  it('refuses to complete without a known rider position', async () => {
    await expect(service(null).complete('user-1', 'del-1', proof)).rejects.toMatchObject({
      code: 'LOCATION_REQUIRED',
      status: 409,
    });
  });

  it('refuses a position older than five minutes, even at the drop point', async () => {
    await expect(
      service(fix(DROP.lat, DROP.lng, 6 * 60_000)).complete('user-1', 'del-1', proof),
    ).rejects.toMatchObject({
      code: 'LOCATION_REQUIRED',
    });
  });

  it('refuses a fresh position away from the drop point', async () => {
    // ~1.1 km north of the drop
    await expect(
      service(fix(DROP.lat + 0.01, DROP.lng, 10_000)).complete('user-1', 'del-1', proof),
    ).rejects.toMatchObject({
      code: 'TOO_FAR_FROM_DROP',
    });
  });

  it('accepts a fresh position at the drop point', async () => {
    await expect(
      service(fix(DROP.lat + 0.001, DROP.lng, 10_000)).complete('user-1', 'del-1', proof),
    ).rejects.toBe(PASSED_CHECKS);
  });

  it('checks the OTP before anything else', async () => {
    await expect(service(null).complete('user-1', 'del-1', { otp: '0000' })).rejects.toMatchObject({
      code: 'OTP_MISMATCH',
    });
  });
});

describe('DeliveriesService.complete proof', () => {
  const atDrop = fix(DROP.lat, DROP.lng, 10_000);
  const ownPhoto =
    'http://localhost:9000/foodgrid-media-local/delivery-proof/user-1/2026-10-10/0b8e3a52-1f7c-4c1e-9d55-3f0f7d2c9a10.jpg';

  beforeAll(() => {
    process.env.CDN_BASE_URL = 'http://localhost:9000/foodgrid-media-local/';
  });
  afterAll(() => {
    delete process.env.CDN_BASE_URL;
  });

  it('requires the customer OTP even with a photo', async () => {
    await expect(
      service(atDrop).complete('user-1', 'del-1', { proofPhotoUrl: ownPhoto }),
    ).rejects.toMatchObject({ code: 'OTP_REQUIRED', status: 400 });
  });

  it('refuses a delivery that has no code to check', async () => {
    await expect(
      service(atDrop, { deliveryOtp: null }).complete('user-1', 'del-1', {
        proofPhotoUrl: ownPhoto,
      }),
    ).rejects.toMatchObject({ code: 'OTP_UNAVAILABLE' });
  });

  it('locks the code after five tries, even the right one', async () => {
    const svc = service(atDrop);
    for (let i = 0; i < 5; i++)
      await expect(svc.complete('user-1', 'del-1', { otp: '0000' })).rejects.toMatchObject({
        code: 'OTP_MISMATCH',
      });
    await expect(svc.complete('user-1', 'del-1', { otp: '4821' })).rejects.toMatchObject({
      code: 'OTP_LOCKED',
      status: 429,
    });
  });

  it('does not use up tries once the right code was given', async () => {
    const svc = service(fix(DROP.lat + 0.01, DROP.lng, 10_000));
    for (let i = 0; i < 6; i++)
      await expect(svc.complete('user-1', 'del-1', { otp: '4821' })).rejects.toMatchObject({
        code: 'TOO_FAR_FROM_DROP',
      });
  });

  it('refuses a photo that is not our own upload', async () => {
    await expect(
      service(atDrop).complete('user-1', 'del-1', {
        otp: '4821',
        proofPhotoUrl: 'https://example.com/door.jpg',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROOF_PHOTO' });
    await expect(
      service(atDrop).complete('user-1', 'del-1', {
        otp: '4821',
        proofSignatureUrl: 'https://example.com/signature.png',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROOF_PHOTO' });
  });

  it('accepts the OTP with the rider’s own proof photo', async () => {
    await expect(
      service(atDrop).complete('user-1', 'del-1', { otp: '4821', proofPhotoUrl: ownPhoto }),
    ).rejects.toBe(PASSED_CHECKS);
  });
});

describe('isOwnUpload', () => {
  const base = 'https://cdn.foodgrid.in';
  const key = '2026-10-10/0b8e3a52-1f7c-4c1e-9d55-3f0f7d2c9a10.jpg';
  beforeAll(() => {
    process.env.CDN_BASE_URL = base;
  });
  afterAll(() => {
    delete process.env.CDN_BASE_URL;
  });

  it('accepts only this user’s delivery-proof keys under our media base', () => {
    expect(isOwnUpload(`${base}/delivery-proof/user-1/${key}`, 'user-1', 'delivery-proof')).toBe(
      true,
    );
    expect(isOwnUpload(`${base}/delivery-proof/user-2/${key}`, 'user-1', 'delivery-proof')).toBe(
      false,
    );
    expect(isOwnUpload(`${base}/avatars/user-1/${key}`, 'user-1', 'delivery-proof')).toBe(false);
    expect(
      isOwnUpload(`https://evil.example/delivery-proof/user-1/${key}`, 'user-1', 'delivery-proof'),
    ).toBe(false);
    expect(
      isOwnUpload(`${base}/delivery-proof/user-1/../user-2/${key}`, 'user-1', 'delivery-proof'),
    ).toBe(false);
    expect(
      isOwnUpload(`${base}.evil.example/delivery-proof/user-1/${key}`, 'user-1', 'delivery-proof'),
    ).toBe(false);
  });

  it('takes PDFs only as KYC documents', () => {
    const pdf = '2026-10-10/0b8e3a52-1f7c-4c1e-9d55-3f0f7d2c9a10.pdf';
    expect(isOwnUpload(`${base}/kyc/user-1/${pdf}`, 'user-1', 'kyc')).toBe(true);
    expect(isOwnUpload(`${base}/kyc/user-1/${key}`, 'user-1', 'kyc')).toBe(true);
    expect(isOwnUpload(`${base}/delivery-proof/user-1/${pdf}`, 'user-1', 'delivery-proof')).toBe(
      false,
    );
    expect(isOwnUpload(`${base}/delivery-proof/user-1/${key}`, 'user-1', 'kyc')).toBe(false);
  });

  it('falls back to the bucket URL without a CDN', () => {
    delete process.env.CDN_BASE_URL;
    process.env.S3_MEDIA_BUCKET = 'foodgrid-media';
    expect(
      isOwnUpload(
        `https://foodgrid-media.s3.amazonaws.com/delivery-proof/user-1/${key}`,
        'user-1',
        'delivery-proof',
      ),
    ).toBe(true);
    delete process.env.S3_MEDIA_BUCKET;
  });
});

describe('riderView', () => {
  it('never hands the delivery OTP to the rider', () => {
    const view = riderView(delivery);
    expect(view).not.toHaveProperty('deliveryOtp');
    expect(view).toMatchObject({ id: 'del-1', status: 'AT_DROP', dropLat: DROP.lat });
  });
});

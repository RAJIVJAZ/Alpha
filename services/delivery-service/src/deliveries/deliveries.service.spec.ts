import 'reflect-metadata';
import type { PrismaService } from '@foodgrid/database/nest';
import type { InternalHttpService, OutboxService } from '@foodgrid/utils/server';
import type { GeoStore, LivePosition } from '../common/geo-store';
import { riderView } from '../common/rider-view';
import type { TrackingGateway } from '../tracking/tracking.gateway';
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

function service(position: LivePosition | null) {
  const prisma = {
    riderProfile: { findUnique: jest.fn().mockResolvedValue(rider) },
    delivery: { findUnique: jest.fn().mockResolvedValue(delivery) },
    $transaction: jest.fn().mockRejectedValue(PASSED_CHECKS),
  };
  const geo = { last: jest.fn().mockResolvedValue(position) };
  return new DeliveriesService(
    prisma as unknown as PrismaService,
    {} as OutboxService,
    {} as TrackingGateway,
    geo as unknown as GeoStore,
    {} as InternalHttpService,
  );
}

const fix = (lat: number, lng: number, ageMs: number): LivePosition =>
  ({ lat, lng, at: new Date(Date.now() - ageMs).toISOString() }) as LivePosition;

describe('DeliveriesService.complete geofence', () => {
  const proof = { otp: '4821' };

  it('refuses to complete without a known rider position', async () => {
    await expect(service(null).complete('user-1', 'del-1', proof)).rejects.toMatchObject({ code: 'LOCATION_REQUIRED', status: 409 });
  });

  it('refuses a position older than five minutes, even at the drop point', async () => {
    await expect(service(fix(DROP.lat, DROP.lng, 6 * 60_000)).complete('user-1', 'del-1', proof)).rejects.toMatchObject({
      code: 'LOCATION_REQUIRED',
    });
  });

  it('refuses a fresh position away from the drop point', async () => {
    // ~1.1 km north of the drop
    await expect(service(fix(DROP.lat + 0.01, DROP.lng, 10_000)).complete('user-1', 'del-1', proof)).rejects.toMatchObject({
      code: 'TOO_FAR_FROM_DROP',
    });
  });

  it('accepts a fresh position at the drop point', async () => {
    await expect(service(fix(DROP.lat + 0.001, DROP.lng, 10_000)).complete('user-1', 'del-1', proof)).rejects.toBe(PASSED_CHECKS);
  });

  it('checks the OTP before anything else', async () => {
    await expect(service(null).complete('user-1', 'del-1', { otp: '0000' })).rejects.toMatchObject({ code: 'OTP_MISMATCH' });
  });
});

describe('riderView', () => {
  it('never hands the delivery OTP to the rider', () => {
    const view = riderView(delivery);
    expect(view).not.toHaveProperty('deliveryOtp');
    expect(view).toMatchObject({ id: 'del-1', status: 'AT_DROP', dropLat: DROP.lat });
  });
});

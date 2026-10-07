import { haversineKm, hhmmToMinutes, istParts } from '@foodgrid/utils';

export interface ZoneLike {
  id: string;
  pincodes: string[];
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  deliveryCharge: number;
  freeDeliveryAbove: number | null;
  minOrderValue: number;
  leadTimeHours: number;
  isActive: boolean;
}

/** Pincode match first (most precise), then radius coverage. */
export function findZone<Z extends ZoneLike>(
  zones: Z[],
  dest: { pincode?: string | null; lat?: number | null; lng?: number | null },
): Z | null {
  const active = zones.filter((z) => z.isActive);
  if (dest.pincode) {
    const byPin = active.find((z) => z.pincodes.includes(dest.pincode!));
    if (byPin) return byPin;
  }
  if (dest.lat != null && dest.lng != null) {
    const covering = active
      .filter((z) => z.centerLat != null && z.centerLng != null && z.radiusKm != null)
      .map((z) => ({
        z,
        d: haversineKm(
          { lat: z.centerLat!, lng: z.centerLng! },
          { lat: dest.lat!, lng: dest.lng! },
        ),
      }))
      .filter(({ z, d }) => d <= z.radiusKm!)
      .sort((a, b) => a.d - b.d);
    if (covering[0]) return covering[0].z;
  }
  return null;
}

export function deliveryChargeFor(zone: ZoneLike | null, orderValue: number): number {
  if (!zone) return 0;
  if (zone.freeDeliveryAbove != null && orderValue >= zone.freeDeliveryAbove) return 0;
  return zone.deliveryCharge;
}

export interface SlotLike {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  cutoffMinutes: number;
  isActive: boolean;
}

/** Whether a delivery slot can still be booked for `date` (YYYY-MM-DD, IST). */
export function slotBookable(
  slot: SlotLike,
  date: string,
  booked: number,
  now = new Date(),
): { ok: boolean; reason?: string } {
  if (!slot.isActive) return { ok: false, reason: 'Slot inactive' };
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (day !== slot.dayOfWeek) return { ok: false, reason: 'Slot not offered on this day' };
  if (booked >= slot.capacity) return { ok: false, reason: 'Slot is full' };
  const slotStart = new Date(`${date}T${slot.startTime}:00+05:30`).getTime();
  if (slotStart - slot.cutoffMinutes * 60_000 <= now.getTime())
    return { ok: false, reason: 'Booking cut-off has passed' };
  return { ok: true };
}

/** Current IST minute-of-day helper (exported for tests). */
export const istMinuteOfDay = (d = new Date()) => {
  const p = istParts(d);
  return p.hour * 60 + p.minute;
};
export { hhmmToMinutes };

/**
 * Outlet setup and settings: form state ↔ the merchant/outlets request body. The builder
 * throws an Error with a message for the merchant when the input can't work; order-service
 * still validates everything.
 */

export type OutletType = 'RESTAURANT' | 'FOOD_CART' | 'CLOUD_KITCHEN';

/** One opening window; `day` 0 = Sunday. A close before the open runs past midnight. */
export interface HoursWindow {
  day: number;
  open: string;
  close: string;
}

/** The outlet fields the settings form edits (merchant/outlets returns the full row). */
export interface OutletRecord {
  type: OutletType;
  name: string;
  description?: string | null;
  cuisines?: string[];
  phone?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  isPureVeg?: boolean;
  costForTwo?: string | number | null;
  avgPrepTimeMins?: number;
  deliveryRadiusKm?: number;
  minOrderValue?: string | number | null;
  packagingCharge?: string | number | null;
  openingHours?: HoursWindow[] | null;
  fssaiNumber?: string | null;
  gstin?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  acceptsDelivery?: boolean;
  acceptsTakeaway?: boolean;
  acceptsDineIn?: boolean;
  acceptsQrOrders?: boolean;
  kdsStations?: string[];
}

export interface OutletForm {
  type: OutletType;
  name: string;
  description: string;
  cuisines: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  lat: string;
  lng: string;
  isPureVeg: boolean;
  costForTwo: string;
  avgPrepTimeMins: string;
  deliveryRadiusKm: string;
  minOrderValue: string;
  packagingCharge: string;
  hours: HoursWindow[];
  fssaiNumber: string;
  gstin: string;
  logoUrl: string;
  coverImageUrl: string;
  acceptsDelivery: boolean;
  acceptsTakeaway: boolean;
  acceptsDineIn: boolean;
  acceptsQrOrders: boolean;
  kdsStations: string;
}

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Lunch and dinner every day: a starting point a restaurant edits. */
export const DEFAULT_HOURS: HoursWindow[] = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
  { day, open: '11:00', close: '15:30' },
  { day, open: '18:30', close: '23:00' },
]);
/** A cart's single evening shift. */
const CART_HOURS: HoursWindow[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  open: '17:00',
  close: '23:00',
}));

const str = (v: string | number | null | undefined) => (v == null ? '' : String(v));

/** Form state for a new outlet of `type`, or for editing `o`. */
export function outletForm(type: OutletType, o?: OutletRecord): OutletForm {
  const cart = type === 'FOOD_CART';
  return {
    type: o?.type ?? type,
    name: o?.name ?? '',
    description: o?.description ?? '',
    cuisines: (o?.cuisines ?? []).join(', '),
    phone: o?.phone ?? '',
    addressLine1: o?.addressLine1 ?? '',
    addressLine2: o?.addressLine2 ?? '',
    city: o?.city ?? '',
    state: o?.state ?? '',
    pincode: o?.pincode ?? '',
    lat: str(o?.lat),
    lng: str(o?.lng),
    isPureVeg: o?.isPureVeg ?? false,
    costForTwo: str(o?.costForTwo ?? (o ? null : cart ? 200 : 500)),
    avgPrepTimeMins: str(o?.avgPrepTimeMins ?? (cart ? 10 : 20)),
    deliveryRadiusKm: str(o?.deliveryRadiusKm ?? (cart ? 3 : 6)),
    minOrderValue: str(o?.minOrderValue ?? (o ? null : 0)),
    packagingCharge: str(o?.packagingCharge ?? (o ? null : 0)),
    hours: o ? (o.openingHours ?? []) : cart ? CART_HOURS : DEFAULT_HOURS,
    fssaiNumber: o?.fssaiNumber ?? '',
    gstin: o?.gstin ?? '',
    logoUrl: o?.logoUrl ?? '',
    coverImageUrl: o?.coverImageUrl ?? '',
    acceptsDelivery: o?.acceptsDelivery ?? true,
    acceptsTakeaway: o?.acceptsTakeaway ?? true,
    acceptsDineIn: o?.acceptsDineIn ?? !cart,
    // carts take most orders at the counter, from a QR code on the cart
    acceptsQrOrders: o?.acceptsQrOrders ?? cart,
    kdsStations: (o?.kdsStations ?? ['MAIN']).join(', '),
  };
}

const list = (s: string, max: number) =>
  [
    ...new Set(
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].slice(0, max);

function amount(s: string, label: string): number | undefined {
  if (s.trim() === '') return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a positive number`);
  return n;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks and sorts the opening windows (by day, then opening time). */
export function cleanHours(hours: HoursWindow[]): HoursWindow[] {
  for (const w of hours) {
    if (!HHMM.test(w.open) || !HHMM.test(w.close))
      throw new Error(`Enter ${DAYS[w.day]}'s hours as HH:MM`);
    if (w.open === w.close)
      throw new Error(`${DAYS[w.day]}: the closing time must differ from the opening time`);
  }
  return [...hours].sort((a, b) => a.day - b.day || a.open.localeCompare(b.open));
}

/**
 * The merchant/outlets body. `create` adds the type, which stays fixed afterwards (a food
 * cart business only creates food cart outlets).
 */
export function outletBody(f: OutletForm, { create }: { create: boolean }) {
  const name = f.name.trim();
  if (!name) throw new Error('Enter the outlet name customers will see');
  if (!f.addressLine1.trim() || !f.city.trim() || !f.state.trim())
    throw new Error('Enter the address, city and state');
  if (!/^\d{6}$/.test(f.pincode.trim())) throw new Error('Enter the 6-digit PIN code');
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  if (
    f.lat.trim() === '' ||
    f.lng.trim() === '' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    throw new Error('Set the location: use "Use my location" at the outlet, or enter it');
  const fssai = f.fssaiNumber.trim();
  if (fssai && !/^\d{14}$/.test(fssai)) throw new Error('The FSSAI licence number has 14 digits');
  const radius = amount(f.deliveryRadiusKm, 'Delivery radius');
  if (radius !== undefined && (radius < 0.5 || radius > 25))
    throw new Error('Delivery radius must be between 0.5 and 25 km');
  const prep = amount(f.avgPrepTimeMins, 'Preparation time');
  if (prep !== undefined && (!Number.isInteger(prep) || prep < 1 || prep > 180))
    throw new Error('Preparation time must be 1 to 180 minutes');
  if (!f.acceptsDelivery && !f.acceptsTakeaway && !f.acceptsDineIn && !f.acceptsQrOrders)
    throw new Error('Choose at least one way to take orders');
  const stations = list(f.kdsStations.toUpperCase().replace(/[^A-Z0-9,\s_-]/g, ''), 12);
  const body = {
    name,
    // an emptied description or phone is cleared on save; new outlets just leave them out
    description: f.description.trim() || (create ? undefined : ''),
    cuisines: list(f.cuisines, 10),
    phone: f.phone.trim() || (create ? undefined : ''),
    addressLine1: f.addressLine1.trim(),
    addressLine2: f.addressLine2.trim() || undefined,
    city: f.city.trim(),
    state: f.state.trim(),
    pincode: f.pincode.trim(),
    lat,
    lng,
    isPureVeg: f.isPureVeg,
    costForTwo: amount(f.costForTwo, 'Cost for two'),
    avgPrepTimeMins: prep,
    deliveryRadiusKm: radius,
    minOrderValue: amount(f.minOrderValue, 'Minimum order'),
    packagingCharge: amount(f.packagingCharge, 'Packaging charge'),
    openingHours: cleanHours(f.hours),
    fssaiNumber: fssai || undefined,
    gstin: f.gstin.trim().toUpperCase() || undefined,
    logoUrl: f.logoUrl.trim() || undefined,
    coverImageUrl: f.coverImageUrl.trim() || undefined,
    acceptsDelivery: f.acceptsDelivery,
    acceptsTakeaway: f.acceptsTakeaway,
    acceptsDineIn: f.acceptsDineIn,
    acceptsQrOrders: f.acceptsQrOrders,
    kdsStations: stations.length ? stations : ['MAIN'],
  };
  return create ? { type: f.type, ...body } : body;
}

/** "Mon–Sat 11:00–23:00" style summary for the status card. */
export function hoursSummary(hours: HoursWindow[] | null | undefined): string {
  if (!hours?.length) return 'Open all day, every day';
  const days = new Set(hours.map((w) => w.day));
  return `${days.size === 7 ? 'Every day' : `${days.size} days a week`}, ${hours.length} opening window${hours.length === 1 ? '' : 's'}`;
}

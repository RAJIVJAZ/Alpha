import type { PrismaClient } from '../../generated/client';
import { istDateStamp } from '../../src/sequence';
import type { Locality, MerchantDef, OutletDef, SellerKey } from './catalog';
import { Rng } from './lib';

export interface TenantRef {
  id: string;
  name: string;
  legalName: string;
  gstin: string;
  stateCode: string;
  ownerUserId: string;
}

export interface CustomerRef {
  userId: string;
  name: string;
  phone: string;
  area: string;
  address: {
    id: string;
    line1: string;
    city: string;
    state: string;
    pincode: string;
    lat: number;
    lng: number;
    label: string;
  };
  /** Relative ordering frequency (a few heavy users, a long tail). */
  weight: number;
  hasMembership: boolean;
  /** IST midnight of the sign-up day; the customer orders only after it. */
  joinedAt: Date;
  /** Set when the customer holds an active FoodGrid One membership. */
  membershipSince?: Date;
}

export interface RiderRef {
  userId: string;
  profileId: string;
  name: string;
  phone: string;
  zoneId: string;
  zoneKey: string;
}

export interface MenuItemRef {
  id: string;
  name: string;
  price: number;
  isVeg: boolean;
  popularity: number;
  station: string;
  recipe: [string, number][];
  variants: { id: string; name: string; priceDelta: number; isDefault: boolean }[];
  addons: { id: string; name: string; price: number }[];
}

export interface OutletRef {
  id: string;
  def: OutletDef;
  merchant: MerchantDef;
  tenantId: string;
  locality: Locality;
  lat: number;
  lng: number;
  zoneKey: string;
  commissionRate: number;
  items: MenuItemRef[];
  /** Ingredient key -> ingredient id (filled by the inventory seeder). */
  ingredientIds: Map<string, string>;
}

export interface SeedContext {
  prisma: PrismaClient;
  rng: Rng;
  now: Date;
  passwordHash: string;
  platform: TenantRef;
  adminUserId: string;
  merchants: Map<string, TenantRef>;
  sellers: Map<SellerKey, TenantRef>;
  outlets: OutletRef[];
  customers: CustomerRef[];
  riders: RiderRef[];
  zones: Map<
    string,
    {
      id: string;
      baseFee: number;
      perKmFee: number;
      freeKm: number;
      riderBasePay: number;
      riderPerKm: number;
    }
  >;
  coupons: Map<
    string,
    {
      id: string;
      code: string;
      type: 'FLAT' | 'PERCENT' | 'FREE_DELIVERY';
      value: number;
      maxDiscount: number | null;
      minOrderValue: number;
      fundedBy: 'PLATFORM' | 'MERCHANT' | 'SHARED';
      tenantId: string | null;
      firstOrderOnly: boolean;
    }
  >;
  /** Product id lookup by ingredient key, per seller. */
  products: {
    id: string;
    seller: SellerKey;
    ingredient: string;
    name: string;
    sku: string;
    unit: string;
    packSize: number;
    price: number;
    moq: number;
    gstRate: number;
    tiers: { minQty: number; unitPrice: number; segment: string }[];
    leadTimeHours: number;
  }[];
  counters: Map<string, number>;
  /** Next human-readable document number, mirroring generateDocumentNumber(). */
  docNumber(prefix: string, at: Date, pad?: number): string;
}

export function createContext(
  prisma: PrismaClient,
  passwordHash: string,
  now = new Date(),
): SeedContext {
  const counters = new Map<string, number>();
  return {
    prisma,
    rng: new Rng(20261006),
    now,
    passwordHash,
    platform: undefined as unknown as TenantRef,
    adminUserId: '',
    merchants: new Map(),
    sellers: new Map(),
    outlets: [],
    customers: [],
    riders: [],
    zones: new Map(),
    coupons: new Map(),
    products: [],
    counters,
    docNumber(prefix, at, pad = 5) {
      const stamp = istDateStamp(at);
      const name = `${prefix}-${stamp}`;
      const next = (counters.get(name) ?? 0) + 1;
      counters.set(name, next);
      return `${name}-${next.toString().padStart(pad, '0')}`;
    },
  };
}

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import type { AddressSnapshot, StockUnit } from '@foodgrid/types';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';

export interface StockStatus {
  id: string;
  tenantId: string;
  outletId: string;
  name: string;
  sku: string;
  category: string;
  unit: StockUnit;
  marketplaceCategory: string | null;
  preferredSupplierId: string | null;
  currentStock: number;
  reorderLevel: number;
  reorderQty: number;
  safetyStock: number;
  maxStock: number | null;
  leadTimeDays: number;
  avgUnitCost: number;
  shelfLifeDays: number | null;
  avgDailyUsage: number;
  stdDailyUsage: number;
}

export interface OutletInfo {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  state: string;
  pincode: string;
  addressLine1: string;
  lat: number;
  lng: number;
  phone: string | null;
}

export interface Offer {
  productId: string;
  supplierTenantId: string;
  supplierName: string;
  productName: string;
  brand: string | null;
  sku: string;
  unitPrice: number;
  baseQtyPerPack: number;
  moq: number;
  stepQty: number;
  gstRate: number;
  deliveryCharge: number;
  freeDeliveryAbove: number | null;
  leadTimeHours: number;
  rating: number;
  ratingCount: number;
  onTimeRate: number;
  fillRate: number;
  stockQty: number;
  tiers?: { minQty: number; unitPrice: number }[];
}

export interface RankedOption {
  productId: string;
  supplierTenantId: string;
  supplierName: string;
  productName: string;
  brand: string | null;
  unitPrice: number;
  packSize: number;
  packs: number;
  quantity: number;
  subtotal: number;
  tax: number;
  deliveryCharge: number;
  landedCost: number;
  costPerBaseUnit: number;
  leadTimeHours: number;
  rating: number;
  onTimeRate: number;
  fillRate: number;
  moqSatisfied: boolean;
  feasible: boolean;
  score: number;
  rank: number;
}

export interface ForecastResponse {
  model: string;
  mape: number | null;
  residualStd: number;
  points: { date: string; value: number; lower: number; upper: number; multiplier: number; signals: string[] }[];
  depletion?: { daysOfCover: number; depletionDate: string | null };
}

/** Typed facade over the internal APIs the procurement engine depends on. */
@Injectable()
export class ClientsService {
  constructor(
    private readonly http: InternalHttpService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  stockStatus(tenantId: string, outletId?: string) {
    return this.http.get<StockStatus[]>('inventory', 'internal/inventory/stock-status', { query: { tenantId, outletId }, timeoutMs: 10_000 });
  }

  ingredient(id: string) {
    return this.http.get<StockStatus & { tenantId: string }>('inventory', `internal/inventory/ingredients/${id}`);
  }

  consumption(ingredientId: string, days = 120) {
    return this.http.get<{ date: string; value: number }[]>('inventory', `internal/inventory/ingredients/${ingredientId}/consumption`, { query: { days } });
  }

  async outlet(outletId: string): Promise<OutletInfo> {
    const key = `proc:outlet:${outletId}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as OutletInfo;
    const outlet = await this.http.get<OutletInfo>('order', `internal/outlets/${outletId}`);
    await this.redis.set(key, JSON.stringify(outlet), 'EX', 3600);
    return outlet;
  }

  outletAddress(o: OutletInfo): AddressSnapshot {
    return { line1: o.addressLine1, city: o.city, state: o.state, pincode: o.pincode, lat: o.lat, lng: o.lng, contactName: o.name, contactPhone: o.phone ?? undefined };
  }

  forecast(body: { series: { date: string; value: number }[]; horizonDays: number; category?: string; city?: string; currentStock?: number; tenantId?: string }) {
    return this.http.post<ForecastResponse>('ai', 'internal/ai/forecast/demand', body, { timeoutMs: 10_000 });
  }

  quotes(body: { buyerTenantId: string; category: string; searchTerm?: string; unit: string; quantity: number; pincode?: string; lat?: number; lng?: number; productIds?: string[] }) {
    return this.http.post<Offer[]>('supplier', 'internal/marketplace/quotes', body, { timeoutMs: 8000 });
  }

  rank(body: { offers: Offer[]; quantity: number; strategy: string; tenantId?: string }) {
    return this.http.post<{ options: RankedOption[]; best: Record<string, RankedOption | null> }>('ai', 'internal/ai/suppliers/rank', body, { timeoutMs: 8000 });
  }
}

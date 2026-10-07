import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { canConvert, convertUnit, Unit } from '@foodgrid/utils';
import { TenantDirectory } from '../common/tenant-directory.service';
import { Segment, tierPrice } from '../domain/b2b-pricing';
import { deliveryChargeFor, findZone } from '../domain/logistics';

export interface QuoteRequest {
  buyerTenantId: string;
  category: string;
  searchTerm?: string;
  unit: Unit;
  quantity: number;
  pincode?: string;
  lat?: number;
  lng?: number;
  productIds?: string[];
}

const STOPWORDS = new Set([
  'fresh',
  'refined',
  'pure',
  'premium',
  'loose',
  'pack',
  'packet',
  'grade',
  'the',
  'and',
  'with',
  'for',
]);

/**
 * Builds comparable offers for the procurement engine: unit-converted pack
 * sizes, segment/bulk tier prices at the needed quantity, zone delivery terms
 * and seller KPIs.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantDirectory,
  ) {}

  async quotes(req: QuoteRequest) {
    const buyer = await this.tenants.get(req.buyerTenantId).catch(() => null);
    const segment: Segment =
      buyer?.type === 'RETAILER' || buyer?.type === 'WHOLESALER' ? 'RETAILER' : 'RESTAURANT';
    const words = (req.searchTerm ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

    const base = await this.prisma.product.findMany({
      where: {
        isActive: true,
        stockStatus: { not: 'OUT_OF_STOCK' },
        tenantId: { not: req.buyerTenantId },
        ...(req.productIds?.length
          ? { id: { in: req.productIds } }
          : { category: { code: req.category } }),
      },
      include: { priceTiers: true },
      take: 300,
    });
    const convertible = base.filter((p) => canConvert(p.unit as Unit, req.unit));
    const named = words.length
      ? convertible.filter((p) =>
          words.some((w) => p.name.toLowerCase().includes(w) || p.tags.includes(w)),
        )
      : convertible;
    const products = named.length ? named : convertible;

    const sellerIds = [...new Set(products.map((p) => p.tenantId))];
    const [metrics, zones, dealers] = await Promise.all([
      this.prisma.sellerMetrics.findMany({ where: { tenantId: { in: sellerIds } } }),
      this.prisma.sellerDeliveryZone.findMany({
        where: { tenantId: { in: sellerIds }, isActive: true },
      }),
      this.prisma.dealer.findMany({
        where: { tenantId: { in: sellerIds }, dealerTenantId: req.buyerTenantId, status: 'ACTIVE' },
      }),
    ]);
    const metricBy = new Map(metrics.map((m) => [m.tenantId, m]));
    const dealerBy = new Map(dealers.map((d) => [d.tenantId, d]));

    const offers = [];
    for (const p of products) {
      const sellerZones = zones
        .filter((z) => z.tenantId === p.tenantId)
        .map((z) => ({
          ...z,
          deliveryCharge: Number(z.deliveryCharge),
          freeDeliveryAbove: z.freeDeliveryAbove ? Number(z.freeDeliveryAbove) : null,
          minOrderValue: Number(z.minOrderValue),
        }));
      const zone = sellerZones.length
        ? findZone(sellerZones, { pincode: req.pincode, lat: req.lat, lng: req.lng })
        : null;
      if (sellerZones.length && !zone) continue; // not serviceable
      const baseQtyPerPack = convertUnit(Number(p.packSize), p.unit as Unit, req.unit);
      const packsNeeded = Math.max(Number(p.moq), Math.ceil(req.quantity / baseQtyPerPack));
      const seg: Segment = dealerBy.has(p.tenantId) ? 'DEALER' : segment;
      const tiers = p.priceTiers.map((t) => ({
        minQty: Number(t.minQty),
        maxQty: t.maxQty ? Number(t.maxQty) : null,
        unitPrice: Number(t.unitPrice),
        segment: t.segment as Segment,
        validFrom: t.validFrom,
        validTo: t.validTo,
      }));
      const unitPrice = tierPrice(Number(p.price), tiers, packsNeeded, seg);
      const dealerDiscount = dealerBy.get(p.tenantId)
        ? Number(dealerBy.get(p.tenantId)!.discountPct)
        : 0;
      const m = metricBy.get(p.tenantId);
      offers.push({
        productId: p.id,
        supplierTenantId: p.tenantId,
        supplierName: m?.sellerName ?? 'Seller',
        productName: p.name,
        brand: p.brand,
        sku: p.sku,
        sellerType: p.sellerType,
        unitPrice: Math.round(unitPrice * (1 - dealerDiscount / 100) * 100) / 100,
        baseQtyPerPack,
        moq: Number(p.moq),
        stepQty: Number(p.stepQty),
        gstRate: Number(p.gstRate),
        deliveryCharge: zone ? deliveryChargeFor(zone, 0) : 0,
        freeDeliveryAbove: zone?.freeDeliveryAbove ?? null,
        leadTimeHours: Math.max(p.deliveryTimeHours, zone?.leadTimeHours ?? 0),
        rating: m?.avgRating || p.rating,
        ratingCount: m?.ratingCount ?? p.ratingCount,
        onTimeRate: m?.onTimeRate ?? 1,
        fillRate: m?.fillRate ?? 1,
        stockQty: Number(p.stockQty),
        tiers: tiers
          .filter((t) => t.segment === seg || t.segment === 'ALL')
          .map((t) => ({
            minQty: t.minQty,
            unitPrice: Math.round(t.unitPrice * (1 - dealerDiscount / 100) * 100) / 100,
          })),
      });
    }
    return offers;
  }
}

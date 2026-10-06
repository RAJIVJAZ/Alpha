import { BENGALURU_PINCODES, LOCALITIES, MARKETPLACE_CATEGORIES, PRODUCTS, SELLERS } from './catalog';
import type { SeedContext } from './context';
import { log, slugify } from './lib';

export async function seedMarketplace(ctx: SeedContext) {
  const { prisma, rng } = ctx;

  const categoryIds = new Map<string, string>();
  for (const [i, c] of MARKETPLACE_CATEGORIES.entries()) {
    const cat = await prisma.productCategory.create({
      data: { code: c.code, name: c.name, slug: slugify(c.name), sortOrder: i, imageUrl: `https://cdn.foodgrid.dev/categories/${c.code.toLowerCase()}.png` },
    });
    categoryIds.set(c.code, cat.id);
  }

  const skuCounter = new Map<string, number>();
  for (const p of PRODUCTS) {
    const seller = ctx.sellers.get(p.seller)!;
    const def = SELLERS.find((s) => s.key === p.seller)!;
    const n = (skuCounter.get(p.seller) ?? 0) + 1;
    skuCounter.set(p.seller, n);
    const sku = `${p.seller.slice(0, 3).toUpperCase()}-${p.category.slice(0, 3)}-${n.toString().padStart(3, '0')}`;
    const stockQty = rng.int(40, 900);
    const tiers = (p.tiers ?? []).map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice, segment: t.segment ?? 'ALL' }));
    const product = await prisma.product.create({
      data: {
        tenantId: seller.id, sellerType: def.type, categoryId: categoryIds.get(p.category)!, name: p.name, slug: slugify(`${p.name}-${p.seller}`), sku,
        brand: p.brand, description: `${p.name} from ${def.name}. Sold in packs of ${p.packSize} ${p.unit}.`,
        images: [`https://cdn.foodgrid.dev/products/${slugify(p.name)}.jpg`], unit: p.unit, packSize: p.packSize, price: p.price, mrp: p.mrp ?? null,
        moq: p.moq ?? 1, gstRate: p.gstRate, hsnCode: p.hsn, deliveryTimeHours: p.deliveryTimeHours, stockQty,
        lowStockThreshold: 20, stockStatus: stockQty < 20 ? 'LOW_STOCK' : 'IN_STOCK',
        rating: Math.min(5, Math.round((def.rating + rng.float(-0.25, 0.25)) * 10) / 10), ratingCount: rng.int(6, 120),
        attributes: { packSize: `${p.packSize} ${p.unit}`, origin: def.key === 'konkan' ? 'Maharashtra' : 'Karnataka' }, tags: p.tags ?? [],
        priceTiers: tiers.length ? { create: tiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice, segment: t.segment as 'ALL' })) } : undefined,
      },
    });
    ctx.products.push({
      id: product.id, seller: p.seller, ingredient: p.ingredient, name: p.name, sku, unit: p.unit, packSize: p.packSize, price: p.price, moq: p.moq ?? 1, gstRate: p.gstRate,
      tiers, leadTimeHours: Math.max(p.deliveryTimeHours, def.zone.leadTimeHours),
    });
  }
  log('marketplace products', `${PRODUCTS.length} across ${MARKETPLACE_CATEGORIES.length} categories`);

  for (const s of SELLERS) {
    const seller = ctx.sellers.get(s.key)!;
    const loc = LOCALITIES[s.locality]!;
    const local = s.key === 'lakshmi';
    await prisma.sellerDeliveryZone.create({
      data: {
        tenantId: seller.id, name: local ? 'Jayanagar & nearby (8 km)' : 'Bengaluru city', pincodes: local ? [] : BENGALURU_PINCODES,
        centerLat: local ? loc.lat : null, centerLng: local ? loc.lng : null, radiusKm: local ? 8 : null,
        deliveryCharge: s.zone.deliveryCharge, freeDeliveryAbove: s.zone.freeDeliveryAbove, minOrderValue: s.zone.minOrderValue, leadTimeHours: s.zone.leadTimeHours,
      },
    });
    await prisma.deliverySlot.createMany({
      data: [1, 2, 3, 4, 5, 6].flatMap((day) => [
        { tenantId: seller.id, label: 'Morning', dayOfWeek: day, startTime: '07:00', endTime: '10:00', capacity: 20 },
        { tenantId: seller.id, label: 'Afternoon', dayOfWeek: day, startTime: '14:00', endTime: '17:00', capacity: 15 },
      ]),
    });
    await prisma.sellerMetrics.create({
      data: { tenantId: seller.id, sellerName: s.name, avgRating: s.rating, ratingCount: 0, onTimeRate: s.onTimeRate, fillRate: s.fillRate, avgLeadTimeHours: s.avgLeadTimeHours },
    });
  }

  // wholesaler distribution network
  const bharat = ctx.sellers.get('bharat')!;
  const lakshmi = ctx.sellers.get('lakshmi')!;
  const south = await prisma.territory.create({
    data: { tenantId: bharat.id, name: 'Bengaluru South', code: 'BLR-S', states: ['Karnataka'], cities: ['Bengaluru'], pincodes: ['560041', '560076', '560034', '560102', '560068'], managerUserId: bharat.ownerUserId, monthlyTarget: 1_500_000 },
  });
  const east = await prisma.territory.create({
    data: { tenantId: bharat.id, name: 'Bengaluru East', code: 'BLR-E', states: ['Karnataka'], cities: ['Bengaluru'], pincodes: ['560038', '560066', '560103', '560037'], monthlyTarget: 1_000_000 },
  });
  const onboarded = new Date(ctx.now.getTime() - 120 * 86_400_000);
  await prisma.dealer.createMany({
    data: [
      { tenantId: bharat.id, dealerTenantId: lakshmi.id, name: 'Sri Lakshmi Kirana Stores', contactName: 'Srinivas Rao', phone: '+919900077001', gstin: lakshmi.gstin, city: 'Bengaluru', address: 'Jayanagar 4th Block', territoryId: south.id, tier: 'GOLD', status: 'ACTIVE', creditLimit: 200_000, outstanding: 38_450, paymentTerms: 'NET_15', discountPct: 2, onboardedAt: onboarded },
      { tenantId: bharat.id, name: 'Ganesh Provision Stores', contactName: 'Ganesh Bhat', phone: '+919880011201', city: 'Bengaluru', address: 'BTM 2nd Stage', territoryId: south.id, tier: 'SILVER', status: 'ACTIVE', creditLimit: 75_000, outstanding: 12_200, paymentTerms: 'NET_7', discountPct: 1, onboardedAt: onboarded },
      { tenantId: bharat.id, name: 'HSR Fresh Mart', contactName: 'Anil Kumar', phone: '+919880011202', city: 'Bengaluru', address: 'HSR Sector 2', territoryId: south.id, tier: 'BRONZE', status: 'ACTIVE', creditLimit: 40_000, paymentTerms: 'PREPAID', onboardedAt: onboarded },
      { tenantId: bharat.id, name: 'Indiranagar Super Store', contactName: 'Joseph D Souza', phone: '+919880011203', city: 'Bengaluru', address: 'CMH Road', territoryId: east.id, tier: 'PLATINUM', status: 'ACTIVE', creditLimit: 500_000, outstanding: 142_000, paymentTerms: 'NET_30', discountPct: 3.5, onboardedAt: onboarded },
      { tenantId: bharat.id, name: 'Whitefield Daily Needs', contactName: 'Priya Menon', phone: '+919880011204', city: 'Bengaluru', address: 'Hope Farm Junction', territoryId: east.id, tier: 'BRONZE', status: 'PROSPECT' },
      { tenantId: bharat.id, name: 'Old Airport Road Traders', contactName: 'Farhan Ali', phone: '+919880011205', city: 'Bengaluru', territoryId: east.id, tier: 'SILVER', status: 'INACTIVE', creditLimit: 60_000, paymentTerms: 'NET_7', onboardedAt: onboarded },
    ],
  });
  log('seller zones, slots, territories & dealers', `${SELLERS.length} sellers, 2 territories, 6 dealers`);
}

import { randomBytes } from 'node:crypto';
import { encodeGeohash, haversineKm } from './helpers';
import { CUSTOMER_AREAS, LOCALITIES, MERCHANTS } from './catalog';
import type { MenuItemRef, OutletRef, SeedContext } from './context';
import { addMinutes, istDay, istIsoWeekday, istMidnight, log, r2, slugify } from './lib';

const IMG = 'https://cdn.foodgrid.dev/demo';

export async function seedCommerce(ctx: SeedContext) {
  const { prisma, rng } = ctx;

  for (const m of MERCHANTS) {
    const tenant = ctx.merchants.get(m.key)!;
    for (const def of m.outlets) {
      const loc = LOCALITIES[def.locality]!;
      const lat = loc.lat + def.offset[0];
      const lng = loc.lng + def.offset[1];
      const zoneKey = [...CUSTOMER_AREAS].sort(
        (a, b) => haversineKm({ lat, lng }, LOCALITIES[a]!) - haversineKm({ lat, lng }, LOCALITIES[b]!),
      )[0]!;
      const stations = def.kdsStations ?? ['MAIN'];
      const outlet = await prisma.outlet.create({
        data: {
          tenantId: tenant.id, type: def.type, status: 'ACTIVE', name: def.name, slug: slugify(def.name), description: `${def.cuisines.join(', ')} in ${loc.name}.`,
          cuisines: def.cuisines, tags: def.tags, phone: m.owner.phone, email: m.owner.email, addressLine1: def.addressLine1, addressLine2: loc.name,
          city: loc.city, state: loc.state, stateCode: loc.stateCode, pincode: loc.pincode, lat, lng, geohash: encodeGeohash(lat, lng, 6),
          isPureVeg: def.isPureVeg, costForTwo: def.costForTwo, avgPrepTimeMins: def.avgPrepTimeMins, deliveryRadiusKm: def.type === 'FOOD_CART' ? 4 : 7,
          minOrderValue: def.minOrderValue, packagingCharge: def.packagingCharge, isOpen: true,
          openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: def.hours[0], close: def.hours[1] })),
          fssaiNumber: `1${rng.digits(13)}`, gstin: tenant.gstin, logoUrl: `${IMG}/${def.key}/logo.png`, coverImageUrl: `${IMG}/${def.key}/cover.jpg`,
          images: [`${IMG}/${def.key}/1.jpg`, `${IMG}/${def.key}/2.jpg`], acceptsDelivery: true, acceptsTakeaway: true,
          acceptsDineIn: def.dineIn, acceptsQrOrders: def.qr, isMobile: !!def.isMobile, lastLocationAt: def.isMobile ? addMinutes(ctx.now, -12) : null,
          kdsStations: stations, createdAt: istMidnight(140, ctx.now),
        },
      });

      const items: MenuItemRef[] = [];
      let sku = 0;
      for (const [ci, cat] of def.menu.categories.entries()) {
        const category = await prisma.menuCategory.create({ data: { tenantId: tenant.id, outletId: outlet.id, name: cat.name, sortOrder: ci } });
        for (const [ii, it] of cat.items.entries()) {
          sku++;
          const station = it.station && stations.includes(it.station) ? it.station : 'MAIN';
          const created = await prisma.menuItem.create({
            data: {
              tenantId: tenant.id, outletId: outlet.id, categoryId: category.id, name: it.name, description: it.description ?? null,
              imageUrl: `${IMG}/${def.key}/items/${slugify(it.name)}.jpg`, sku: `${m.key.slice(0, 3).toUpperCase()}-${sku.toString().padStart(3, '0')}`,
              price: it.price, compareAtPrice: it.recommended ? Math.round(it.price * 1.15) : null, isVeg: it.isVeg, isRecommended: !!it.recommended,
              prepTimeMins: it.prepTimeMins ?? def.avgPrepTimeMins, spiceLevel: it.spiceLevel ?? null, kdsStation: station, sortOrder: ii,
              tags: [...(it.recommended ? ['bestseller'] : []), ...(it.isVeg ? ['veg'] : ['non-veg'])],
              variants: it.variants ? { create: it.variants.map((v) => ({ name: v.name, priceDelta: v.priceDelta, isDefault: !!v.isDefault })) } : undefined,
              addonGroups: it.addons
                ? { create: { name: it.addons.group, minSelect: 0, maxSelect: it.addons.maxSelect, addons: { create: it.addons.options.map((o) => ({ name: o.name, price: o.price, isVeg: o.isVeg ?? true })) } } }
                : undefined,
            },
            include: { variants: true, addonGroups: { include: { addons: true } } },
          });
          items.push({
            id: created.id, name: it.name, price: it.price, isVeg: it.isVeg, popularity: it.popularity, station, recipe: it.recipe,
            variants: created.variants.map((v) => ({ id: v.id, name: v.name, priceDelta: Number(v.priceDelta), isDefault: v.isDefault })),
            addons: created.addonGroups.flatMap((g) => g.addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) }))),
          });
        }
      }

      if (def.tables) {
        await prisma.diningTable.createMany({
          data: Array.from({ length: def.tables }, (_, i) => ({
            tenantId: tenant.id, outletId: outlet.id, label: `T${i + 1}`, seats: i % 3 === 0 ? 6 : i % 2 === 0 ? 2 : 4, qrToken: randomBytes(12).toString('base64url'),
          })),
        });
      }

      const ref: OutletRef = {
        id: outlet.id, def, merchant: m, tenantId: tenant.id, locality: loc, lat, lng, zoneKey, items, ingredientIds: new Map(),
        commissionRate: m.commissionRate ?? (m.type === 'FOOD_CART' ? 10 : 18),
      };
      ctx.outlets.push(ref);
    }
  }
  log('outlets', `${ctx.outlets.length} with ${ctx.outlets.reduce((s, o) => s + o.items.length, 0)} menu items`);

  await seedCoupons(ctx);
  await seedPlans(ctx);
}

async function seedCoupons(ctx: SeedContext) {
  const validFrom = istMidnight(60, ctx.now);
  const validTo = istMidnight(-90, ctx.now);
  const sg = ctx.merchants.get('spicegarden')!;
  const defs = [
    { code: 'WELCOME50', title: '₹50 off your first order', type: 'FLAT' as const, value: 50, maxDiscount: null, minOrderValue: 149, perUserLimit: 1, firstOrderOnly: true, fundedBy: 'PLATFORM' as const, tenantId: null },
    { code: 'FOODGRID20', title: '20% off up to ₹100', type: 'PERCENT' as const, value: 20, maxDiscount: 100, minOrderValue: 299, perUserLimit: 5, firstOrderOnly: false, fundedBy: 'PLATFORM' as const, tenantId: null },
    { code: 'FREEDEL', title: 'Free delivery above ₹199', type: 'FREE_DELIVERY' as const, value: 0, maxDiscount: null, minOrderValue: 199, perUserLimit: 3, firstOrderOnly: false, fundedBy: 'PLATFORM' as const, tenantId: null },
    { code: 'UPI30', title: '₹30 off with UPI', type: 'FLAT' as const, value: 30, maxDiscount: null, minOrderValue: 249, perUserLimit: 10, firstOrderOnly: false, fundedBy: 'SHARED' as const, tenantId: null, paymentMethods: ['UPI' as const] },
    { code: 'SPICE15', title: '15% off at Spice Garden', type: 'PERCENT' as const, value: 15, maxDiscount: 75, minOrderValue: 399, perUserLimit: 3, firstOrderOnly: false, fundedBy: 'MERCHANT' as const, tenantId: sg.id },
  ];
  for (const c of defs) {
    const created = await ctx.prisma.coupon.create({
      data: {
        code: c.code, title: c.title, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minOrderValue: c.minOrderValue, perUserLimit: c.perUserLimit,
        firstOrderOnly: c.firstOrderOnly, fundedBy: c.fundedBy, tenantId: c.tenantId, paymentMethods: 'paymentMethods' in c ? c.paymentMethods : [],
        outletIds: c.tenantId ? ctx.outlets.filter((o) => o.tenantId === c.tenantId).map((o) => o.id) : [], usageLimit: c.firstOrderOnly ? null : 5000,
        validFrom, validTo,
      },
    });
    ctx.coupons.set(c.code, { id: created.id, code: c.code, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minOrderValue: c.minOrderValue, fundedBy: c.fundedBy, tenantId: c.tenantId, firstOrderOnly: c.firstOrderOnly });
  }
  await ctx.prisma.coupon.create({
    data: { code: 'MONSOON25', title: 'Monsoon special 25% off', type: 'PERCENT', value: 25, maxDiscount: 120, minOrderValue: 349, validFrom: istMidnight(120, ctx.now), validTo: istMidnight(75, ctx.now), isActive: false },
  });
  log('coupons', defs.length + 1);
}

async function seedPlans(ctx: SeedContext) {
  const { prisma, rng } = ctx;
  const monthly = await prisma.membershipPlan.create({
    data: { code: 'FG_ONE_MONTHLY', name: 'FoodGrid One (Monthly)', description: 'Free delivery above ₹149 and 5% extra off.', price: 99, durationDays: 30, benefits: { freeDeliveryAbove: 149, extraDiscountPct: 5, maxDiscountPerOrder: 50 } },
  });
  await prisma.membershipPlan.create({
    data: { code: 'FG_ONE_QUARTERLY', name: 'FoodGrid One (Quarterly)', description: 'Three months of free delivery and 5% extra off.', price: 249, durationDays: 90, benefits: { freeDeliveryAbove: 149, extraDiscountPct: 5, maxDiscountPerOrder: 50 } },
  });
  for (const c of ctx.customers.filter((x) => x.hasMembership)) {
    const startsAt = istMidnight(rng.int(10, 25), ctx.now);
    const payment = await prisma.payment.create({
      data: {
        purpose: 'MEMBERSHIP', referenceId: 'pending', userId: c.userId, amount: 99, method: 'UPI', provider: 'RAZORPAY', state: 'CAPTURED',
        providerOrderId: `order_${randomBytes(7).toString('hex')}`, providerPaymentId: `pay_${randomBytes(7).toString('hex')}`, capturedAt: startsAt, createdAt: startsAt,
      },
    });
    const m = await prisma.customerMembership.create({
      data: { customerId: c.userId, planId: monthly.id, status: 'ACTIVE', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 86_400_000), paymentId: payment.id, autoRenew: true, createdAt: startsAt },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { referenceId: m.id } });
    c.membershipSince = startsAt;
  }

  const dosa = ctx.outlets.find((o) => o.def.key === 'dosacorner-jayanagar')!;
  const sgk = ctx.outlets.find((o) => o.def.key === 'spicegarden-koramangala')!;
  const pick = (o: typeof dosa, names: string[]) => o.items.filter((i) => names.includes(i.name)).map((i) => i.id);
  const plans = [
    {
      outlet: dosa, name: 'Breakfast Tiffin - 4 weeks', slot: 'BREAKFAST' as const, durationDays: 28, daysOfWeek: [1, 2, 3, 4, 5, 6], pricePerMeal: 99, time: '08:00',
      rotation: { 1: pick(dosa, ['Idli (2 pcs)', 'Filter Coffee']), 2: pick(dosa, ['Masala Dosa']), 3: pick(dosa, ['Medu Vada (2 pcs)', 'Filter Coffee']), 4: pick(dosa, ['Onion Uttapam']), 5: pick(dosa, ['Ghee Roast Dosa']), 6: pick(dosa, ['Idli (2 pcs)', 'Rava Kesari']) },
    },
    {
      outlet: sgk, name: 'Office Lunch Thali - 4 weeks', slot: 'LUNCH' as const, durationDays: 28, daysOfWeek: [1, 2, 3, 4, 5], pricePerMeal: 189, time: '13:00',
      rotation: { 1: pick(sgk, ['Dal Makhani', 'Jeera Rice', 'Tandoori Roti']), 2: pick(sgk, ['Amritsari Chole', 'Jeera Rice']), 3: pick(sgk, ['Paneer Butter Masala', 'Tandoori Roti']), 4: pick(sgk, ['Veg Dum Biryani']), 5: pick(sgk, ['Dal Makhani', 'Butter Naan']) },
    },
  ];
  let subs = 0;
  for (const p of plans) {
    const meals = (p.durationDays / 7) * p.daysOfWeek.length;
    const plan = await prisma.subscriptionPlan.create({
      data: {
        tenantId: p.outlet.tenantId, outletId: p.outlet.id, name: p.name, description: `${meals} meals, ${p.daysOfWeek.length} days a week`, slot: p.slot,
        durationDays: p.durationDays, daysOfWeek: p.daysOfWeek, pricePerMeal: p.pricePerMeal, totalPrice: r2(p.pricePerMeal * meals * 0.95), isVeg: true, menuRotation: p.rotation,
      },
    });
    const subscribers = ctx.customers.filter((c) => haversineKm(c.address, p.outlet) < 6 && c.joinedAt < istMidnight(20, ctx.now)).slice(0, 3);
    for (const c of subscribers) {
      const start = istMidnight(rng.int(6, 14), ctx.now);
      let delivered = 0;
      for (let t = start.getTime(); t < istMidnight(0, ctx.now).getTime(); t += 86_400_000) if (p.daysOfWeek.includes(istIsoWeekday(new Date(t)))) delivered++;
      const amount = r2(p.pricePerMeal * meals * 0.95);
      const payment = await prisma.payment.create({
        data: {
          purpose: 'MEAL_SUBSCRIPTION', referenceId: 'pending', userId: c.userId, tenantId: p.outlet.tenantId, amount, method: 'UPI', provider: 'RAZORPAY', state: 'CAPTURED',
          providerOrderId: `order_${randomBytes(7).toString('hex')}`, providerPaymentId: `pay_${randomBytes(7).toString('hex')}`, capturedAt: start, createdAt: start,
        },
      });
      const sub = await prisma.mealSubscription.create({
        data: {
          tenantId: p.outlet.tenantId, outletId: p.outlet.id, planId: plan.id, customerId: c.userId, status: 'ACTIVE', startDate: istDay(start),
          endDate: istDay(new Date(start.getTime() + p.durationDays * 86_400_000)), slot: p.slot, deliveryTime: p.time, deliveryAddress: c.address, mealsTotal: meals,
          mealsDelivered: delivered, pausedDates: [], paymentId: payment.id, amountPaid: amount, createdAt: start,
        },
      });
      await prisma.payment.update({ where: { id: payment.id }, data: { referenceId: sub.id } });
      subs++;
    }
  }
  log('membership & meal plans', `2 membership plans, ${plans.length} tiffin plans, ${subs} subscriptions`);
}

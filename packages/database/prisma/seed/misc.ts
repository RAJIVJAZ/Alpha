import { randomBytes } from 'node:crypto';
import { dateOnly } from './helpers';
import type { Prisma } from '../../generated/client';
import { FESTIVALS } from './catalog';
import type { SeedContext } from './context';
import { DEMO_CUSTOMER_PHONE } from './identity';
import { addMinutes, istDay, istMidnight, log, r2, Rng } from './lib';
import type { Simulation } from './simulate';

export async function seedSignals(ctx: SeedContext, sim: Simulation) {
  const rows: Prisma.ExternalSignalCreateManyInput[] = FESTIVALS.map((f) => ({
    type: f.type, name: f.name, city: null, date: dateOnly(f.date), impact: f.impact, categories: f.categories ?? [], data: { source: 'seed-calendar' },
  }));
  for (const ymd of sim.rainyDays) {
    rows.push({ type: 'WEATHER', name: 'Rain', city: 'Bengaluru', date: dateOnly(ymd), impact: 1.1, categories: [], data: { source: 'seed-history' } });
  }
  rows.push({ type: 'EVENT', name: 'IPL match at Chinnaswamy Stadium', city: 'Bengaluru', date: istDay(istMidnight(-4, ctx.now)), impact: 1.2, categories: ['BEVERAGES'], data: { venue: 'M. Chinnaswamy Stadium' } });
  await ctx.prisma.externalSignal.createMany({ data: rows, skipDuplicates: true });
  log('demand signals', `${FESTIVALS.length} festivals/holidays, ${sim.rainyDays.size} rainy days, 1 local event`);
}

export async function seedAds(ctx: SeedContext) {
  const { prisma } = ctx;
  const rng = new Rng(55);
  const pizza = ctx.outlets.find((o) => o.def.key === 'pizzarepublic-hsr')!;
  const sgk = ctx.outlets.find((o) => o.def.key === 'spicegarden-koramangala')!;
  const momo = ctx.outlets.find((o) => o.def.key === 'momowagon-koramangala')!;
  const sugar = ctx.products.find((p) => p.seller === 'bharat' && p.ingredient === 'sugar')!;
  const started = istMidnight(14, ctx.now);
  const defs = [
    { tenantId: pizza.tenantId, name: 'Pizza search boost', placement: 'SEARCH_TOP' as const, targetType: 'OUTLET' as const, targetId: pizza.id, bidAmount: 6, dailyBudget: 500, totalBudget: 10_000, keywords: ['pizza', 'italian', 'garlic bread'], ctr: 0.045, cvr: 0.12, aov: 520 },
    { tenantId: sgk.tenantId, name: 'Weekend biryani carousel', placement: 'HOME_CAROUSEL' as const, targetType: 'OUTLET' as const, targetId: sgk.id, bidAmount: 8, dailyBudget: 800, totalBudget: 15_000, keywords: ['biryani', 'north indian'], ctr: 0.032, cvr: 0.1, aov: 640 },
    { tenantId: ctx.sellers.get('bharat')!.id, name: 'Festive sugar stock-up', placement: 'MARKETPLACE_TOP' as const, targetType: 'PRODUCT' as const, targetId: sugar.id, bidAmount: 15, dailyBudget: 600, totalBudget: 9_000, keywords: ['sugar', 'bulk'], ctr: 0.06, cvr: 0.08, aov: 8400 },
  ];
  let events = 0;
  for (const d of defs) {
    const stats: Prisma.AdDailyStatsCreateManyCampaignInput[] = [];
    let spent = 0;
    let spentToday = 0;
    for (let day = 14; day >= 0; day--) {
      const clicksCap = Math.floor(d.dailyBudget / d.bidAmount);
      const impressions = rng.int(1800, 3200);
      const clicks = Math.min(clicksCap, Math.round(impressions * d.ctr * rng.float(0.8, 1.2)));
      const spend = r2(clicks * d.bidAmount * rng.float(0.7, 0.95)); // second-price auctions clear below the bid
      const conversions = Math.round(clicks * d.cvr * rng.float(0.7, 1.3));
      const partial = day === 0 ? 0.4 : 1;
      stats.push({ date: istDay(istMidnight(day, ctx.now)), impressions: Math.round(impressions * partial), clicks: Math.round(clicks * partial), conversions: Math.round(conversions * partial), spend: r2(spend * partial), revenue: r2(conversions * partial * d.aov) });
      spent = r2(spent + spend * partial);
      if (day === 0) spentToday = r2(spend * partial);
    }
    const campaign = await prisma.adCampaign.create({
      data: {
        tenantId: d.tenantId, name: d.name, placement: d.placement, targetType: d.targetType, targetId: d.targetId, status: 'ACTIVE', bidType: 'CPC', bidAmount: d.bidAmount,
        dailyBudget: d.dailyBudget, totalBudget: d.totalBudget, spent, spentToday, spentTodayDate: istDay(ctx.now), keywords: d.keywords, cities: ['Bengaluru'],
        startsAt: started, creative: { headline: d.name, imageUrl: `https://cdn.foodgrid.dev/ads/${d.targetId.slice(0, 8)}.jpg` }, reviewedBy: ctx.adminUserId, createdAt: addMinutes(started, -1440),
        dailyStats: { createMany: { data: stats } },
      },
    });
    await prisma.payment.create({
      data: {
        purpose: 'AD_CAMPAIGN', referenceId: campaign.id, tenantId: d.tenantId, amount: d.totalBudget, method: 'NETBANKING', provider: 'RAZORPAY', state: 'CAPTURED',
        providerOrderId: `order_${randomBytes(7).toString('hex')}`, providerPaymentId: `pay_${randomBytes(7).toString('hex')}`, capturedAt: addMinutes(started, -1400), createdAt: addMinutes(started, -1400),
      },
    });
    // a sample of raw events for the last hour (full history lives in AdDailyStats)
    const raw: Prisma.AdEventCreateManyInput[] = [];
    for (let i = 0; i < 25; i++) {
      const click = i % 5 === 0;
      raw.push({ campaignId: campaign.id, type: click ? 'CLICK' : 'IMPRESSION', cost: click ? r2(d.bidAmount * 0.85) : 0, sessionId: `s_${randomBytes(4).toString('hex')}`, createdAt: addMinutes(ctx.now, -rng.int(1, 60)) });
    }
    await prisma.adEvent.createMany({ data: raw });
    events += raw.length;
  }

  const pending = await prisma.adCampaign.create({
    data: {
      tenantId: momo.tenantId, name: 'Momo Monday', placement: 'CATEGORY_TOP', targetType: 'OUTLET', targetId: momo.id, status: 'PENDING_REVIEW', bidAmount: 4, dailyBudget: 300,
      totalBudget: 3_000, keywords: ['momos', 'tibetan'], cities: ['Bengaluru'], startsAt: istMidnight(-1, ctx.now), creative: { headline: 'Steaming hot momos, 20% off on Mondays' },
    },
  });
  await prisma.approvalRequest.create({
    data: {
      entityType: 'AD_CAMPAIGN', entityId: pending.id, tenantId: momo.tenantId, title: 'Ad campaign: Momo Monday (CATEGORY_TOP)', submittedBy: ctx.merchants.get('momowagon')!.ownerUserId,
      metadata: { placement: 'CATEGORY_TOP', targetType: 'OUTLET', targetId: momo.id, creative: pending.creative as object },
    },
  });
  log('ad campaigns', `${defs.length} active (14 days of stats, ${events} raw events) + 1 pending review`);
}

export async function seedNotifications(ctx: SeedContext) {
  const { prisma } = ctx;
  const demo = ctx.customers.find((c) => c.phone === DEMO_CUSTOMER_PHONE)!;
  const sg = ctx.merchants.get('spicegarden')!;
  await prisma.notification.createMany({
    data: [
      { userId: demo.userId, recipient: demo.userId, channel: 'IN_APP', templateKey: 'promo.welcome', title: 'Welcome to FoodGrid!', body: 'Use WELCOME50 for ₹50 off your first order.', status: 'READ', sentAt: istMidnight(30, ctx.now), readAt: istMidnight(29, ctx.now), createdAt: istMidnight(30, ctx.now) },
      { userId: demo.userId, recipient: demo.userId, channel: 'IN_APP', templateKey: 'order.out_for_delivery', title: 'Your order is on the way', body: 'Your Pizza Republic order has been picked up and is on its way.', status: 'SENT', sentAt: addMinutes(ctx.now, -6), createdAt: addMinutes(ctx.now, -6), data: { deepLink: 'foodgrid://orders' } },
      { userId: sg.ownerUserId, tenantId: sg.id, recipient: sg.ownerUserId, channel: 'IN_APP', templateKey: 'procurement.po_pending_approval', title: 'Purchase order awaiting approval', body: 'The procurement engine drafted a purchase order from this morning\'s reorder alerts.', status: 'SENT', sentAt: addMinutes(istMidnight(0, ctx.now), 6 * 60 + 11), createdAt: addMinutes(istMidnight(0, ctx.now), 6 * 60 + 11) },
      { userId: sg.ownerUserId, tenantId: sg.id, recipient: sg.ownerUserId, channel: 'IN_APP', templateKey: 'inventory.low_stock', title: 'Low stock alerts', body: 'Some ingredients at Spice Garden - Koramangala are below their reorder level.', status: 'SENT', sentAt: addMinutes(istMidnight(0, ctx.now), 6 * 60 + 5), createdAt: addMinutes(istMidnight(0, ctx.now), 6 * 60 + 5) },
    ],
  });
  await prisma.notificationPreference.create({ data: { userId: demo.userId, quietHoursStart: '23:00', quietHoursEnd: '07:00' } });
  await prisma.pushCampaign.createMany({
    data: [
      { title: 'Weekend feast is here', body: 'Flat 20% off on biryanis this weekend. Use FOODGRID20.', app: 'CUSTOMER', audience: { cities: ['Bengaluru'] }, status: 'SENT', scheduledAt: istMidnight(9, ctx.now), sentAt: istMidnight(9, ctx.now), targetCount: ctx.customers.length, sentCount: ctx.customers.length - 2, failedCount: 2, openCount: 11, createdBy: ctx.adminUserId },
      { title: 'Diwali stock-up week', body: 'Bulk prices on ghee, sugar and flour for restaurants.', app: 'MERCHANT', audience: { tenantTypes: ['RESTAURANT', 'FOOD_CART'] }, status: 'SCHEDULED', scheduledAt: istMidnight(-3, ctx.now), createdBy: ctx.adminUserId },
    ],
  });
  log('notifications', '4 inbox items, 2 push campaigns');
}

/** Persists document counters so live services continue numbering after the seeded history. */
export async function seedSequenceCounters(ctx: SeedContext) {
  const rows = [...ctx.counters.entries()].map(([name, value]) => ({ name, value: BigInt(value) }));
  for (let i = 0; i < rows.length; i += 1000) await ctx.prisma.sequenceCounter.createMany({ data: rows.slice(i, i + 1000) });
  log('sequence counters', rows.length);
}

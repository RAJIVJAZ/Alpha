import { CUSTOMER_AREAS, FIRST_NAMES, LAST_NAMES, LOCALITIES, MERCHANTS, SELLERS, STREETS } from './catalog';
import type { CustomerRef, SeedContext, TenantRef } from './context';
import { addMinutes, id, istMidnight, log, makeGstin } from './lib';

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

export const BACK_OFFICE = [
  { name: 'Platform Admin', email: 'admin@foodgrid.dev', phone: '+919900000001', roles: ['ADMIN'] as const },
  { name: 'Finance Team', email: 'finance@foodgrid.dev', phone: '+919900000002', roles: ['FINANCE'] as const },
  { name: 'Operations Team', email: 'ops@foodgrid.dev', phone: '+919900000003', roles: ['OPS'] as const },
  { name: 'Support Desk', email: 'support@foodgrid.dev', phone: '+919900000004', roles: ['SUPPORT'] as const },
];

export const DEMO_CUSTOMER_PHONE = '+919845000001';
// ~400 orders/day across 7 outlets: a few hundred customers keeps order frequency (and retention) realistic
const CUSTOMER_COUNT = 360;

const fssai = (ctx: SeedContext) => `1${ctx.rng.digits(13)}`;

export async function seedIdentity(ctx: SeedContext) {
  const { prisma, rng } = ctx;
  const approvedAt = istMidnight(150, ctx.now);

  // ── back office ──────────────────────────────────────────────────────────
  for (const u of BACK_OFFICE) {
    const user = await prisma.user.create({
      data: { name: u.name, email: u.email, phone: u.phone, roles: [...u.roles], passwordHash: ctx.passwordHash, phoneVerifiedAt: approvedAt, emailVerifiedAt: approvedAt },
    });
    if (u.roles.includes('ADMIN' as never)) ctx.adminUserId = user.id;
  }

  const platformGstin = '29AAACF0000A1ZP';
  const platform = await prisma.tenant.create({
    data: {
      type: 'PLATFORM', status: 'ACTIVE', name: 'FoodGrid', slug: 'foodgrid', legalName: 'FoodGrid Technologies Pvt Ltd',
      gstin: platformGstin, pan: platformGstin.slice(2, 12), email: 'accounts@foodgrid.dev', phone: '+918040000000',
      addressLine1: 'Embassy Tech Village, Outer Ring Road', city: 'Bengaluru', state: 'Karnataka', stateCode: '29', pincode: '560103',
      lat: 12.9327, lng: 77.6929, approvedAt, approvedBy: ctx.adminUserId,
    },
  });
  ctx.platform = { id: platform.id, name: platform.name, legalName: platform.legalName!, gstin: platformGstin, stateCode: '29', ownerUserId: ctx.adminUserId };
  log('back office users', BACK_OFFICE.length);

  // ── merchants (restaurants & food carts) ─────────────────────────────────
  let staffCount = 0;
  for (const m of MERCHANTS) {
    const loc = LOCALITIES[m.locality]!;
    const owner = await prisma.user.create({
      data: { name: m.owner.name, email: m.owner.email, phone: m.owner.phone, passwordHash: ctx.passwordHash, roles: ['CUSTOMER'], phoneVerifiedAt: approvedAt, emailVerifiedAt: approvedAt },
    });
    const gstin = makeGstin(loc.stateCode, m.pan);
    const tenant = await prisma.tenant.create({
      data: {
        type: m.type, status: 'ACTIVE', name: m.name, slug: m.key, legalName: m.legalName, gstin, pan: m.pan, fssaiLicense: fssai(ctx),
        email: m.owner.email, phone: m.owner.phone, addressLine1: m.outlets[0]!.addressLine1, city: loc.city, state: loc.state, stateCode: loc.stateCode,
        pincode: loc.pincode, lat: loc.lat, lng: loc.lng, commissionRate: m.commissionRate ?? null, approvedAt, approvedBy: ctx.adminUserId,
        kycDocuments: [
          { type: 'GST_CERTIFICATE', url: `s3://foodgrid-kyc/${m.key}/gst.pdf`, verified: true },
          { type: 'FSSAI_LICENSE', url: `s3://foodgrid-kyc/${m.key}/fssai.pdf`, verified: true },
          { type: 'PAN', url: `s3://foodgrid-kyc/${m.key}/pan.pdf`, verified: true },
        ],
        settings: { autoAcceptOrders: m.type === 'FOOD_CART', printKotOnAccept: m.type === 'RESTAURANT' },
        members: { create: { userId: owner.id, role: 'OWNER', title: 'Founder' } },
      },
    });
    for (const s of m.staff ?? []) {
      const staff = await prisma.user.create({
        data: { name: s.name, email: s.email, phone: s.phone, passwordHash: ctx.passwordHash, roles: ['CUSTOMER'], phoneVerifiedAt: approvedAt },
      });
      await prisma.tenantMember.create({ data: { tenantId: tenant.id, userId: staff.id, role: s.role, invitedBy: owner.id, title: s.role.replace('_', ' ').toLowerCase() } });
      staffCount++;
    }
    ctx.merchants.set(m.key, { id: tenant.id, name: m.name, legalName: m.legalName, gstin, stateCode: loc.stateCode, ownerUserId: owner.id });
  }
  log('merchant tenants', `${MERCHANTS.length} (+${staffCount} staff)`);

  // ── B2B sellers ──────────────────────────────────────────────────────────
  for (const s of SELLERS) {
    const loc = LOCALITIES[s.locality]!;
    const email = `owner@${s.key}.demo`;
    const phone = `+9199000${(70 + SELLERS.indexOf(s)).toString()}001`;
    const owner = await prisma.user.create({
      data: { name: s.ownerName, email, phone, passwordHash: ctx.passwordHash, roles: ['CUSTOMER'], phoneVerifiedAt: approvedAt, emailVerifiedAt: approvedAt },
    });
    const gstin = makeGstin(loc.stateCode, s.pan);
    const tenant = await prisma.tenant.create({
      data: {
        type: s.type, status: 'ACTIVE', name: s.name, slug: s.key, legalName: s.legalName, gstin, pan: s.pan, fssaiLicense: fssai(ctx),
        email, phone, addressLine1: `${rng.int(10, 240)}, ${loc.name}`, city: loc.city, state: loc.state, stateCode: loc.stateCode, pincode: loc.pincode,
        lat: loc.lat, lng: loc.lng, approvedAt, approvedBy: ctx.adminUserId,
        kycDocuments: [{ type: 'GST_CERTIFICATE', url: `s3://foodgrid-kyc/${s.key}/gst.pdf`, verified: true }],
        members: { create: { userId: owner.id, role: 'OWNER', title: 'Proprietor' } },
      },
    });
    ctx.sellers.set(s.key, { id: tenant.id, name: s.name, legalName: s.legalName, gstin, stateCode: loc.stateCode, ownerUserId: owner.id });
  }
  log('B2B seller tenants', SELLERS.length);

  // ── onboarding queue (pending approvals) ─────────────────────────────────
  const pending = [
    { type: 'RESTAURANT' as const, name: 'Biryani Bros', slug: 'biryani-bros', pan: 'AAQFB2231E', owner: 'Salman Qureshi', email: 'owner@biryanibros.demo', phone: '+919900080001', locality: 'btm' },
    { type: 'SUPPLIER' as const, name: 'GreenLeaf Organics', slug: 'greenleaf-organics', pan: 'AAPFG9087H', owner: 'Ritu Hegde', email: 'owner@greenleaf.demo', phone: '+919900080002', locality: 'hebbal' },
  ];
  for (const p of pending) {
    const loc = LOCALITIES[p.locality]!;
    const owner = await prisma.user.create({ data: { name: p.owner, email: p.email, phone: p.phone, passwordHash: ctx.passwordHash, phoneVerifiedAt: ctx.now } });
    const docs = [
      { type: 'GST_CERTIFICATE', url: `s3://foodgrid-kyc/${p.slug}/gst.pdf` },
      { type: 'FSSAI_LICENSE', url: `s3://foodgrid-kyc/${p.slug}/fssai.pdf` },
      { type: 'CANCELLED_CHEQUE', url: `s3://foodgrid-kyc/${p.slug}/cheque.pdf` },
    ];
    const tenant = await prisma.tenant.create({
      data: {
        type: p.type, status: 'PENDING_APPROVAL', name: p.name, slug: p.slug, legalName: `${p.name} LLP`, gstin: makeGstin(loc.stateCode, p.pan), pan: p.pan,
        fssaiLicense: fssai(ctx), email: p.email, phone: p.phone, addressLine1: `${rng.int(1, 99)}, ${loc.name}`, city: loc.city, state: loc.state,
        stateCode: loc.stateCode, pincode: loc.pincode, lat: loc.lat, lng: loc.lng, kycDocuments: docs,
        members: { create: { userId: owner.id, role: 'OWNER' } },
      },
    });
    await prisma.approvalRequest.create({
      data: {
        entityType: 'TENANT', entityId: tenant.id, tenantId: tenant.id, title: `${p.type === 'SUPPLIER' ? 'Supplier' : 'Restaurant'} onboarding: ${p.name}`,
        submittedBy: owner.id, documents: docs, metadata: { tenantType: p.type, city: loc.city }, createdAt: addMinutes(ctx.now, -rng.int(120, 2000)),
      },
    });
  }
  // a decided one, for the approval history view
  const sg = ctx.merchants.get('spicegarden')!;
  await prisma.approvalRequest.create({
    data: {
      entityType: 'TENANT', entityId: sg.id, tenantId: sg.id, title: 'Restaurant onboarding: Spice Garden', submittedBy: sg.ownerUserId,
      status: 'APPROVED', reviewedBy: ctx.adminUserId, reviewedAt: approvedAt, reviewNotes: 'KYC verified', createdAt: addMinutes(approvedAt, -2880),
    },
  });
  log('pending approvals', pending.length);

  // ── customers ────────────────────────────────────────────────────────────
  const used = new Set<string>();
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    let name: string;
    do name = i === 0 ? 'Aarav Sharma' : `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    while (used.has(name));
    used.add(name);
    const area = CUSTOMER_AREAS[i % CUSTOMER_AREAS.length]!;
    const loc = LOCALITIES[area]!;
    const phone = i === 0 ? DEMO_CUSTOMER_PHONE : `+9198450${(10000 + i).toString()}`;
    const joined = istMidnight(rng.int(35, 400), ctx.now);
    const lat = round5(loc.lat + rng.float(-0.018, 0.018));
    const lng = round5(loc.lng + rng.float(-0.018, 0.018));
    const addressId = id();
    const line1 = `#${rng.int(1, 450)}, ${rng.pick(STREETS)}`;
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${i}@example.com`;
    await prisma.user.create({
      data: {
        name, phone, email, roles: ['CUSTOMER'], phoneVerifiedAt: joined, createdAt: joined, lastLoginAt: addMinutes(ctx.now, -rng.int(30, 7200)),
        referralCode: `FG${name.split(' ')[0]!.toUpperCase().slice(0, 4)}${(100 + i).toString()}`,
        addresses: {
          create: [
            { id: addressId, label: 'Home', contactName: name, contactPhone: phone, line1, landmark: rng.chance(0.5) ? `Near ${rng.pick(['Metro', 'Park', 'Temple', 'Bus Stop', 'Mall'])}` : null, city: loc.city, state: loc.state, pincode: loc.pincode, lat, lng, isDefault: true },
            ...(rng.chance(0.4)
              ? [{ label: 'Work', contactName: name, contactPhone: phone, line1: `${rng.pick(['Prestige', 'Embassy', 'RMZ', 'Bagmane'])} Tech Park, Tower ${rng.pick(['A', 'B', 'C'])}`, city: 'Bengaluru', state: 'Karnataka', pincode: '560103', lat: round5(12.9327 + rng.float(-0.01, 0.01)), lng: round5(77.6929 + rng.float(-0.01, 0.01)) }]
              : []),
          ],
        },
      },
    }).then((u) => {
      const ref: CustomerRef = {
        userId: u.id, name, phone, area, weight: i === 0 ? 1.5 : 1 / (1 + (i % 9)) + rng.float(0.1, 1.2), hasMembership: i % 7 === 0,
        address: { id: addressId, label: 'Home', line1, city: loc.city, state: loc.state, pincode: loc.pincode, lat, lng },
      };
      ctx.customers.push(ref);
    });
  }
  log('customers', ctx.customers.length);

  // ── CMS ──────────────────────────────────────────────────────────────────
  const published = istMidnight(90, ctx.now);
  await prisma.cmsPage.createMany({
    data: [
      { slug: 'about', title: 'About FoodGrid', body: '# About FoodGrid\n\nFoodGrid connects hungry customers, restaurants, food carts and the suppliers that keep their kitchens running.', status: 'PUBLISHED', audience: 'ALL', publishedAt: published, updatedBy: ctx.adminUserId },
      { slug: 'terms', title: 'Terms of Service', body: '# Terms of Service\n\nThese demo terms are placeholders. Replace them with terms reviewed by counsel before launch.', status: 'PUBLISHED', audience: 'ALL', publishedAt: published, updatedBy: ctx.adminUserId },
      { slug: 'privacy', title: 'Privacy Policy', body: '# Privacy Policy\n\nThis demo policy is a placeholder. Describe data collected, purposes, retention and grievance officer contact as required by the DPDP Act, 2023.', status: 'PUBLISHED', audience: 'ALL', publishedAt: published, updatedBy: ctx.adminUserId },
      { slug: 'merchant-faq', title: 'Merchant FAQ', body: '## When are settlements paid?\n\nSettlements are generated every Monday for the previous week and paid within 2 working days.\n\n## How is commission charged?\n\nCommission is charged on food value after merchant-funded discounts, plus 18% GST.', status: 'PUBLISHED', audience: 'MERCHANT', publishedAt: published, updatedBy: ctx.adminUserId },
      { slug: 'rider-handbook', title: 'Rider Handbook', body: '## Safety first\n\nAlways wear a helmet. Never use the phone while riding.\n\n## Payouts\n\nEarnings are credited to your wallet daily; withdraw any time to your UPI ID.', status: 'PUBLISHED', audience: 'RIDER', publishedAt: published, updatedBy: ctx.adminUserId },
      { slug: 'festive-offers', title: 'Festive Offers', body: 'Draft copy for the Diwali campaign.', status: 'DRAFT', audience: 'CUSTOMER', updatedBy: ctx.adminUserId },
    ],
  });
  await prisma.cmsBanner.createMany({
    data: [
      { title: 'Flat ₹50 off your first order', subtitle: 'Use code WELCOME50', imageUrl: 'https://cdn.foodgrid.dev/banners/welcome50.jpg', linkUrl: 'foodgrid://offers/WELCOME50', placement: 'HOME_HERO', cities: ['Bengaluru'], sortOrder: 1 },
      { title: 'FoodGrid One: free delivery all month', subtitle: 'Join for ₹99', imageUrl: 'https://cdn.foodgrid.dev/banners/one.jpg', linkUrl: 'foodgrid://membership', placement: 'HOME_HERO', cities: [], sortOrder: 2 },
      { title: 'Breakfast from ₹49', subtitle: 'Idli, dosa & filter coffee', imageUrl: 'https://cdn.foodgrid.dev/banners/breakfast.jpg', linkUrl: 'foodgrid://collections/breakfast', placement: 'HOME_STRIP', cities: ['Bengaluru'], sortOrder: 1 },
      { title: 'Stock up before Diwali', subtitle: 'Bulk prices on ghee, sugar & flour', imageUrl: 'https://cdn.foodgrid.dev/banners/diwali-b2b.jpg', linkUrl: '/marketplace?category=DAIRY', placement: 'MARKETPLACE_HERO', audience: 'MERCHANT', sortOrder: 1 },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { actorId: ctx.adminUserId, tenantId: sg.id, action: 'tenant.approved', entityType: 'Tenant', entityId: sg.id, changes: { status: ['PENDING_APPROVAL', 'ACTIVE'] }, createdAt: approvedAt },
      { actorId: ctx.adminUserId, action: 'cms.page.published', entityType: 'CmsPage', entityId: 'terms', createdAt: published },
    ],
  });
}

export type { TenantRef };

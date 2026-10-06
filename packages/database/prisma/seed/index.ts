/**
 * FoodGrid demo seed.
 *
 *   pnpm --filter @foodgrid/database db:seed            # seeds an empty database
 *   pnpm --filter @foodgrid/database db:seed -- --reset # wipes all FoodGrid schemas first
 *
 * Produces a coherent, deterministic data set: merchants with menus and
 * recipes, B2B sellers with catalogs, customers, riders, 90 days of
 * ingredient consumption (the forecasting training series), 30 days of
 * orders with payments, deliveries, reviews, settlements and GST invoices,
 * purchase orders flowing into B2B orders, and the analytics read models
 * derived from all of it. Never run against production.
 */
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { createPrismaClient } from '../../src/client';
import { seedCommerce } from './commerce';
import { createContext } from './context';
import { assertOutletsInZones, seedDelivery } from './delivery';
import { seedAnalyticsAggregates, seedCommissionRules, seedSettlements } from './finance';
import { BACK_OFFICE, DEMO_CUSTOMER_PHONE, seedIdentity } from './identity';
import { seedInventory } from './inventory';
import { seedMarketplace } from './marketplace';
import { seedAds, seedNotifications, seedSequenceCounters, seedSignals } from './misc';
import { seedOrders } from './orders';
import { simulate } from './simulate';

// Same env resolution as prisma.config.ts: package .env first, then the monorepo root.
config({ path: [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../../../../.env')], quiet: true });

const SCHEMAS = ['identity', 'commerce', 'payments', 'delivery', 'inventory', 'procurement', 'marketplace', 'analytics', 'ads', 'notifications', 'ai', 'platform'];
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'FoodGrid@2026';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Refusing to seed with NODE_ENV=production (set ALLOW_PRODUCTION_SEED=true to override).');
  }
  const reset = process.argv.includes('--reset');
  const prisma = createPrismaClient({ log: ['warn', 'error'] });
  const started = Date.now();
  try {
    const existing = await prisma.user.count();
    if (existing > 0 && !reset) {
      console.log(`Database already has ${existing} users — skipping seed. Re-run with --reset to wipe and reseed.`);
      return;
    }
    if (reset) {
      const tables = await prisma.$queryRaw<{ schemaname: string; tablename: string }[]>`
        SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ANY(${SCHEMAS}::text[])`;
      if (tables.length) {
        await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.schemaname}"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
      }
      console.log(`Reset ${tables.length} tables.`);
    }

    console.log('Seeding FoodGrid demo data…');
    const ctx = createContext(prisma, await bcrypt.hash(DEMO_PASSWORD, 10));
    await seedIdentity(ctx);
    await seedDelivery(ctx);
    await seedCommerce(ctx);
    await assertOutletsInZones(ctx);
    await seedMarketplace(ctx);
    await seedCommissionRules(ctx);
    const sim = simulate(ctx);
    const inventory = await seedInventory(ctx, sim);
    await seedOrders(ctx, sim, inventory);
    await seedSettlements(ctx);
    await seedAnalyticsAggregates(ctx);
    await seedSignals(ctx, sim);
    await seedAds(ctx);
    await seedNotifications(ctx);
    await seedSequenceCounters(ctx);

    console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`);
    console.log(`Back office (password "${DEMO_PASSWORD}"):`);
    for (const u of BACK_OFFICE) console.log(`  ${u.roles.join(',').padEnd(8)} ${u.email}`);
    console.log(`Merchants & sellers use the same password, e.g. owner@spicegarden.demo, chef@spicegarden.demo, owner@annapurna.demo, owner@bharat.demo`);
    console.log(`Demo customer: ${DEMO_CUSTOMER_PHONE} (OTP login; set OTP_EXPOSE_IN_RESPONSE=true locally to receive the code in the API response)`);
    console.log(`Riders: ${ctx.riders[0]!.phone} … (OTP login)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

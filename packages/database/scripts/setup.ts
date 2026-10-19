/**
 * First-time production setup, safe to run again. It creates only what an empty production
 * database needs before real people can use it (never demo data):
 *
 * - the first admin account (email + password login to admin-web), or adds ADMIN to an
 *   existing account with that email;
 * - one city-wide delivery zone: deliveries are only quoted for pickups inside an active
 *   zone, and admin-web has no screen for zones yet.
 *
 *   DATABASE_URL=<postgres url> ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" \
 *   ADMIN_PASSWORD='<12+ characters>' pnpm --filter @foodgrid/database db:setup
 *
 * Zone options (default: Prayagraj, 15 km around the city centre; ZONE_CITY=Bengaluru is the
 * other preset; ZONE_CITY=none skips it). Any other city needs its centre:
 *   ZONE_CITY=Lucknow ZONE_LAT=26.8467 ZONE_LNG=80.9462 ZONE_RADIUS_KM=18
 * An existing admin's password is only replaced with ADMIN_RESET_PASSWORD=true.
 */
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { createPrismaClient } from '../src/client';
import { circleZone, readSetupConfig } from './setup-lib';

// same env resolution as the seed: package .env first, then the monorepo root
config({
  path: [path.resolve(__dirname, '../.env'), path.resolve(__dirname, '../../../.env')],
  quiet: true,
});

async function main() {
  const { admin, zone } = readSetupConfig(process.env);
  const prisma = createPrismaClient({ log: ['warn', 'error'] });
  try {
    if (admin) {
      const existing = await prisma.user.findUnique({ where: { email: admin.email } });
      if (!existing && !admin.password)
        throw new Error('Set ADMIN_PASSWORD (12+ characters) to create the admin account');
      const passwordHash =
        admin.password && (!existing?.passwordHash || admin.resetPassword)
          ? await bcrypt.hash(admin.password, 12)
          : undefined;
      if (existing) {
        const roles = existing.roles.includes('ADMIN')
          ? existing.roles
          : [...existing.roles, 'ADMIN' as const];
        await prisma.user.update({
          where: { id: existing.id },
          data: { roles, status: 'ACTIVE', ...(passwordHash ? { passwordHash } : {}) },
        });
        console.log(
          `Admin: ${admin.email} already existed; roles ${roles.join(', ')}` +
            (passwordHash ? '; password set' : '; password unchanged'),
        );
      } else {
        await prisma.user.create({
          data: {
            email: admin.email,
            name: admin.name,
            passwordHash,
            roles: ['ADMIN'],
            emailVerifiedAt: new Date(),
          },
        });
        console.log(
          `Admin: created ${admin.email}. Sign in to admin-web with this email and password.`,
        );
      }
    }
    if (zone) {
      const name = `${zone.city} (city-wide)`;
      const data = {
        name,
        city: zone.city,
        polygon: circleZone(zone, zone.radiusKm),
        centerLat: zone.lat,
        centerLng: zone.lng,
        isActive: true,
      };
      const found = await prisma.deliveryZone.findFirst({ where: { name } });
      if (found) await prisma.deliveryZone.update({ where: { id: found.id }, data });
      else await prisma.deliveryZone.create({ data });
      console.log(
        `Delivery zone: ${found ? 'updated' : 'created'} "${name}", ${zone.radiusKm} km around ` +
          `${zone.lat}, ${zone.lng}. Restaurants inside it can take delivery orders within a minute.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(`Setup failed:\n${e.message}`);
  process.exit(1);
});

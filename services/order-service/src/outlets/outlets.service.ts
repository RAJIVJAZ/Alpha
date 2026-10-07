import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import {
  conflict,
  encodeGeohash,
  isWithinOpeningHours,
  notFound,
  OpeningWindow,
} from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { assertOutletAccess } from '../common/outlet-access';
import { CreateOutletDto, OutletLocationDto, UpdateOutletDto } from './dto/outlet.dto';

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60);

@Injectable()
export class OutletsService {
  private readonly logger = new Logger(OutletsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  // ─── merchant ──────────────────────────────────────────────────────────────
  async create(user: AccessTokenClaims, dto: CreateOutletDto) {
    if (user.tenantType === 'FOOD_CART' && dto.type !== 'FOOD_CART') {
      throw conflict(
        'Food cart businesses can only create food cart outlets',
        'OUTLET_TYPE_MISMATCH',
      );
    }
    const { openingHours, costForTwo, minOrderValue, packagingCharge, ...rest } = dto;
    return this.prisma.forTenant(user.tenantId!).outlet.create({
      data: {
        ...rest,
        tenantId: user.tenantId!,
        slug: `${slugify(dto.name)}-${randomBytes(3).toString('hex')}`,
        geohash: encodeGeohash(dto.lat, dto.lng, 9),
        isMobile: dto.type === 'FOOD_CART',
        openingHours: (openingHours ?? []) as unknown as Prisma.InputJsonValue,
        costForTwo,
        minOrderValue,
        packagingCharge,
        status: 'DRAFT',
      },
    });
  }

  listMine(user: AccessTokenClaims) {
    return this.prisma.forTenant(user.tenantId!).outlet.findMany({
      where: user.outletIds?.length ? { id: { in: user.outletIds } } : {},
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { items: true, tables: true } } },
    });
  }

  async update(user: AccessTokenClaims, id: string, dto: UpdateOutletDto) {
    await assertOutletAccess(this.prisma, user, id);
    const { openingHours, ...rest } = dto;
    return this.prisma.forTenant(user.tenantId!).outlet.update({
      where: { id },
      data: {
        ...rest,
        ...(dto.lat !== undefined && dto.lng !== undefined
          ? { geohash: encodeGeohash(dto.lat, dto.lng, 9) }
          : {}),
        ...(openingHours ? { openingHours: openingHours as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  /** Sends the outlet to the admin approval queue. */
  async submit(user: AccessTokenClaims, id: string) {
    const outlet = await assertOutletAccess(this.prisma, user, id);
    if (!['DRAFT', 'PAUSED'].includes(outlet.status))
      throw conflict(`Outlet is ${outlet.status}`, 'OUTLET_STATE');
    const items = await this.prisma.menuItem.count({ where: { outletId: id } });
    if (!items) throw conflict('Add at least one menu item before submitting', 'MENU_EMPTY');
    await this.internal.post('user', 'internal/approvals', {
      entityType: 'OUTLET',
      entityId: id,
      tenantId: outlet.tenantId,
      title: `${outlet.type.replace('_', ' ')} listing: ${outlet.name} (${outlet.city})`,
      submittedBy: user.sub,
      metadata: {
        city: outlet.city,
        cuisines: outlet.cuisines,
        fssai: outlet.fssaiNumber,
        menuItems: items,
      },
    });
    return this.prisma.outlet.update({ where: { id }, data: { status: 'PENDING_APPROVAL' } });
  }

  async setAvailability(user: AccessTokenClaims, id: string, isOpen: boolean) {
    const outlet = await assertOutletAccess(this.prisma, user, id);
    if (isOpen && outlet.status !== 'ACTIVE')
      throw conflict('Outlet is not live yet', 'OUTLET_NOT_ACTIVE');
    return this.prisma.outlet.update({ where: { id }, data: { isOpen } });
  }

  async pause(user: AccessTokenClaims, id: string, paused: boolean) {
    const outlet = await assertOutletAccess(this.prisma, user, id);
    if (paused && outlet.status !== 'ACTIVE')
      throw conflict('Only live outlets can be paused', 'OUTLET_STATE');
    if (!paused && outlet.status !== 'PAUSED')
      throw conflict('Outlet is not paused', 'OUTLET_STATE');
    return this.prisma.outlet.update({
      where: { id },
      data: { status: paused ? 'PAUSED' : 'ACTIVE', isOpen: paused ? false : outlet.isOpen },
    });
  }

  /** Food carts move around: the vendor app pushes the current spot. */
  async updateLocation(user: AccessTokenClaims, id: string, dto: OutletLocationDto) {
    const outlet = await assertOutletAccess(this.prisma, user, id);
    if (!outlet.isMobile)
      throw conflict('Only mobile outlets (food carts) can move', 'OUTLET_NOT_MOBILE');
    return this.prisma.outlet.update({
      where: { id },
      data: {
        lat: dto.lat,
        lng: dto.lng,
        geohash: encodeGeohash(dto.lat, dto.lng, 9),
        lastLocationAt: new Date(),
        ...(dto.addressLine1 ? { addressLine1: dto.addressLine1 } : {}),
      },
    });
  }

  // ─── public ───────────────────────────────────────────────────────────────
  async publicDetails(idOrSlug: string) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (!outlet) throw notFound('Outlet', idOrSlug);
    const { commissionRate: _c, tenantId: _t, ...pub } = outlet;
    return {
      ...pub,
      tenantId: outlet.tenantId,
      isOpenNow:
        outlet.status === 'ACTIVE' &&
        outlet.isOpen &&
        isWithinOpeningHours(outlet.openingHours as unknown as OpeningWindow[]),
    };
  }

  async publicMenu(idOrSlug: string) {
    const outlet = await this.publicDetails(idOrSlug);
    const categories = await this.prisma.menuCategory.findMany({
      where: { outletId: outlet.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            variants: { where: { isAvailable: true } },
            addonGroups: { include: { addons: { where: { isAvailable: true } } } },
          },
        },
      },
    });
    const recommended = categories
      .flatMap((c) => c.items)
      .filter((i) => i.isRecommended && i.isAvailable);
    return { outlet, recommended, categories: categories.filter((c) => c.items.length) };
  }
}

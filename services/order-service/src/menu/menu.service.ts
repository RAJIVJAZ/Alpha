import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import { badRequest, notFound } from '@foodgrid/utils';
import { assertOutletAccess } from '../common/outlet-access';
import { AddonGroupDto, BulkAvailabilityDto, CategoryDto, MenuItemDto, UpdateCategoryDto, UpdateMenuItemDto, VariantDto } from './dto/menu.dto';

const ITEM_INCLUDE = { variants: true, addonGroups: { include: { addons: true } } } satisfies Prisma.MenuItemInclude;

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async fullMenu(user: AccessTokenClaims, outletId: string) {
    await assertOutletAccess(this.prisma, user, outletId);
    return this.prisma.forTenant(user.tenantId!).menuCategory.findMany({
      where: { outletId },
      orderBy: { sortOrder: 'asc' },
      include: { items: { orderBy: { sortOrder: 'asc' }, include: ITEM_INCLUDE } },
    });
  }

  async createCategory(user: AccessTokenClaims, outletId: string, dto: CategoryDto) {
    await assertOutletAccess(this.prisma, user, outletId);
    return this.prisma.forTenant(user.tenantId!).menuCategory.create({ data: { ...dto, outletId, tenantId: user.tenantId! } });
  }

  async updateCategory(user: AccessTokenClaims, id: string, dto: UpdateCategoryDto) {
    const cat = await this.prisma.forTenant(user.tenantId!).menuCategory.findUnique({ where: { id } });
    if (!cat) throw notFound('Category', id);
    await assertOutletAccess(this.prisma, user, cat.outletId);
    return this.prisma.menuCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(user: AccessTokenClaims, id: string) {
    const cat = await this.prisma.forTenant(user.tenantId!).menuCategory.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
    if (!cat) throw notFound('Category', id);
    await assertOutletAccess(this.prisma, user, cat.outletId);
    if (cat._count.items) throw badRequest('Move or delete the items in this category first', 'CATEGORY_NOT_EMPTY');
    await this.prisma.menuCategory.delete({ where: { id } });
  }

  async createItem(user: AccessTokenClaims, outletId: string, dto: MenuItemDto) {
    const outlet = await assertOutletAccess(this.prisma, user, outletId);
    await this.assertCategory(user.tenantId!, outletId, dto.categoryId);
    this.validateStation(outlet.kdsStations, dto.kdsStation);
    const { variants, addonGroups, ...data } = dto;
    return this.prisma.menuItem.create({
      data: {
        ...data,
        outletId,
        tenantId: user.tenantId!,
        variants: variants?.length ? { create: variants.map(stripId) } : undefined,
        addonGroups: addonGroups?.length ? { create: addonGroups.map(toAddonGroupCreate) } : undefined,
      },
      include: ITEM_INCLUDE,
    });
  }

  async updateItem(user: AccessTokenClaims, id: string, dto: UpdateMenuItemDto) {
    const item = await this.prisma.forTenant(user.tenantId!).menuItem.findUnique({ where: { id } });
    if (!item) throw notFound('Menu item', id);
    const outlet = await assertOutletAccess(this.prisma, user, item.outletId);
    if (dto.categoryId) await this.assertCategory(user.tenantId!, item.outletId, dto.categoryId);
    this.validateStation(outlet.kdsStations, dto.kdsStation);
    const { variants, addonGroups, ...data } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (variants) {
        await tx.menuItemVariant.deleteMany({ where: { menuItemId: id } });
        if (variants.length) await tx.menuItemVariant.createMany({ data: variants.map((v) => ({ ...stripId(v), menuItemId: id })) });
      }
      if (addonGroups) {
        await tx.menuAddonGroup.deleteMany({ where: { menuItemId: id } });
        for (const g of addonGroups) await tx.menuAddonGroup.create({ data: { ...toAddonGroupCreate(g), menuItemId: id } });
      }
      return tx.menuItem.update({ where: { id }, data, include: ITEM_INCLUDE });
    });
  }

  async deleteItem(user: AccessTokenClaims, id: string) {
    const item = await this.prisma.forTenant(user.tenantId!).menuItem.findUnique({ where: { id } });
    if (!item) throw notFound('Menu item', id);
    await assertOutletAccess(this.prisma, user, item.outletId);
    await this.prisma.menuItem.delete({ where: { id } });
  }

  /** "86" items in bulk when the kitchen runs out. */
  async bulkAvailability(user: AccessTokenClaims, dto: BulkAvailabilityDto) {
    const res = await this.prisma.forTenant(user.tenantId!).menuItem.updateMany({
      where: { id: { in: dto.itemIds }, ...(user.outletIds?.length ? { outletId: { in: user.outletIds } } : {}) },
      data: { isAvailable: dto.isAvailable },
    });
    return { updated: res.count };
  }

  private async assertCategory(tenantId: string, outletId: string, categoryId: string) {
    const cat = await this.prisma.forTenant(tenantId).menuCategory.findUnique({ where: { id: categoryId } });
    if (!cat || cat.outletId !== outletId) throw badRequest('Category does not belong to this outlet', 'INVALID_CATEGORY');
  }

  private validateStation(stations: string[], station?: string) {
    if (station && !stations.includes(station)) {
      throw badRequest(`Unknown KDS station ${station}. Configure it on the outlet first.`, 'INVALID_STATION');
    }
  }
}

const stripId = ({ id: _id, ...v }: VariantDto) => v;
const toAddonGroupCreate = (g: AddonGroupDto) => ({
  name: g.name,
  minSelect: g.minSelect ?? 0,
  maxSelect: Math.max(g.maxSelect ?? 1, g.minSelect ?? 0),
  addons: { create: g.addons },
});

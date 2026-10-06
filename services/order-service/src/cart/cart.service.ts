import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@foodgrid/database/nest';
import type { MenuAddon, MenuAddonGroup, MenuItem, MenuItemVariant, Outlet } from '@foodgrid/database';
import { badRequest, conflict, notFound, round2 } from '@foodgrid/utils';
import { REDIS } from '@foodgrid/utils/server';
import { AddCartItemDto } from './dto/cart.dto';

interface StoredLine {
  lineId: string;
  menuItemId: string;
  quantity: number;
  variantId?: string;
  addonIds?: string[];
  notes?: string;
}

interface StoredCart {
  outletId: string | null;
  lines: StoredLine[];
  couponCode: string | null;
  updatedAt: string;
}

type ItemWithOptions = MenuItem & {
  variants: MenuItemVariant[];
  addonGroups: (MenuAddonGroup & { addons: MenuAddon[] })[];
};

export interface ResolvedLine {
  lineId: string;
  item: ItemWithOptions;
  variant: MenuItemVariant | null;
  addons: MenuAddon[];
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface HydratedCart {
  outlet: Outlet | null;
  lines: ResolvedLine[];
  couponCode: string | null;
  removed: string[];
}

const CART_TTL_SECONDS = 7 * 24 * 3600;
const MAX_LINES = 50;
const key = (userId: string) => `cart:${userId}`;

/**
 * Carts live in Redis (hot, ephemeral) and are re-priced from the database on
 * every read so customers always see current prices and availability.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private async load(userId: string): Promise<StoredCart> {
    const raw = await this.redis.get(key(userId));
    return raw ? (JSON.parse(raw) as StoredCart) : { outletId: null, lines: [], couponCode: null, updatedAt: new Date().toISOString() };
  }

  private async save(userId: string, cart: StoredCart) {
    if (!cart.lines.length) {
      await this.redis.del(key(userId));
      return;
    }
    cart.updatedAt = new Date().toISOString();
    await this.redis.set(key(userId), JSON.stringify(cart), 'EX', CART_TTL_SECONDS);
  }

  async hydrate(userId: string): Promise<HydratedCart> {
    const stored = await this.load(userId);
    if (!stored.outletId || !stored.lines.length) return { outlet: null, lines: [], couponCode: stored.couponCode, removed: [] };
    const [outlet, items] = await Promise.all([
      this.prisma.outlet.findUnique({ where: { id: stored.outletId } }),
      this.prisma.menuItem.findMany({
        where: { id: { in: stored.lines.map((l) => l.menuItemId) } },
        include: { variants: true, addonGroups: { include: { addons: true } } },
      }),
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));
    const removed: string[] = [];
    const lines: ResolvedLine[] = [];
    for (const line of stored.lines) {
      const item = byId.get(line.menuItemId);
      if (!item || !item.isAvailable) {
        removed.push(item?.name ?? 'An item');
        continue;
      }
      const variant = line.variantId ? item.variants.find((v) => v.id === line.variantId && v.isAvailable) ?? null : null;
      if (line.variantId && !variant) {
        removed.push(item.name);
        continue;
      }
      const allAddons = item.addonGroups.flatMap((g) => g.addons);
      const addons = (line.addonIds ?? []).map((id) => allAddons.find((a) => a.id === id && a.isAvailable)).filter(Boolean) as MenuAddon[];
      lines.push({
        lineId: line.lineId,
        item,
        variant,
        addons,
        quantity: line.quantity,
        unitPrice: unitPrice(item, variant, addons),
        notes: line.notes,
      });
    }
    if (removed.length) {
      stored.lines = stored.lines.filter((l) => lines.some((r) => r.lineId === l.lineId));
      await this.save(userId, stored);
    }
    return { outlet, lines, couponCode: stored.couponCode, removed };
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: dto.menuItemId },
      include: { outlet: true, variants: true, addonGroups: { include: { addons: true } } },
    });
    if (!item) throw notFound('Menu item', dto.menuItemId);
    if (!item.isAvailable) throw conflict(`${item.name} is currently unavailable`, 'ITEM_UNAVAILABLE');
    if (item.outlet.status !== 'ACTIVE') throw conflict('This outlet is not accepting orders', 'OUTLET_UNAVAILABLE');
    validateOptions(item, dto.variantId, dto.addonIds ?? []);

    const cart = await this.load(userId);
    if (cart.outletId && cart.outletId !== item.outletId && cart.lines.length) {
      if (!dto.replace) {
        throw conflict('Your cart has items from another outlet. Replace them?', 'CART_OUTLET_MISMATCH');
      }
      cart.lines = [];
      cart.couponCode = null;
    }
    cart.outletId = item.outletId;
    const addonKey = [...(dto.addonIds ?? [])].sort().join(',');
    const same = cart.lines.find(
      (l) =>
        l.menuItemId === dto.menuItemId &&
        (l.variantId ?? '') === (dto.variantId ?? '') &&
        [...(l.addonIds ?? [])].sort().join(',') === addonKey &&
        (l.notes ?? '') === (dto.notes ?? ''),
    );
    if (same) same.quantity = Math.min(50, same.quantity + dto.quantity);
    else {
      if (cart.lines.length >= MAX_LINES) throw badRequest('Cart is full', 'CART_FULL');
      cart.lines.push({
        lineId: randomUUID(),
        menuItemId: dto.menuItemId,
        quantity: dto.quantity,
        variantId: dto.variantId,
        addonIds: dto.addonIds,
        notes: dto.notes,
      });
    }
    await this.save(userId, cart);
  }

  async updateLine(userId: string, lineId: string, quantity: number) {
    const cart = await this.load(userId);
    const line = cart.lines.find((l) => l.lineId === lineId);
    if (!line) throw notFound('Cart line', lineId);
    if (quantity === 0) cart.lines = cart.lines.filter((l) => l.lineId !== lineId);
    else line.quantity = quantity;
    await this.save(userId, cart);
  }

  async setCoupon(userId: string, code: string | null) {
    const cart = await this.load(userId);
    if (!cart.lines.length) throw badRequest('Cart is empty', 'CART_EMPTY');
    cart.couponCode = code?.toUpperCase() ?? null;
    await this.save(userId, cart);
  }

  async clear(userId: string) {
    await this.redis.del(key(userId));
  }

  /** Replaces the cart with the given lines (used by reorder). */
  async replaceWith(userId: string, outletId: string, lines: Omit<StoredLine, 'lineId'>[]) {
    await this.save(userId, {
      outletId,
      lines: lines.map((l) => ({ ...l, lineId: randomUUID() })),
      couponCode: null,
      updatedAt: new Date().toISOString(),
    });
  }
}

export function unitPrice(item: MenuItem, variant: MenuItemVariant | null, addons: MenuAddon[]): number {
  return round2(Number(item.price) + Number(variant?.priceDelta ?? 0) + addons.reduce((s, a) => s + Number(a.price), 0));
}

export function validateOptions(item: ItemWithOptions, variantId: string | undefined, addonIds: string[]) {
  if (variantId && !item.variants.some((v) => v.id === variantId && v.isAvailable)) {
    throw badRequest('Invalid or unavailable variant', 'INVALID_VARIANT');
  }
  if (!variantId && item.variants.length && !item.variants.some((v) => v.isDefault)) {
    throw badRequest(`Choose an option for ${item.name}`, 'VARIANT_REQUIRED');
  }
  const unique = new Set(addonIds);
  if (unique.size !== addonIds.length) throw badRequest('Duplicate add-ons', 'INVALID_ADDONS');
  const known = new Set(item.addonGroups.flatMap((g) => g.addons.filter((a) => a.isAvailable).map((a) => a.id)));
  for (const id of addonIds) if (!known.has(id)) throw badRequest('Invalid or unavailable add-on', 'INVALID_ADDONS');
  for (const group of item.addonGroups) {
    const picked = group.addons.filter((a) => unique.has(a.id)).length;
    if (picked < group.minSelect || picked > group.maxSelect) {
      throw badRequest(
        `Select ${group.minSelect === group.maxSelect ? group.minSelect : `${group.minSelect}-${group.maxSelect}`} option(s) for ${group.name}`,
        'ADDON_SELECTION',
      );
    }
  }
}

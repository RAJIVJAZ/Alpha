import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { generateDocumentNumber, Prisma } from '@foodgrid/database';
import type { ActorType, Outlet } from '@foodgrid/database';
import type { OrderChannel, OrderStatus, OrderType, PaymentMethod } from '@foodgrid/types';
import { badRequest, conflict, round2 } from '@foodgrid/utils';
import { unitPrice, validateOptions } from '../cart/cart.service';
import { toMoney } from '../common/money';
import { computePricing } from '../domain/pricing';
import { OrderLifecycleService, OrderWithItems } from './order-lifecycle.service';

export interface DirectLine {
  menuItemId: string;
  quantity: number;
  variantId?: string;
  addonIds?: string[];
  notes?: string;
}

export interface DirectOrderInput {
  outlet: Outlet;
  channel: OrderChannel;
  type: OrderType;
  lines: DirectLine[];
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: PaymentMethod | null;
  paymentStatus: 'PENDING' | 'PAID' | 'COD_PENDING';
  /** Final status: PLACED (needs acceptance) or ACCEPTED (POS / subscriptions). */
  status: Extract<OrderStatus, 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED'>;
  actorType: ActorType;
  actorId?: string | null;
  tableId?: string | null;
  discount?: number;
  specialInstructions?: string | null;
  deliveryAddress?: Prisma.InputJsonValue;
  deliveryLat?: number;
  deliveryLng?: number;
  mealSubscriptionId?: string;
  idempotencyKey?: string;
  scheduledFor?: Date;
  paymentId?: string | null;
}

/**
 * Creates orders that do not go through the consumer cart: POS counter sales,
 * QR table orders and meal-subscription deliveries.
 */
@Injectable()
export class DirectOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async create(input: DirectOrderInput): Promise<OrderWithItems> {
    if (!input.lines.length) throw badRequest('Add at least one item', 'NO_ITEMS');
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: input.lines.map((l) => l.menuItemId) }, outletId: input.outlet.id },
      include: { variants: true, addonGroups: { include: { addons: true } } },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const resolved = input.lines.map((line) => {
      const item = byId.get(line.menuItemId);
      if (!item) throw badRequest(`Unknown item ${line.menuItemId}`, 'INVALID_ITEM');
      if (!item.isAvailable) throw conflict(`${item.name} is unavailable`, 'ITEM_UNAVAILABLE');
      validateOptions(item, line.variantId, line.addonIds ?? []);
      const variant = line.variantId ? item.variants.find((v) => v.id === line.variantId)! : null;
      const addons = item.addonGroups
        .flatMap((g) => g.addons)
        .filter((a) => line.addonIds?.includes(a.id));
      return { line, item, variant, addons, price: unitPrice(item, variant, addons) };
    });

    const discount = Math.min(
      input.discount ?? 0,
      resolved.reduce((s, r) => s + r.price * r.line.quantity, 0),
    );
    const pricing = computePricing({
      lines: resolved.map((r) => ({
        menuItemId: r.item.id,
        quantity: r.line.quantity,
        unitPrice: r.price,
        gstRate: Number(r.item.gstRate),
      })),
      packagingCharge: input.type === 'DINE_IN' ? 0 : Number(input.outlet.packagingCharge),
      deliveryFee: 0,
      platformFee: 0,
      tip: 0,
      coupon:
        discount > 0
          ? { code: 'MANUAL', type: 'FLAT', value: discount, maxDiscount: null, minOrderValue: 0 }
          : null,
      interState: false,
    });

    const initial: OrderStatus = input.status === 'ACCEPTED' ? 'PLACED' : input.status;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: await generateDocumentNumber(tx, input.channel === 'POS' ? 'POS' : 'ORD'),
          tenantId: input.outlet.tenantId,
          outletId: input.outlet.id,
          customerId: input.customerId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          channel: input.channel,
          type: input.type,
          status: initial,
          paymentStatus: input.paymentStatus,
          paymentMethod: input.paymentMethod,
          paymentId: input.paymentId,
          subtotal: pricing.subtotal,
          couponDiscount: pricing.couponDiscount,
          couponCode: discount > 0 ? 'MANUAL' : null,
          couponFundedBy: discount > 0 ? 'MERCHANT' : null,
          packagingCharge: pricing.packagingCharge,
          taxTotal: pricing.taxTotal,
          cgst: pricing.cgst,
          sgst: pricing.sgst,
          igst: pricing.igst,
          roundOff: pricing.roundOff,
          total: pricing.total,
          tableId: input.tableId,
          specialInstructions: input.specialInstructions,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng,
          deliveryOtp:
            input.type === 'DELIVERY' ? String(Math.floor(1000 + Math.random() * 9000)) : null,
          mealSubscriptionId: input.mealSubscriptionId,
          idempotencyKey: input.idempotencyKey,
          scheduledFor: input.scheduledFor,
          placedAt: initial === 'PLACED' ? now : null,
          items: {
            create: resolved.map((r, i) => ({
              menuItemId: r.item.id,
              name: r.item.name,
              variantId: r.variant?.id,
              variant: r.variant?.name,
              addons: r.addons.map((a) => ({
                id: a.id,
                name: a.name,
                price: toMoney(a.price),
              })),
              quantity: r.line.quantity,
              unitPrice: r.price,
              totalPrice: round2(r.price * r.line.quantity),
              gstRate: r.item.gstRate,
              taxAmount: pricing.lineTax[i]?.tax ?? 0,
              isVeg: r.item.isVeg,
              notes: r.line.notes,
              kdsStation: r.item.kdsStation,
            })),
          },
          events: {
            create: { toStatus: initial, actorType: input.actorType, actorId: input.actorId },
          },
        },
        include: { items: true, outlet: true },
      });

      if (initial === 'PLACED') await this.lifecycle.emit(tx, created, null);
      if (input.status === 'ACCEPTED') {
        return this.lifecycle.transitionInTx(tx, created.id, 'ACCEPTED', {
          actorType: input.actorType,
          actorId: input.actorId,
          data: {
            estimatedReadyAt: new Date(now.getTime() + input.outlet.avgPrepTimeMins * 60_000),
          },
        });
      }
      return created;
    });
  }
}

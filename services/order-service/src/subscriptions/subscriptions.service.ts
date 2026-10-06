import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import { badRequest, conflict, dateOnly, istDate, notFound, round2 } from '@foodgrid/utils';
import { assertOutletAccess } from '../common/outlet-access';
import { isoWeekday, mealsInPlan, scheduleMeals, todayIst } from '../domain/meal-plan';
import { DirectOrderService } from '../orders/direct-order.service';
import { PauseDto, SubscribeDto, SubscriptionPlanDto, UpdateSubscriptionPlanDto } from './dto/subscription.dto';

/** Tiffin / meal subscriptions: prepaid plans that auto-create daily delivery orders. */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly direct: DirectOrderService,
  ) {}

  // ─── merchant plans ────────────────────────────────────────────────────────
  async createPlan(user: AccessTokenClaims, dto: SubscriptionPlanDto) {
    await assertOutletAccess(this.prisma, user, dto.outletId);
    await this.validateRotation(dto.outletId, dto.menuRotation);
    const meals = mealsInPlan(dto.durationDays, dto.daysOfWeek, new Date());
    return this.prisma.forTenant(user.tenantId!).subscriptionPlan.create({
      data: {
        ...dto,
        tenantId: user.tenantId!,
        menuRotation: dto.menuRotation as Prisma.InputJsonValue,
        totalPrice: round2(dto.pricePerMeal * meals),
      },
    });
  }

  async updatePlan(user: AccessTokenClaims, id: string, dto: UpdateSubscriptionPlanDto) {
    const plan = await this.prisma.forTenant(user.tenantId!).subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw notFound('Plan', id);
    if (dto.menuRotation) await this.validateRotation(plan.outletId, dto.menuRotation);
    const days = dto.daysOfWeek ?? plan.daysOfWeek;
    const duration = dto.durationDays ?? plan.durationDays;
    const perMeal = dto.pricePerMeal ?? Number(plan.pricePerMeal);
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...dto,
        outletId: undefined,
        menuRotation: dto.menuRotation as Prisma.InputJsonValue | undefined,
        totalPrice: round2(perMeal * mealsInPlan(duration, days, new Date())),
      },
    });
  }

  merchantPlans(user: AccessTokenClaims, outletId?: string) {
    return this.prisma.forTenant(user.tenantId!).subscriptionPlan.findMany({
      where: outletId ? { outletId } : {},
      include: { _count: { select: { subscriptions: { where: { status: 'ACTIVE' } } } } },
    });
  }

  merchantSubscribers(user: AccessTokenClaims, outletId?: string) {
    return this.prisma.forTenant(user.tenantId!).mealSubscription.findMany({
      where: { ...(outletId ? { outletId } : {}), status: { in: ['ACTIVE', 'PAUSED'] } },
      include: { plan: { select: { name: true, slot: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  private async validateRotation(outletId: string, rotation: Record<string, string[]>) {
    const ids = [...new Set(Object.values(rotation).flat())];
    const count = await this.prisma.menuItem.count({ where: { id: { in: ids }, outletId } });
    if (count !== ids.length) throw badRequest('Menu rotation references items from another outlet', 'INVALID_ROTATION');
  }

  // ─── customer ──────────────────────────────────────────────────────────────
  plansForOutlet(outletId: string) {
    return this.prisma.subscriptionPlan.findMany({ where: { outletId, isActive: true }, orderBy: { pricePerMeal: 'asc' } });
  }

  async subscribe(userId: string, dto: SubscribeDto) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId }, include: { outlet: true } });
    if (!plan || !plan.isActive) throw notFound('Plan', dto.planId);
    const start = dateOnly(dto.startDate.slice(0, 10));
    if (start < dateOnly(istDate())) throw badRequest('Start date cannot be in the past', 'INVALID_START');
    const meals = mealsInPlan(plan.durationDays, plan.daysOfWeek, start);
    const schedule = scheduleMeals(start, plan.daysOfWeek, meals);
    return this.prisma.mealSubscription.create({
      data: {
        tenantId: plan.tenantId,
        outletId: plan.outletId,
        planId: plan.id,
        customerId: userId,
        slot: plan.slot,
        startDate: start,
        endDate: schedule[schedule.length - 1] ?? start,
        deliveryTime: dto.deliveryTime,
        deliveryAddress: dto.deliveryAddress as unknown as Prisma.InputJsonValue,
        mealsTotal: meals,
        amountPaid: round2(Number(plan.pricePerMeal) * meals),
      },
    });
  }

  mine(userId: string) {
    return this.prisma.mealSubscription.findMany({
      where: { customerId: userId },
      include: { plan: { select: { name: true, slot: true, outletId: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pause(userId: string, id: string, dto: PauseDto) {
    const sub = await this.owned(userId, id);
    if (sub.status !== 'ACTIVE' && sub.status !== 'PAUSED') throw conflict('Subscription is not active', 'SUBSCRIPTION_STATE');
    const tomorrow = new Date(todayIst().getTime() + 86_400_000);
    const dates = dto.dates.map((d) => dateOnly(d.slice(0, 10)));
    if (dates.some((d) => d < tomorrow)) throw badRequest('You can pause from tomorrow onwards', 'PAUSE_TOO_LATE');
    const paused = [...new Map([...sub.pausedDates, ...dates].map((d) => [d.toISOString(), d])).values()];
    const plan = await this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: sub.planId } });
    const schedule = scheduleMeals(sub.startDate, plan.daysOfWeek, sub.mealsTotal, paused);
    return this.prisma.mealSubscription.update({
      where: { id },
      data: { pausedDates: paused, endDate: schedule[schedule.length - 1] ?? sub.endDate },
    });
  }

  async cancel(userId: string, id: string) {
    const sub = await this.owned(userId, id);
    if (['CANCELLED', 'EXPIRED'].includes(sub.status)) throw conflict('Subscription already ended', 'SUBSCRIPTION_STATE');
    return this.prisma.mealSubscription.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  private async owned(userId: string, id: string) {
    const sub = await this.prisma.mealSubscription.findUnique({ where: { id } });
    if (!sub || sub.customerId !== userId) throw notFound('Subscription', id);
    return sub;
  }

  /**
   * Creates today's subscription orders. Idempotent: the order idempotency key
   * is unique per (subscription, date), so re-runs never duplicate meals.
   */
  async generateOrdersFor(date: Date = todayIst()): Promise<{ created: number; skipped: number }> {
    const ymd = date.toISOString().slice(0, 10);
    const weekday = isoWeekday(date);
    const subs = await this.prisma.mealSubscription.findMany({
      where: { status: 'ACTIVE', startDate: { lte: date }, endDate: { gte: date } },
      include: { plan: { include: { outlet: true } } },
    });
    let created = 0;
    let skipped = 0;
    for (const sub of subs) {
      const servesToday = sub.plan.daysOfWeek.includes(weekday) && !sub.pausedDates.some((d) => d.toISOString().slice(0, 10) === ymd);
      const itemIds = (sub.plan.menuRotation as Record<string, string[]>)[String(weekday)] ?? [];
      if (!servesToday || !itemIds.length || sub.mealsDelivered >= sub.mealsTotal) {
        skipped++;
        continue;
      }
      const key = `meal-sub:${sub.id}:${ymd}`;
      if (await this.prisma.order.findUnique({ where: { idempotencyKey: key } })) {
        skipped++;
        continue;
      }
      const address = sub.deliveryAddress as { lat: number; lng: number };
      try {
        await this.direct.create({
          outlet: sub.plan.outlet,
          channel: 'APP',
          type: 'DELIVERY',
          lines: itemIds.map((menuItemId) => ({ menuItemId, quantity: sub.plan.mealsPerDay })),
          customerId: sub.customerId,
          paymentStatus: 'PAID',
          paymentMethod: null,
          paymentId: sub.paymentId,
          status: 'PLACED',
          actorType: 'SYSTEM',
          deliveryAddress: sub.deliveryAddress as Prisma.InputJsonValue,
          deliveryLat: address.lat,
          deliveryLng: address.lng,
          mealSubscriptionId: sub.id,
          idempotencyKey: key,
          scheduledFor: new Date(`${ymd}T${sub.deliveryTime}:00+05:30`),
          specialInstructions: `Meal subscription: ${sub.plan.name}`,
        });
        created++;
      } catch (err) {
        this.logger.error(`Subscription ${sub.id} order failed: ${(err as Error).message}`);
        skipped++;
      }
    }
    await this.prisma.mealSubscription.updateMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] }, endDate: { lt: date } },
      data: { status: 'EXPIRED' },
    });
    return { created, skipped };
  }
}

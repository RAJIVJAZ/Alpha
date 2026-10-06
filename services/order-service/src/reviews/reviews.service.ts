import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { AccessTokenClaims, EventTypes, ReviewCreatedEvent } from '@foodgrid/types';
import { conflict, normalizePage, notFound, paginate } from '@foodgrid/utils';
import { OutboxService } from '@foodgrid/utils/server';
import { outletScope } from '../common/outlet-access';
import { ReviewDto } from '../orders/dto/order.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(userId: string, orderId: string, dto: ReviewDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { review: true } });
    if (!order || order.customerId !== userId) throw notFound('Order', orderId);
    if (!['DELIVERED', 'COMPLETED'].includes(order.status)) throw conflict('You can review once the order is delivered', 'NOT_DELIVERED');
    if (order.review) throw conflict('You have already reviewed this order', 'ALREADY_REVIEWED');

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          orderId,
          tenantId: order.tenantId,
          outletId: order.outletId,
          customerId: userId,
          riderId: order.riderId,
          rating: dto.rating,
          foodRating: dto.foodRating,
          deliveryRating: order.type === 'DELIVERY' ? dto.deliveryRating : null,
          comment: dto.comment,
          photos: dto.photos ?? [],
          tags: dto.tags ?? [],
        },
      });
      // incremental running average keeps the outlet card fast to render
      await tx.$executeRaw`
        UPDATE "commerce"."Outlet"
        SET "ratingAvg" = ("ratingAvg" * "ratingCount" + ${dto.rating}) / ("ratingCount" + 1),
            "ratingCount" = "ratingCount" + 1
        WHERE id = ${order.outletId}`;
      await this.outbox.enqueue<ReviewCreatedEvent>(tx, {
        stream: 'order',
        type: EventTypes.ReviewCreated,
        aggregateType: 'Review',
        aggregateId: review.id,
        tenantId: order.tenantId,
        data: {
          reviewId: review.id,
          orderId,
          outletId: order.outletId,
          tenantId: order.tenantId,
          riderId: order.riderId,
          rating: dto.rating,
          deliveryRating: review.deliveryRating,
        },
      });
      return review;
    });
  }

  async forOutlet(outletId: string, page = 1, pageSize = 20) {
    const p = normalizePage({ page, pageSize });
    const where = { outletId, status: 'PUBLISHED' as const };
    const [rows, total, distribution] = await Promise.all([
      this.prisma.review.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
    ]);
    return {
      ...paginate(rows.map(({ customerId: _c, ...r }) => r), total, p.page, p.pageSize),
      distribution: Object.fromEntries(distribution.map((d) => [d.rating, d._count._all])),
    };
  }

  async forMerchant(user: AccessTokenClaims, outletId?: string, page = 1) {
    const p = normalizePage({ page, pageSize: 30 });
    const where = { ...outletScope(user, outletId) };
    const db = this.prisma.forTenant(user.tenantId!);
    const [rows, total] = await Promise.all([
      db.review.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { order: { select: { orderNumber: true } } } }),
      db.review.count({ where }),
    ]);
    return paginate(rows, total, p.page, p.pageSize);
  }

  async reply(user: AccessTokenClaims, id: string, reply: string) {
    const review = await this.prisma.forTenant(user.tenantId!).review.findUnique({ where: { id } });
    if (!review) throw notFound('Review', id);
    outletScope(user, review.outletId);
    return this.prisma.review.update({ where: { id }, data: { reply, repliedAt: new Date() } });
  }

  moderate(id: string, status: 'PUBLISHED' | 'HIDDEN' | 'FLAGGED') {
    return this.prisma.review.update({ where: { id }, data: { status } });
  }
}

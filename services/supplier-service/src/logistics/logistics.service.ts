import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { badRequest, dateOnly, notFound } from '@foodgrid/utils';
import { slotBookable } from '../domain/logistics';
import { SlotDto, UpdateSlotDto, UpdateZoneDto, ZoneDto } from './dto/logistics.dto';

@Injectable()
export class LogisticsService {
  constructor(private readonly prisma: PrismaService) {}

  zones(tenantId: string) {
    return this.prisma
      .forTenant(tenantId)
      .sellerDeliveryZone.findMany({ orderBy: { name: 'asc' } });
  }
  createZone(tenantId: string, dto: ZoneDto) {
    if (!dto.pincodes?.length && (dto.centerLat === undefined || dto.radiusKm === undefined)) {
      throw badRequest('A zone needs pincodes or a centre + radius', 'INVALID_ZONE');
    }
    return this.prisma
      .forTenant(tenantId)
      .sellerDeliveryZone.create({ data: { ...dto, tenantId } });
  }
  async updateZone(tenantId: string, id: string, dto: UpdateZoneDto) {
    if (!(await this.prisma.forTenant(tenantId).sellerDeliveryZone.findUnique({ where: { id } })))
      throw notFound('Zone', id);
    return this.prisma.sellerDeliveryZone.update({ where: { id }, data: dto });
  }
  async deleteZone(tenantId: string, id: string) {
    await this.prisma.forTenant(tenantId).sellerDeliveryZone.delete({ where: { id } });
  }

  slots(tenantId: string) {
    return this.prisma
      .forTenant(tenantId)
      .deliverySlot.findMany({ orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
  }
  createSlot(tenantId: string, dto: SlotDto) {
    if (dto.endTime <= dto.startTime)
      throw badRequest('Slot must end after it starts', 'INVALID_SLOT');
    return this.prisma.forTenant(tenantId).deliverySlot.create({ data: { ...dto, tenantId } });
  }
  async updateSlot(tenantId: string, id: string, dto: UpdateSlotDto) {
    if (!(await this.prisma.forTenant(tenantId).deliverySlot.findUnique({ where: { id } })))
      throw notFound('Slot', id);
    return this.prisma.deliverySlot.update({ where: { id }, data: dto });
  }

  /** Bookable delivery slots of a seller for a date (buyer view). */
  async availability(sellerTenantId: string, date: string) {
    const day = date.slice(0, 10);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const slots = await this.prisma.deliverySlot.findMany({
      where: { tenantId: sellerTenantId, dayOfWeek: dow, isActive: true },
      orderBy: { startTime: 'asc' },
    });
    const booked = await this.prisma.b2bOrder.groupBy({
      by: ['deliverySlotId'],
      where: {
        sellerTenantId,
        deliveryDate: dateOnly(day),
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        deliverySlotId: { in: slots.map((s) => s.id) },
      },
      _count: { _all: true },
    });
    const count = new Map(booked.map((b) => [b.deliverySlotId, b._count._all]));
    return slots.map((s) => {
      const used = count.get(s.id) ?? 0;
      const check = slotBookable(s, day, used);
      return {
        id: s.id,
        label: s.label,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        booked: used,
        available: check.ok,
        reason: check.reason ?? null,
      };
    });
  }
}

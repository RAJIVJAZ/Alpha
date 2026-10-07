import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma, ProcurementSettings } from '@foodgrid/database';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get(tenantId: string): Promise<ProcurementSettings> {
    return this.prisma.forTenant(tenantId).procurementSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
  }

  update(
    tenantId: string,
    data: Omit<Prisma.ProcurementSettingsUncheckedUpdateInput, 'id' | 'tenantId'>,
  ) {
    return this.prisma.forTenant(tenantId).procurementSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...(data as Omit<Prisma.ProcurementSettingsUncheckedCreateInput, 'tenantId'>),
      },
      update: data,
    });
  }
}

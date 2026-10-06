import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { conflict, notFound } from '@foodgrid/utils';
import { AddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/profile.dto';

const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  phone: true,
  email: true,
  avatarUrl: true,
  roles: true,
  referralCode: true,
  preferences: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: PUBLIC_USER_FIELDS });
  }

  async update(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const taken = await this.prisma.user.findFirst({ where: { email: dto.email.toLowerCase(), NOT: { id: userId } } });
      if (taken) throw conflict('Email already in use', 'EMAIL_TAKEN');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        email: dto.email?.toLowerCase(),
        preferences: dto.preferences as Prisma.InputJsonValue | undefined,
      },
      select: PUBLIC_USER_FIELDS,
    });
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
  }

  async addAddress(userId: string, dto: AddressDto) {
    const count = await this.prisma.address.count({ where: { userId } });
    const makeDefault = dto.isDefault || count === 0;
    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: { ...dto, userId, isDefault: makeDefault } });
    });
  }

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw notFound('Address', id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: dto });
    });
  }

  async deleteAddress(userId: string, id: string) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw notFound('Address', id);
    await this.prisma.address.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await this.prisma.address.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
      if (next) await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }
}

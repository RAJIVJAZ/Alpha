import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { notFound } from '@foodgrid/utils';
import { BannerQueryDto, CmsBannerDto, CmsPageDto, UpdateCmsBannerDto, UpdateCmsPageDto } from './dto/cms.dto';

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  async publicPage(slug: string) {
    const page = await this.prisma.cmsPage.findFirst({ where: { slug, status: 'PUBLISHED' } });
    if (!page) throw notFound('Page', slug);
    return page;
  }

  publicBanners(q: BannerQueryDto) {
    const now = new Date();
    return this.prisma.cmsBanner.findMany({
      where: {
        isActive: true,
        placement: q.placement,
        audience: q.audience ? { in: [q.audience, 'ALL'] } : undefined,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ...(q.city ? [{ OR: [{ cities: { isEmpty: true } }, { cities: { has: q.city } }] }] : []),
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  listPages() {
    return this.prisma.cmsPage.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  createPage(dto: CmsPageDto, actorId: string) {
    return this.prisma.cmsPage.create({
      data: { ...dto, updatedBy: actorId, publishedAt: dto.status === 'PUBLISHED' ? new Date() : null },
    });
  }

  async updatePage(id: string, dto: UpdateCmsPageDto, actorId: string) {
    const page = await this.prisma.cmsPage.findUnique({ where: { id } });
    if (!page) throw notFound('Page', id);
    return this.prisma.cmsPage.update({
      where: { id },
      data: {
        ...dto,
        updatedBy: actorId,
        publishedAt: dto.status === 'PUBLISHED' && page.status !== 'PUBLISHED' ? new Date() : undefined,
      },
    });
  }

  deletePage(id: string) {
    return this.prisma.cmsPage.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  listBanners() {
    return this.prisma.cmsBanner.findMany({ orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }] });
  }

  createBanner(dto: CmsBannerDto) {
    return this.prisma.cmsBanner.create({ data: dto });
  }

  updateBanner(id: string, dto: UpdateCmsBannerDto) {
    return this.prisma.cmsBanner.update({ where: { id }, data: dto });
  }

  deleteBanner(id: string) {
    return this.prisma.cmsBanner.delete({ where: { id } });
  }
}

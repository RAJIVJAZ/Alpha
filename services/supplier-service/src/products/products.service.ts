import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma, SellerType } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import { badRequest, conflict, normalizePage, notFound, paginate } from '@foodgrid/utils';
import { TenantDirectory } from '../common/tenant-directory.service';
import {
  BulkProductsDto,
  CatalogQueryDto,
  CategoryDto,
  PriceTiersDto,
  ProductDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 80);

export function stockStatusFor(qty: number, threshold: number) {
  return qty <= 0 ? 'OUT_OF_STOCK' : qty <= threshold ? 'LOW_STOCK' : 'IN_STOCK';
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantDirectory,
  ) {}

  categories() {
    return this.prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
  }

  /** A deactivated category takes no new products; ones already in it may keep it. */
  private async categoryId(code: string, currentId?: string) {
    const cat = await this.prisma.productCategory.findUnique({ where: { code } });
    if (!cat || (!cat.isActive && cat.id !== currentId))
      throw badRequest(`Unknown category ${code}`, 'INVALID_CATEGORY');
    return cat.id;
  }

  // ─── admin: category reference data ───────────────────────────────────────
  adminCategories() {
    return this.prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  async createCategory(dto: CategoryDto) {
    if (await this.prisma.productCategory.findUnique({ where: { code: dto.code } }))
      throw conflict(`Category ${dto.code} already exists`, 'DUPLICATE_CATEGORY');
    return this.prisma.productCategory.create({ data: { ...dto, slug: slugify(dto.name) } });
  }

  /** Rename, reorder or (de)activate; the code and slug stay fixed because products and links use them. */
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    if (!(await this.prisma.productCategory.findUnique({ where: { id } })))
      throw notFound('Category', id);
    return this.prisma.productCategory.update({ where: { id }, data: dto });
  }

  private async ensureSellerMetrics(tenantId: string) {
    const existing = await this.prisma.sellerMetrics.findUnique({ where: { tenantId } });
    if (existing) return;
    const t = await this.tenants.get(tenantId);
    await this.prisma.sellerMetrics
      .create({ data: { tenantId, sellerName: t.name } })
      .catch(() => undefined);
  }

  // ─── seller ────────────────────────────────────────────────────────────────
  async create(user: AccessTokenClaims, dto: ProductDto) {
    const tenantId = user.tenantId!;
    const { categoryCode, ...data } = dto;
    const exists = await this.prisma.product.findUnique({
      where: { tenantId_sku: { tenantId, sku: dto.sku } },
    });
    if (exists) throw conflict(`SKU ${dto.sku} already exists`, 'DUPLICATE_SKU');
    await this.ensureSellerMetrics(tenantId);
    const stockQty = dto.stockQty ?? 0;
    return this.prisma.forTenant(tenantId).product.create({
      data: {
        ...data,
        tenantId,
        sellerType: user.tenantType as SellerType,
        categoryId: await this.categoryId(categoryCode),
        slug: `${slugify(dto.name)}-${dto.sku.toLowerCase()}`,
        stockStatus: stockStatusFor(stockQty, dto.lowStockThreshold ?? 10),
        attributes: (dto.attributes ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async bulkUpsert(user: AccessTokenClaims, dto: BulkProductsDto) {
    let created = 0;
    let updated = 0;
    for (const p of dto.products) {
      const existing = await this.prisma.product.findUnique({
        where: { tenantId_sku: { tenantId: user.tenantId!, sku: p.sku } },
      });
      if (existing) {
        const { sku: _sku, ...rest } = p;
        await this.update(user, existing.id, rest);
        updated++;
      } else {
        await this.create(user, p);
        created++;
      }
    }
    return { created, updated };
  }

  async update(user: AccessTokenClaims, id: string, dto: UpdateProductDto) {
    const product = await this.prisma
      .forTenant(user.tenantId!)
      .product.findUnique({ where: { id } });
    if (!product) throw notFound('Product', id);
    const { categoryCode, ...data } = dto;
    const stockQty = dto.stockQty ?? Number(product.stockQty);
    const threshold = dto.lowStockThreshold ?? Number(product.lowStockThreshold);
    return this.prisma.product.update({
      where: { id },
      data: {
        ...data,
        ...(categoryCode
          ? { categoryId: await this.categoryId(categoryCode, product.categoryId) }
          : {}),
        attributes: dto.attributes as Prisma.InputJsonValue | undefined,
        stockStatus: stockStatusFor(stockQty, threshold),
      },
    });
  }

  async setStock(user: AccessTokenClaims, id: string, stockQty: number) {
    const product = await this.prisma
      .forTenant(user.tenantId!)
      .product.findUnique({ where: { id } });
    if (!product) throw notFound('Product', id);
    return this.prisma.product.update({
      where: { id },
      data: { stockQty, stockStatus: stockStatusFor(stockQty, Number(product.lowStockThreshold)) },
    });
  }

  async setTiers(user: AccessTokenClaims, id: string, dto: PriceTiersDto) {
    const product = await this.prisma
      .forTenant(user.tenantId!)
      .product.findUnique({ where: { id } });
    if (!product) throw notFound('Product', id);
    for (const t of dto.tiers) {
      if (t.unitPrice > Number(product.price))
        throw badRequest('Bulk tier price cannot exceed the base price', 'INVALID_TIER');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.priceTier.deleteMany({ where: { productId: id } });
      await tx.priceTier.createMany({
        data: dto.tiers.map((t) => ({
          productId: id,
          minQty: t.minQty,
          maxQty: t.maxQty,
          unitPrice: t.unitPrice,
          segment: t.segment ?? 'ALL',
          validFrom: t.validFrom ? new Date(t.validFrom) : null,
          validTo: t.validTo ? new Date(t.validTo) : null,
        })),
      });
      return tx.product.findUniqueOrThrow({
        where: { id },
        include: { priceTiers: { orderBy: { minQty: 'asc' } } },
      });
    });
  }

  async sellerList(user: AccessTokenClaims, q: CatalogQueryDto) {
    const { page, pageSize, skip, take } = normalizePage(q, 200);
    const where: Prisma.ProductWhereInput = {
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { sku: { contains: q.q.toUpperCase() } },
            ],
          }
        : {}),
      ...(q.category ? { category: { code: q.category } } : {}),
    };
    const db = this.prisma.forTenant(user.tenantId!);
    const [rows, total] = await Promise.all([
      db.product.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: { category: true, priceTiers: true },
      }),
      db.product.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  // ─── buyer catalogue ──────────────────────────────────────────────────────
  async catalog(q: CatalogQueryDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      sellerType: q.sellerType,
      tenantId: q.sellerId,
      ...(q.category ? { category: { code: q.category } } : {}),
      ...(q.brand ? { brand: { equals: q.brand, mode: 'insensitive' } } : {}),
      ...(q.inStock ? { stockStatus: { not: 'OUT_OF_STOCK' } } : {}),
      ...(q.minPrice !== undefined || q.maxPrice !== undefined
        ? { price: { gte: q.minPrice, lte: q.maxPrice } }
        : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { brand: { contains: q.q, mode: 'insensitive' } },
              { tags: { has: q.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'price_asc'
        ? [{ price: 'asc' }]
        : q.sort === 'price_desc'
          ? [{ price: 'desc' }]
          : q.sort === 'rating'
            ? [{ rating: 'desc' }]
            : q.sort === 'fastest'
              ? [{ deliveryTimeHours: 'asc' }]
              : [{ stockStatus: 'asc' }, { rating: 'desc' }, { updatedAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          category: { select: { code: true, name: true } },
          priceTiers: { orderBy: { minQty: 'asc' } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    const sellers = await this.prisma.sellerMetrics.findMany({
      where: { tenantId: { in: [...new Set(rows.map((r) => r.tenantId))] } },
    });
    const sellerById = new Map(sellers.map((s) => [s.tenantId, s]));
    return paginate(
      rows.map((r) => ({
        ...r,
        seller: sellerById.get(r.tenantId) ?? { tenantId: r.tenantId, sellerName: 'Seller' },
      })),
      total,
      page,
      pageSize,
    );
  }

  async detail(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id }, { slug: id }], isActive: true },
      include: { category: true, priceTiers: { orderBy: { minQty: 'asc' } } },
    });
    if (!product) throw notFound('Product', id);
    const seller = await this.prisma.sellerMetrics.findUnique({
      where: { tenantId: product.tenantId },
    });
    const zones = await this.prisma.sellerDeliveryZone.findMany({
      where: { tenantId: product.tenantId, isActive: true },
      select: {
        name: true,
        pincodes: true,
        deliveryCharge: true,
        freeDeliveryAbove: true,
        leadTimeHours: true,
        minOrderValue: true,
      },
    });
    return { ...product, seller, deliveryZones: zones };
  }
}

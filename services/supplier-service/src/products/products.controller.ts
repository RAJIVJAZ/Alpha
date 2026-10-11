import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, Public, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import {
  BulkProductsDto,
  CatalogQueryDto,
  CategoryDto,
  PriceTiersDto,
  ProductDto,
  StockUpdateDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('marketplace')
@Controller('marketplace')
export class CatalogController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get('categories')
  @ApiOperation({
    summary:
      'Dairy, Flour, Sugar, Rice, Vegetables, Fruits, Packaging, Spices, Beverages, Frozen …',
  })
  categories() {
    return this.products.categories();
  }

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Browse the B2B product marketplace' })
  catalog(@Query() q: CatalogQueryDto) {
    return this.products.catalog(q);
  }

  @Public()
  @Get('products/:idOrSlug')
  detail(@Param('idOrSlug') id: string) {
    return this.products.detail(id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformContent)
@Controller('admin/marketplace/categories')
export class AdminCategoriesController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'All marketplace categories, including deactivated ones' })
  list() {
    return this.products.adminCategories();
  }

  @Post()
  create(@Body() dto: CategoryDto) {
    return this.products.createCategory(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, reorder or deactivate (deactivated: no new products)' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.products.updateCategory(id, dto);
  }
}

@ApiTags('seller')
@ApiBearerAuth()
@RequireTenant('SUPPLIER', 'WHOLESALER', 'RETAILER')
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(Permissions.CatalogManage)
  list(@CurrentUser() user: AccessTokenClaims, @Query() q: CatalogQueryDto) {
    return this.products.sellerList(user, q);
  }

  @Post()
  @RequirePermissions(Permissions.CatalogManage)
  @ApiOperation({
    summary:
      'List a product (name, SKU, brand, images, price, MOQ, unit, GST, delivery time, stock)',
  })
  create(@CurrentUser() user: AccessTokenClaims, @Body() dto: ProductDto) {
    return this.products.create(user, dto);
  }

  @Post('bulk')
  @RequirePermissions(Permissions.CatalogManage)
  @ApiOperation({ summary: 'Bulk upsert by SKU (catalogue import)' })
  bulk(@CurrentUser() user: AccessTokenClaims, @Body() dto: BulkProductsDto) {
    return this.products.bulkUpsert(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CatalogManage)
  update(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user, id, dto);
  }

  @Patch(':id/stock')
  @RequirePermissions(Permissions.CatalogManage)
  stock(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: StockUpdateDto,
  ) {
    return this.products.setStock(user, id, dto.stockQty);
  }

  @Put(':id/price-tiers')
  @RequirePermissions(Permissions.PricingManage)
  @ApiOperation({ summary: 'Bulk pricing tiers (optionally per buyer segment)' })
  tiers(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: PriceTiersDto,
  ) {
    return this.products.setTiers(user, id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { StockService } from '../stock/stock.service';
import {
  AdjustStockDto,
  MovementsQueryDto,
  ReceiveStockDto,
  WastageDto,
} from '../stock/dto/stock.dto';
import { IngredientDto, ListIngredientsDto, UpdateIngredientDto } from './dto/ingredient.dto';
import { IngredientsService } from './ingredients.service';

@ApiTags('inventory')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly ingredients: IngredientsService,
    private readonly stock: StockService,
  ) {}

  @Get('summary')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Stock value and health by category; batches expiring in 3 days' })
  summary(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Query('outletId') outletId?: string,
  ) {
    return this.ingredients.summary(tenantId, outletId, user);
  }

  @Get('ingredients')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({
    summary: 'Ingredients (flour, oil, sugar, dairy, vegetables, packaging, spices ...)',
  })
  list(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Query() q: ListIngredientsDto,
  ) {
    return this.ingredients.list(tenantId, q, user);
  }

  @Post('ingredients')
  @RequirePermissions(Permissions.InventoryManage)
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: IngredientDto,
  ) {
    return this.ingredients.create(tenantId, user.sub, dto, user);
  }

  @Get('ingredients/:id')
  @RequirePermissions(Permissions.InventoryRead)
  get(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.ingredients.get(tenantId, id, user);
  }

  @Patch('ingredients/:id')
  @RequirePermissions(Permissions.InventoryManage)
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.ingredients.update(tenantId, id, dto, user);
  }

  @Post('stock/receive')
  @RequirePermissions(Permissions.InventoryManage)
  @ApiOperation({ summary: 'Goods receipt (creates batches, updates weighted average cost)' })
  receive(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.stock.receive(tenantId, user.sub, dto, user);
  }

  @Post('stock/adjust')
  @RequirePermissions(Permissions.InventoryManage)
  @ApiOperation({ summary: 'Physical stock count adjustment' })
  adjust(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: AdjustStockDto,
  ) {
    return this.stock.adjust(tenantId, user.sub, dto, user);
  }

  @Post('stock/wastage')
  @RequirePermissions(Permissions.InventoryManage)
  wastage(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: WastageDto,
  ) {
    return this.stock.wastage(tenantId, user.sub, dto, user);
  }

  @Get('movements')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Stock ledger' })
  movements(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Query() q: MovementsQueryDto,
  ) {
    return this.stock.movements(tenantId, q, user);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import { StockService } from '../stock/stock.service';
import { AdjustStockDto, MovementsQueryDto, ReceiveStockDto, WastageDto } from '../stock/dto/stock.dto';
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
  summary(@TenantId() tenantId: string, @Query('outletId') outletId?: string) {
    return this.ingredients.summary(tenantId, outletId);
  }

  @Get('ingredients')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Ingredients (flour, oil, sugar, dairy, vegetables, packaging, spices ...)' })
  list(@TenantId() tenantId: string, @Query() q: ListIngredientsDto) {
    return this.ingredients.list(tenantId, q);
  }

  @Post('ingredients')
  @RequirePermissions(Permissions.InventoryManage)
  create(@TenantId() tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: IngredientDto) {
    return this.ingredients.create(tenantId, userId, dto);
  }

  @Get('ingredients/:id')
  @RequirePermissions(Permissions.InventoryRead)
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.ingredients.get(tenantId, id);
  }

  @Patch('ingredients/:id')
  @RequirePermissions(Permissions.InventoryManage)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    return this.ingredients.update(tenantId, id, dto);
  }

  @Post('stock/receive')
  @RequirePermissions(Permissions.InventoryManage)
  @ApiOperation({ summary: 'Goods receipt (creates batches, updates weighted average cost)' })
  receive(@TenantId() tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: ReceiveStockDto) {
    return this.stock.receive(tenantId, userId, dto);
  }

  @Post('stock/adjust')
  @RequirePermissions(Permissions.InventoryManage)
  @ApiOperation({ summary: 'Physical stock count adjustment' })
  adjust(@TenantId() tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: AdjustStockDto) {
    return this.stock.adjust(tenantId, userId, dto);
  }

  @Post('stock/wastage')
  @RequirePermissions(Permissions.InventoryManage)
  wastage(@TenantId() tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: WastageDto) {
    return this.stock.wastage(tenantId, userId, dto);
  }

  @Get('movements')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Stock ledger' })
  movements(@TenantId() tenantId: string, @Query() q: MovementsQueryDto) {
    return this.stock.movements(tenantId, q);
  }
}

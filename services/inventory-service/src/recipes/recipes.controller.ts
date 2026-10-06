import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import { RecipeDto } from './dto/recipe.dto';
import { RecipesService } from './recipes.service';

@ApiTags('inventory')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('inventory/recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  list(@TenantId() tenantId: string, @Query('outletId') outletId?: string) {
    return this.recipes.list(tenantId, outletId);
  }

  @Put()
  @RequirePermissions(Permissions.RecipesManage)
  @ApiOperation({ summary: 'Create or replace the recipe (BOM) for a menu item' })
  upsert(@TenantId() tenantId: string, @Body() dto: RecipeDto) {
    return this.recipes.upsert(tenantId, dto);
  }

  @Get(':menuItemId')
  @RequirePermissions(Permissions.InventoryRead)
  get(@TenantId() tenantId: string, @Param('menuItemId') menuItemId: string) {
    return this.recipes.get(tenantId, menuItemId);
  }

  @Get(':menuItemId/cost')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Plate cost breakdown from current ingredient costs' })
  cost(@TenantId() tenantId: string, @Param('menuItemId') menuItemId: string) {
    return this.recipes.cost(tenantId, menuItemId);
  }

  @Delete(':menuItemId')
  @HttpCode(204)
  @RequirePermissions(Permissions.RecipesManage)
  async remove(@TenantId() tenantId: string, @Param('menuItemId') menuItemId: string) {
    await this.recipes.remove(tenantId, menuItemId);
  }
}

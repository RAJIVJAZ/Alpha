import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
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
  list(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Query('outletId') outletId?: string,
  ) {
    return this.recipes.list(tenantId, outletId, user);
  }

  @Put()
  @RequirePermissions(Permissions.RecipesManage)
  @ApiOperation({ summary: 'Create or replace the recipe (BOM) for a menu item' })
  upsert(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: RecipeDto,
  ) {
    return this.recipes.upsert(tenantId, dto, user);
  }

  @Get(':menuItemId')
  @RequirePermissions(Permissions.InventoryRead)
  get(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('menuItemId') menuItemId: string,
  ) {
    return this.recipes.get(tenantId, menuItemId, user);
  }

  @Get(':menuItemId/cost')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Plate cost breakdown from current ingredient costs' })
  cost(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('menuItemId') menuItemId: string,
  ) {
    return this.recipes.cost(tenantId, menuItemId, user);
  }

  @Delete(':menuItemId')
  @HttpCode(204)
  @RequirePermissions(Permissions.RecipesManage)
  async remove(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('menuItemId') menuItemId: string,
  ) {
    await this.recipes.remove(tenantId, menuItemId, user);
  }
}

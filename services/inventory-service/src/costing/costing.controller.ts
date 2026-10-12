import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { CostingService } from './costing.service';

@ApiTags('inventory')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('inventory/costing')
export class CostingController {
  constructor(private readonly costing: CostingService) {}

  // inventory:read, like a recipe's plate cost: the recipe editor lives on this screen, and
  // kitchen staff (CHEF has recipes:manage) must reach it without reports:read
  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Costing system: food cost % and margin per menu item' })
  report(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Query('outletId') outletId: string,
  ) {
    return this.costing.report(tenantId, outletId, user);
  }

  @Post('snapshot')
  @RequirePermissions(Permissions.InventoryManage)
  snapshot(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Query('outletId') outletId: string,
  ) {
    return this.costing.snapshot(tenantId, outletId, user);
  }

  @Get('trend/:menuItemId')
  @RequirePermissions(Permissions.InventoryRead)
  trend(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('menuItemId') menuItemId: string,
  ) {
    return this.costing.trend(tenantId, menuItemId, user);
  }
}

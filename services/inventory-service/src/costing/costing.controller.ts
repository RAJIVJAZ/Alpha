import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import { CostingService } from './costing.service';

@ApiTags('inventory')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('inventory/costing')
export class CostingController {
  constructor(private readonly costing: CostingService) {}

  @Get()
  @RequirePermissions(Permissions.ReportsRead)
  @ApiOperation({ summary: 'Costing system: food cost % and margin per menu item' })
  report(@TenantId() tenantId: string, @Query('outletId') outletId: string) {
    return this.costing.report(tenantId, outletId);
  }

  @Post('snapshot')
  @RequirePermissions(Permissions.InventoryManage)
  snapshot(@TenantId() tenantId: string, @Query('outletId') outletId: string) {
    return this.costing.snapshot(tenantId, outletId);
  }

  @Get('trend/:menuItemId')
  @RequirePermissions(Permissions.ReportsRead)
  trend(@TenantId() tenantId: string, @Param('menuItemId') menuItemId: string) {
    return this.costing.trend(tenantId, menuItemId);
  }
}

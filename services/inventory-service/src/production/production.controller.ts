import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import { GeneratePlanDto, UpdatePlanItemDto } from './dto/production.dto';
import { ProductionService } from './production.service';

@ApiTags('inventory')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('inventory/production-plans')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Post('generate')
  @RequirePermissions(Permissions.ProductionManage)
  @ApiOperation({ summary: 'Generate a production plan from forecast dish demand' })
  generate(@TenantId() tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: GeneratePlanDto) {
    return this.production.generate(tenantId, userId, dto);
  }

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  list(@TenantId() tenantId: string, @Query('outletId') outletId?: string) {
    return this.production.list(tenantId, outletId);
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Plan with ingredient requirements and shortages' })
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.production.get(tenantId, id);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions(Permissions.ProductionManage)
  updateItem(@TenantId() tenantId: string, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdatePlanItemDto) {
    return this.production.updateItem(tenantId, id, itemId, dto);
  }

  @Post(':id/confirm')
  @RequirePermissions(Permissions.ProductionManage)
  confirm(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.production.setStatus(tenantId, id, 'CONFIRMED');
  }

  @Post(':id/start')
  @RequirePermissions(Permissions.ProductionManage)
  start(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.production.setStatus(tenantId, id, 'IN_PROGRESS');
  }

  @Post(':id/complete')
  @RequirePermissions(Permissions.ProductionManage)
  complete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.production.setStatus(tenantId, id, 'COMPLETED');
  }
}

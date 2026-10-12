import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
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
  generate(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: GeneratePlanDto,
  ) {
    return this.production.generate(tenantId, user.sub, dto, user);
  }

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  list(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Query('outletId') outletId?: string,
  ) {
    return this.production.list(tenantId, outletId, user);
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  @ApiOperation({ summary: 'Plan with ingredient requirements and shortages' })
  get(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.production.get(tenantId, id, user);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions(Permissions.ProductionManage)
  updateItem(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePlanItemDto,
  ) {
    return this.production.updateItem(tenantId, id, itemId, dto, user);
  }

  @Post(':id/confirm')
  @RequirePermissions(Permissions.ProductionManage)
  confirm(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.production.setStatus(tenantId, id, 'CONFIRMED', user);
  }

  @Post(':id/start')
  @RequirePermissions(Permissions.ProductionManage)
  start(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.production.setStatus(tenantId, id, 'IN_PROGRESS', user);
  }

  @Post(':id/complete')
  @RequirePermissions(Permissions.ProductionManage)
  complete(
    @TenantId() tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
  ) {
    return this.production.setStatus(tenantId, id, 'COMPLETED', user);
  }
}

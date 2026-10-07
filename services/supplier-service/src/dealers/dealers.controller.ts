import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import { DealersService } from './dealers.service';
import { DealerDto, TerritoryDto, UpdateDealerDto, UpdateTerritoryDto } from './dto/dealer.dto';

@ApiTags('seller')
@ApiBearerAuth()
@RequireTenant('WHOLESALER', 'SUPPLIER')
@RequirePermissions(Permissions.DealersManage)
@Controller('seller')
export class DealersController {
  constructor(private readonly dealers: DealersService) {}

  @Get('territories')
  @ApiOperation({ summary: 'Territories with month-to-date sales vs target' })
  territories(@TenantId() tenantId: string) {
    return this.dealers.territories(tenantId);
  }
  @Post('territories')
  createTerritory(@TenantId() tenantId: string, @Body() dto: TerritoryDto) {
    return this.dealers.createTerritory(tenantId, dto);
  }
  @Patch('territories/:id')
  updateTerritory(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTerritoryDto,
  ) {
    return this.dealers.updateTerritory(tenantId, id, dto);
  }

  @Get('dealers')
  @ApiOperation({ summary: 'Dealer network' })
  list(
    @TenantId() tenantId: string,
    @Query() q: { territoryId?: string; status?: string; q?: string },
  ) {
    return this.dealers.dealers(tenantId, q);
  }
  @Post('dealers')
  create(@TenantId() tenantId: string, @Body() dto: DealerDto) {
    return this.dealers.createDealer(tenantId, dto);
  }
  @Patch('dealers/:id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateDealerDto) {
    return this.dealers.updateDealer(tenantId, id, dto);
  }
  @Get('dealers/:id/orders')
  orders(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.dealers.dealerOrders(tenantId, id);
  }
}

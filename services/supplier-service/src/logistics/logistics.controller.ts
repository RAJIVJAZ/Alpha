import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { Public, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import { SlotDto, UpdateSlotDto, UpdateZoneDto, ZoneDto } from './dto/logistics.dto';
import { LogisticsService } from './logistics.service';

@ApiTags('seller')
@ApiBearerAuth()
@RequireTenant('SUPPLIER', 'WHOLESALER', 'RETAILER')
@RequirePermissions(Permissions.LogisticsManage)
@Controller('seller')
export class LogisticsController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get('delivery-zones')
  @ApiOperation({ summary: 'Delivery zones (pincodes or radius) with charges and lead times' })
  zones(@TenantId() tenantId: string) {
    return this.logistics.zones(tenantId);
  }
  @Post('delivery-zones')
  createZone(@TenantId() tenantId: string, @Body() dto: ZoneDto) {
    return this.logistics.createZone(tenantId, dto);
  }
  @Patch('delivery-zones/:id')
  updateZone(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.logistics.updateZone(tenantId, id, dto);
  }
  @Delete('delivery-zones/:id')
  @HttpCode(204)
  async deleteZone(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.logistics.deleteZone(tenantId, id);
  }

  @Get('delivery-slots')
  @ApiOperation({ summary: 'Delivery slots (retailers / distributors)' })
  slots(@TenantId() tenantId: string) {
    return this.logistics.slots(tenantId);
  }
  @Post('delivery-slots')
  createSlot(@TenantId() tenantId: string, @Body() dto: SlotDto) {
    return this.logistics.createSlot(tenantId, dto);
  }
  @Patch('delivery-slots/:id')
  updateSlot(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateSlotDto) {
    return this.logistics.updateSlot(tenantId, id, dto);
  }
}

@ApiTags('marketplace')
@Controller('marketplace/sellers')
export class SellerSlotsController {
  constructor(private readonly logistics: LogisticsService) {}

  @Public()
  @Get(':sellerId/slots')
  @ApiOperation({ summary: 'Bookable delivery slots for a date' })
  availability(@Param('sellerId') sellerId: string, @Query('date') date: string) {
    return this.logistics.availability(sellerId, date ?? new Date().toISOString().slice(0, 10));
  }
}

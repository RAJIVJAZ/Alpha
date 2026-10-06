import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { B2bOrdersService } from './b2b-orders.service';
import { ConfirmB2bOrderDto, DispatchDto, ListB2bOrdersDto, LocationDto, PlaceB2bOrderDto, RateSellerDto, RejectDto } from './dto/b2b-order.dto';

@ApiTags('marketplace')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART', 'RETAILER', 'WHOLESALER')
@Controller('marketplace/orders')
export class BuyerOrdersController {
  constructor(private readonly orders: B2bOrdersService) {}

  @Post()
  @RequirePermissions(Permissions.ProcurementManage)
  @ApiOperation({ summary: 'Place a B2B order directly from the marketplace' })
  place(@CurrentUser() user: AccessTokenClaims, @Body() dto: PlaceB2bOrderDto) {
    return this.orders.place({ ...dto, buyerTenantId: user.tenantId! });
  }

  @Get()
  @RequirePermissions(Permissions.ProcurementRead)
  list(@TenantId() tenantId: string, @Query() q: ListB2bOrdersDto) {
    return this.orders.list('buyer', tenantId, q);
  }

  @Get(':id')
  @RequirePermissions(Permissions.ProcurementRead)
  @ApiOperation({ summary: 'Order with tracking timeline' })
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.orders.get(tenantId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permissions.ProcurementManage)
  cancel(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: RejectDto) {
    return this.orders.cancel(id, { buyerTenantId: tenantId, reason: dto.reason });
  }

  @Post(':id/rating')
  @RequirePermissions(Permissions.ProcurementManage)
  rate(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: RateSellerDto) {
    return this.orders.rate(tenantId, id, dto);
  }
}

@ApiTags('seller')
@ApiBearerAuth()
@RequireTenant('SUPPLIER', 'WHOLESALER', 'RETAILER')
@RequirePermissions(Permissions.SalesOrdersManage)
@Controller('seller/orders')
export class SellerOrdersController {
  constructor(private readonly orders: B2bOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Incoming orders (incl. auto-generated purchase orders from restaurants)' })
  list(@TenantId() tenantId: string, @Query() q: ListB2bOrdersDto) {
    return this.orders.list('seller', tenantId, q);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.orders.get(tenantId, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Supplier order confirmation (full or partial) — reserves stock' })
  confirm(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: ConfirmB2bOrderDto) {
    return this.orders.confirm(tenantId, id, dto);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: RejectDto) {
    return this.orders.reject(tenantId, id, dto.reason);
  }

  @Post(':id/pack')
  @HttpCode(200)
  pack(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.orders.pack(tenantId, id);
  }

  @Post(':id/dispatch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delivery management: dispatch with vehicle / driver details' })
  dispatch(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: DispatchDto) {
    return this.orders.dispatch(tenantId, id, dto);
  }

  @Post(':id/location')
  @HttpCode(200)
  @ApiOperation({ summary: 'In-transit location update (delivery tracking)' })
  location(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: LocationDto) {
    return this.orders.location(tenantId, id, dto);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  deliver(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.orders.deliver(tenantId, id);
  }
}

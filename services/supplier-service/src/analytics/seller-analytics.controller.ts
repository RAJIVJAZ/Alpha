import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import { DateRangeQueryDto } from '@foodgrid/utils/server';
import { SellerAnalyticsService } from './seller-analytics.service';

@ApiTags('seller')
@ApiBearerAuth()
@RequireTenant('SUPPLIER', 'WHOLESALER', 'RETAILER')
@RequirePermissions(Permissions.ReportsRead)
@Controller('seller/analytics')
export class SellerAnalyticsController {
  constructor(private readonly analytics: SellerAnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Sales, fulfilment, on-time rate, top products and buyers' })
  summary(@TenantId() tenantId: string, @Query() q: DateRangeQueryDto) {
    return this.analytics.summary(tenantId, q);
  }
}

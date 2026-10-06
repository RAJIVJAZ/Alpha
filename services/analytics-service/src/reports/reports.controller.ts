import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, Roles, TenantId } from '@foodgrid/auth/nest';
import { DateRangeQueryDto, InternalHttpService } from '@foodgrid/utils/server';
import { ReportsService } from './reports.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly internal: InternalHttpService,
  ) {}

  // ─── platform (admin) ─────────────────────────────────────────────────────
  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/overview')
  @ApiOperation({ summary: 'GMV, revenue, orders, AOV, customers (with period-over-period change)' })
  overview(@Query() q: DateRangeQueryDto) {
    return this.reports.platformOverview(q);
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/retention')
  @ApiOperation({ summary: 'Customer retention cohorts (monthly)' })
  retention(@Query('months') months?: string) {
    return this.reports.retention(Math.min(24, Number(months) || 6));
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/top-outlets')
  topOutlets(@Query() q: DateRangeQueryDto & { limit?: number; city?: string }) {
    return this.reports.topOutlets(q);
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/cities')
  cities(@Query() q: DateRangeQueryDto) {
    return this.reports.cities(q);
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/restaurant-profitability')
  platformProfitability(@Query() q: DateRangeQueryDto & { outletId?: string; tenantId?: string }) {
    return this.reports.profitability(q);
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/riders')
  @ApiOperation({ summary: 'Rider performance leaderboard' })
  riders(@Query() q: DateRangeQueryDto & { limit?: number }) {
    return this.reports.riderPerformance(q);
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/suppliers')
  @ApiOperation({ summary: 'Supplier sales leaderboard' })
  suppliers(@Query() q: DateRangeQueryDto & { limit?: number }) {
    return this.reports.supplierSales(q);
  }

  // ─── merchant ──────────────────────────────────────────────────────────────
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.ReportsRead)
  @Get('outlet/sales')
  @ApiOperation({ summary: 'Daily sales report (channels, payment methods, hour × weekday heat map)' })
  outletSales(@TenantId() tenantId: string, @Query() q: DateRangeQueryDto & { outletId?: string }) {
    return this.reports.outletSales({ ...q, tenantId });
  }

  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.ReportsRead)
  @Get('outlet/profitability')
  @ApiOperation({ summary: 'Restaurant profitability: net sales − commission − food cost' })
  outletProfitability(@TenantId() tenantId: string, @Query() q: DateRangeQueryDto & { outletId?: string }) {
    return this.reports.profitability({ ...q, tenantId });
  }

  @RequireTenant('SUPPLIER', 'WHOLESALER', 'RETAILER')
  @RequirePermissions(Permissions.ReportsRead)
  @Get('seller/sales')
  sellerSales(@TenantId() tenantId: string, @Query() q: DateRangeQueryDto) {
    return this.reports.supplierSales({ ...q, tenantId });
  }

  // ─── rider ─────────────────────────────────────────────────────────────────
  @Roles('RIDER')
  @Get('rider/me')
  async riderMe(@CurrentUser('sub') userId: string, @Query() q: DateRangeQueryDto) {
    const rider = await this.internal.get<{ id: string }>('delivery', `internal/riders/by-user/${userId}`);
    return this.reports.riderDaily(rider.id, q);
  }
}

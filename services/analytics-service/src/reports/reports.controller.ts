import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { canAccessOutlet, Permissions } from '@foodgrid/auth';
import {
  CurrentUser,
  RequirePermissions,
  RequireTenant,
  Roles,
  TenantId,
} from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { forbidden } from '@foodgrid/utils';
import { DateRangeQueryDto, DirectoryService, InternalHttpService } from '@foodgrid/utils/server';
import { AnalyticsJobsService } from '../jobs/analytics-jobs.service';
import { ReportsService } from './reports.service';

/**
 * Outlets an outlet-scoped member may report on (undefined = every outlet of the tenant).
 * Same rule as order-service outletScope(); ponytail: move both into @foodgrid/auth.
 */
export function outletScope(user: AccessTokenClaims, outletId?: string): string[] | undefined {
  if (outletId) {
    if (!canAccessOutlet(user, outletId))
      throw forbidden('You do not have access to this outlet', 'OUTLET_FORBIDDEN');
    return [outletId];
  }
  return user.outletIds?.length ? user.outletIds : undefined;
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly internal: InternalHttpService,
    private readonly directory: DirectoryService,
    private readonly jobs: AnalyticsJobsService,
  ) {}

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Post('platform/outlet-scores/run')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Score every outlet for the last complete week now (normally Monday 04:00 IST)',
  })
  runScores() {
    return this.jobs.scoreOutlets();
  }

  // ─── platform (admin) ─────────────────────────────────────────────────────
  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/overview')
  @ApiOperation({
    summary: 'GMV, revenue, orders, AOV, customers (with period-over-period change)',
  })
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
  async topOutlets(@Query() q: DateRangeQueryDto & { limit?: number; city?: string }) {
    const rows = await this.reports.topOutlets(q);
    const [outlets, tenants] = await Promise.all([
      this.directory.lookup(
        'outlets',
        rows.map((r) => r.outletId),
      ),
      this.directory.lookup(
        'tenants',
        rows.map((r) => r.tenantId),
      ),
    ]);
    return rows.map((r) => ({
      ...r,
      outletName: outlets.get(r.outletId)?.name ?? null,
      tenantName: tenants.get(r.tenantId)?.name ?? null,
    }));
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/cities')
  cities(@Query() q: DateRangeQueryDto) {
    return this.reports.cities(q);
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/restaurant-profitability')
  async platformProfitability(
    @Query() q: DateRangeQueryDto & { outletId?: string; tenantId?: string },
  ) {
    const report = await this.reports.profitability({
      ...q,
      outletIds: q.outletId ? [q.outletId] : undefined,
    });
    const outlets = await this.directory.lookup(
      'outlets',
      report.byOutlet.map((r) => r.outletId),
    );
    return {
      ...report,
      byOutlet: report.byOutlet.map((r) => ({
        ...r,
        outletName: outlets.get(r.outletId)?.name ?? null,
      })),
    };
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/riders')
  @ApiOperation({ summary: 'Rider performance leaderboard' })
  async riders(@Query() q: DateRangeQueryDto & { limit?: number }) {
    const rows = await this.reports.riderPerformance(q);
    const riders = await this.directory.lookup(
      'riders',
      rows.map((r) => r.riderId),
    );
    return rows.map((r) => ({ ...r, name: riders.get(r.riderId)?.name ?? null }));
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('platform/suppliers')
  @ApiOperation({ summary: 'Supplier sales leaderboard' })
  async suppliers(@Query() q: DateRangeQueryDto & { limit?: number }) {
    const result = await this.reports.supplierSales(q);
    if (!Array.isArray(result)) return result;
    const rows = result;
    const tenants = await this.directory.lookup(
      'tenants',
      rows.map((r) => r.tenantId),
    );
    return rows.map((r) => ({
      ...r,
      name: tenants.get(r.tenantId)?.name ?? null,
      type: tenants.get(r.tenantId)?.type ?? null,
    }));
  }

  // ─── merchant ──────────────────────────────────────────────────────────────
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.ReportsRead)
  @Get('outlet/sales')
  @ApiOperation({
    summary: 'Daily sales report (channels, payment methods, hour × weekday heat map)',
  })
  outletSales(
    @CurrentUser() user: AccessTokenClaims,
    @TenantId() tenantId: string,
    @Query() q: DateRangeQueryDto & { outletId?: string },
  ) {
    return this.reports.outletSales({ ...q, tenantId, outletIds: outletScope(user, q.outletId) });
  }

  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.ReportsRead)
  @Get('outlet/profitability')
  @ApiOperation({ summary: 'Restaurant profitability: net sales − commission − food cost' })
  outletProfitability(
    @CurrentUser() user: AccessTokenClaims,
    @TenantId() tenantId: string,
    @Query() q: DateRangeQueryDto & { outletId?: string },
  ) {
    return this.reports.profitability({ ...q, tenantId, outletIds: outletScope(user, q.outletId) });
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
    const rider = await this.internal.get<{ id: string }>(
      'delivery',
      `internal/riders/by-user/${userId}`,
    );
    return this.reports.riderDaily(rider.id, q);
  }
}

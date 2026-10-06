import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import type { SupplierStrategy } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import { AlertsService } from '../alerts/alerts.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { ForecastsService } from '../forecasts/forecasts.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { SettingsService } from '../settings/settings.service';
import { AutoPoDto, CreatePoDto, DecisionDto, ListPoDto, ReceivePoDto, SettingsDto } from './dto/po.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('procurement')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART', 'RETAILER', 'WHOLESALER')
@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly pos: PurchaseOrdersService,
    private readonly alerts: AlertsService,
    private readonly forecasts: ForecastsService,
    private readonly recommendations: RecommendationsService,
    private readonly settings: SettingsService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('dashboard')
  @RequirePermissions(Permissions.ProcurementRead)
  @ApiOperation({ summary: 'Alerts by severity, pending approvals, in-transit POs, spend' })
  overview(@TenantId() tenantId: string) {
    return this.dashboard.overview(tenantId);
  }

  @Get('settings')
  @RequirePermissions(Permissions.ProcurementRead)
  getSettings(@TenantId() tenantId: string) {
    return this.settings.get(tenantId);
  }

  @Put('settings')
  @RequirePermissions(Permissions.ProcurementApprove)
  @ApiOperation({ summary: 'Auto-PO, approval threshold, default supplier strategy, service level' })
  putSettings(@TenantId() tenantId: string, @Body() dto: SettingsDto) {
    return this.settings.update(tenantId, dto);
  }

  // ─── forecasting & alerts ──────────────────────────────────────────────────
  @Post('forecasts/run')
  @HttpCode(200)
  @RequirePermissions(Permissions.ProcurementManage)
  @ApiOperation({ summary: 'Forecast ingredient demand (history + seasonality + weather + festivals)' })
  runForecasts(@TenantId() tenantId: string, @Query('outletId') outletId?: string) {
    return this.forecasts.runForTenant(tenantId, outletId);
  }

  @Get('forecasts/:ingredientId')
  @RequirePermissions(Permissions.ProcurementRead)
  forecastSeries(@TenantId() tenantId: string, @Param('ingredientId') ingredientId: string) {
    return this.forecasts.series(tenantId, ingredientId);
  }

  @Post('alerts/scan')
  @HttpCode(200)
  @RequirePermissions(Permissions.ProcurementManage)
  @ApiOperation({ summary: 'Predict depletion dates and raise reorder alerts' })
  scan(@TenantId() tenantId: string, @Query('outletId') outletId?: string) {
    return this.alerts.scan(tenantId, outletId);
  }

  @Get('alerts')
  @RequirePermissions(Permissions.ProcurementRead)
  listAlerts(@TenantId() tenantId: string, @Query() q: { status?: string; outletId?: string; severity?: string }) {
    return this.alerts.list(tenantId, q);
  }

  @Post('alerts/:id/dismiss')
  @HttpCode(200)
  @RequirePermissions(Permissions.ProcurementManage)
  dismiss(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.alerts.dismiss(tenantId, id);
  }

  // ─── supplier comparison ──────────────────────────────────────────────────
  @Get('recommendations')
  @RequirePermissions(Permissions.ProcurementRead)
  @ApiOperation({ summary: 'Compare prices across suppliers; best by lowest cost / fastest / best rated' })
  recommend(
    @TenantId() tenantId: string,
    @Query('ingredientId') ingredientId: string,
    @Query('quantity') quantity?: string,
    @Query('strategy') strategy?: SupplierStrategy,
  ) {
    return this.recommendations.recommend(tenantId, ingredientId, quantity ? Number(quantity) : undefined, strategy);
  }

  // ─── purchase orders ──────────────────────────────────────────────────────
  @Post('purchase-orders/auto')
  @RequirePermissions(Permissions.ProcurementManage)
  @ApiOperation({ summary: 'Auto-create POs for open alerts using the recommended suppliers' })
  auto(@TenantId() tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: AutoPoDto) {
    return this.pos.autoCreate(tenantId, userId, dto);
  }

  @Post('purchase-orders')
  @RequirePermissions(Permissions.ProcurementManage)
  create(@CurrentUser() user: AccessTokenClaims, @Body() dto: CreatePoDto) {
    return this.pos.createManual(user, dto);
  }

  @Get('purchase-orders')
  @RequirePermissions(Permissions.ProcurementRead)
  list(@TenantId() tenantId: string, @Query() q: ListPoDto) {
    return this.pos.list(tenantId, q);
  }

  @Get('purchase-orders/:id')
  @RequirePermissions(Permissions.ProcurementRead)
  @ApiOperation({ summary: 'PO with approval history and delivery tracking timeline' })
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.pos.get(tenantId, id);
  }

  @Post('purchase-orders/:id/submit')
  @HttpCode(200)
  @RequirePermissions(Permissions.ProcurementManage)
  submit(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.pos.submit(user, id);
  }

  @Post('purchase-orders/:id/approve')
  @HttpCode(200)
  @RequirePermissions(Permissions.ProcurementApprove)
  @ApiOperation({ summary: 'Owner approval — sends the PO to the supplier' })
  approve(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.pos.approve(user, id, dto.comment);
  }

  @Post('purchase-orders/:id/reject')
  @HttpCode(200)
  @RequirePermissions(Permissions.ProcurementApprove)
  reject(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.pos.reject(user, id, dto.comment);
  }

  @Post('purchase-orders/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permissions.ProcurementManage)
  cancel(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.pos.cancel(user, id, dto.comment);
  }

  @Post('purchase-orders/:id/receive')
  @HttpCode(200)
  @RequirePermissions(Permissions.InventoryManage)
  @ApiOperation({ summary: 'Goods receipt; stock is added to inventory automatically' })
  receive(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string, @Body() dto: ReceivePoDto) {
    return this.pos.receive(user, id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import type { InvoiceType } from '@foodgrid/database';
import { DateRangeQueryDto, DirectoryService } from '@foodgrid/utils/server';
import { GstService } from '../gst/gst.service';
import {
  CommissionRuleDto,
  ListSettlementsDto,
  MarkSettlementPaidDto,
  RunSettlementDto,
  UpdateCommissionRuleDto,
} from './dto/settlement.dto';
import { SettlementsService } from './settlements.service';

@ApiTags('settlements')
@ApiBearerAuth()
@RequireTenant()
@RequirePermissions(Permissions.FinanceRead)
@Controller()
export class MerchantFinanceController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly gst: GstService,
  ) {}

  @Get('settlements')
  @ApiOperation({ summary: 'My payouts (weekly settlements)' })
  list(@TenantId() tenantId: string, @Query() q: ListSettlementsDto) {
    return this.settlements.list({ ...q, tenantId });
  }

  @Get('settlements/pending')
  @ApiOperation({ summary: 'Accrued but not yet settled amounts' })
  pending(@TenantId() tenantId: string) {
    return this.settlements.pending(tenantId);
  }

  @Get('settlements/:id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.settlements.get(id, tenantId);
  }

  @Get('gst/invoices')
  invoices(
    @TenantId() tenantId: string,
    @Query() q: DateRangeQueryDto & { type?: InvoiceType; page?: number },
  ) {
    return this.gst.invoices({ ...q, tenantId });
  }

  @Get('gst/summary')
  summary(@TenantId() tenantId: string, @Query() q: DateRangeQueryDto) {
    return this.gst.summary({ ...q, tenantId });
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformFinance)
@Controller('admin')
export class AdminFinanceController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly gst: GstService,
    private readonly directory: DirectoryService,
  ) {}

  @Get('commission-rules')
  async rules() {
    const rules = await this.settlements.rules();
    const names = await this.directory.lookup(
      'tenants',
      rules.flatMap((r) => (r.tenantId ? [r.tenantId] : [])),
    );
    return rules.map((r) => ({
      ...r,
      tenantName: r.tenantId ? (names.get(r.tenantId)?.name ?? null) : null,
    }));
  }

  @Post('commission-rules')
  @ApiOperation({
    summary: 'Commission management: create a rule (platform / tenant type / tenant / outlet)',
  })
  createRule(@Body() dto: CommissionRuleDto, @CurrentUser('sub') actorId: string) {
    return this.settlements.createRule(dto, actorId);
  }

  @Patch('commission-rules/:id')
  updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateCommissionRuleDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.settlements.updateRule(id, dto, actorId);
  }

  @Get('settlements')
  async list(@Query() q: ListSettlementsDto) {
    const page = await this.settlements.list(q);
    const names = await this.directory.lookup(
      'tenants',
      page.data.map((s) => s.tenantId),
    );
    return {
      ...page,
      data: page.data.map((s) => ({ ...s, tenantName: names.get(s.tenantId)?.name ?? null })),
    };
  }

  @Get('settlements/:id')
  get(@Param('id') id: string) {
    return this.settlements.get(id);
  }

  @Post('settlements/run')
  @ApiOperation({ summary: 'Payment settlement: generate settlements for a period' })
  run(@Body() dto: RunSettlementDto) {
    return this.settlements.run(
      new Date(`${dto.periodStart.slice(0, 10)}T00:00:00+05:30`),
      new Date(`${dto.periodEnd.slice(0, 10)}T00:00:00+05:30`),
    );
  }

  @Post('settlements/:id/mark-paid')
  markPaid(@Param('id') id: string, @Body() dto: MarkSettlementPaidDto) {
    return this.settlements.markPaid(id, dto.payoutReference);
  }

  @Get('gst/summary')
  @ApiOperation({ summary: 'GST report: taxable value and CGST/SGST/IGST by invoice type' })
  gstSummary(@Query() q: DateRangeQueryDto) {
    return this.gst.summary(q);
  }

  @Get('gst/invoices')
  gstInvoices(@Query() q: DateRangeQueryDto & { type?: InvoiceType; page?: number }) {
    return this.gst.invoices(q);
  }

  @Get('gst/gstr8')
  @ApiOperation({ summary: 'GSTR-8 TCS report for a month (YYYY-MM)' })
  gstr8(@Query('month') month: string) {
    return this.gst.gstr8(month ?? new Date().toISOString().slice(0, 7));
  }
}

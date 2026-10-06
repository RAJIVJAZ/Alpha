import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { InternalHttpService, REDIS, withLock } from '@foodgrid/utils/server';
import { AlertsService } from '../alerts/alerts.service';
import { ForecastsService } from '../forecasts/forecasts.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Nightly smart-procurement cycle (05:00 IST, before kitchens open):
 * forecast → scan → auto-PO for tenants that enabled it.
 */
@Injectable()
export class ProcurementJobsService {
  private readonly logger = new Logger(ProcurementJobsService.name);

  constructor(
    private readonly internal: InternalHttpService,
    private readonly forecasts: ForecastsService,
    private readonly alerts: AlertsService,
    private readonly pos: PurchaseOrdersService,
    private readonly settings: SettingsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron('0 5 * * *', { timeZone: 'Asia/Kolkata' })
  async nightly() {
    await withLock(this.redis, 'procurement:nightly', 3 * 3600, () => this.runAll());
  }

  async runAll() {
    const pairs = await this.internal.get<{ tenantId: string; outletId: string }[]>('inventory', 'internal/inventory/tenants');
    const tenants = [...new Set(pairs.map((p) => p.tenantId))];
    for (const tenantId of tenants) {
      try {
        const f = await this.forecasts.runForTenant(tenantId);
        const a = await this.alerts.scan(tenantId);
        const s = await this.settings.get(tenantId);
        const po = s.autoPoEnabled ? await this.pos.autoCreate(tenantId, null) : null;
        this.logger.log(`tenant ${tenantId}: ${f.forecasted} forecasts, ${a.opened} new alerts, ${po?.created.length ?? 0} POs`);
      } catch (err) {
        this.logger.error(`procurement cycle failed for ${tenantId}: ${(err as Error).message}`);
      }
    }
    return { tenants: tenants.length };
  }
}

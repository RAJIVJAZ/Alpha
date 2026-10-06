import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@foodgrid/utils/server';
import { AlertsService } from './alerts/alerts.service';
import { ClientsService } from './clients/clients.service';
import { DashboardService } from './dashboard/dashboard.service';
import { ProcurementEventHandlers } from './events/procurement-event.handlers';
import { ForecastsService } from './forecasts/forecasts.service';
import { ProcurementJobsService } from './jobs/procurement-jobs.service';
import { ProcurementController } from './purchase-orders/purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service';
import { RecommendationsService } from './recommendations/recommendations.service';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';
import { SettingsService } from './settings/settings.service';

@Module({
  imports: [CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }), ScheduleModule.forRoot()],
  controllers: [ProcurementController],
  providers: [
    ClientsService,
    SettingsService,
    ForecastsService,
    AlertsService,
    RecommendationsService,
    PurchaseOrdersService,
    DashboardService,
    ProcurementEventHandlers,
    ProcurementJobsService,
  ],
})
export class AppModule {}

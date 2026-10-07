import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@foodgrid/utils/server';
import { GeoStore } from './common/geo-store';
import { DeliveryAdminController } from './deliveries/admin.controller';
import { DeliveriesController, RiderController } from './deliveries/deliveries.controller';
import { DeliveriesService } from './deliveries/deliveries.service';
import { DispatchService } from './dispatch/dispatch.service';
import { EarningsService } from './earnings/earnings.service';
import { DeliveryEventHandlers } from './events/delivery-event.handlers';
import { HeatmapService } from './heatmap/heatmap.service';
import { IncentivesService } from './incentives/incentives.service';
import { InternalController } from './internal/internal.controller';
import { DeliveryJobsService } from './jobs/delivery-jobs.service';
import { RidersService } from './riders/riders.service';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';
import { TrackingGateway } from './tracking/tracking.gateway';
import { ZonesController } from './zones/zones.controller';
import { ZonesService } from './zones/zones.service';

@Module({
  imports: [
    CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    RiderController,
    DeliveriesController,
    DeliveryAdminController,
    ZonesController,
    InternalController,
  ],
  providers: [
    GeoStore,
    ZonesService,
    RidersService,
    DispatchService,
    DeliveriesService,
    EarningsService,
    IncentivesService,
    HeatmapService,
    TrackingGateway,
    DeliveryEventHandlers,
    DeliveryJobsService,
  ],
})
export class AppModule {}

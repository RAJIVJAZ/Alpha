import { Module } from '@nestjs/common';
import { CoreModule } from '@foodgrid/utils/server';
import { AdsPublicController, CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';
import { AdsEventHandlers } from './events/ads-event.handlers';
import { InternalController } from './internal/internal.controller';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';
import { ServingService } from './serving/serving.service';

@Module({
  imports: [CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS })],
  controllers: [CampaignsController, AdsPublicController, InternalController],
  providers: [CampaignsService, ServingService, AdsEventHandlers],
})
export class AppModule {}

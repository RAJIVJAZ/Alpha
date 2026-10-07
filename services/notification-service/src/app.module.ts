import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@foodgrid/utils/server';
import { PushCampaignsController } from './campaigns/push-campaigns.controller';
import { PushCampaignsService } from './campaigns/push-campaigns.service';
import { NotificationEventHandlers } from './events/notification-event.handlers';
import { NotificationJobsService } from './jobs/notification-jobs.service';
import {
  InternalNotificationsController,
  NotificationsController,
  TemplatesController,
} from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { providerFactories } from './providers/providers';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';

@Module({
  imports: [
    CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    NotificationsController,
    TemplatesController,
    InternalNotificationsController,
    PushCampaignsController,
  ],
  providers: [
    ...providerFactories,
    NotificationsService,
    PushCampaignsService,
    NotificationEventHandlers,
    NotificationJobsService,
  ],
})
export class AppModule {}

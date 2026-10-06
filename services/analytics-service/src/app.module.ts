import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@foodgrid/utils/server';
import { AnalyticsEventHandlers } from './events/analytics-event.handlers';
import { AnalyticsJobsService } from './jobs/analytics-jobs.service';
import { ProjectionsService } from './projections/projections.service';
import { DirectoryService } from './reports/directory.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';

@Module({
  imports: [CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }), ScheduleModule.forRoot()],
  controllers: [ReportsController],
  providers: [DirectoryService, ProjectionsService, ReportsService, AnalyticsEventHandlers, AnalyticsJobsService],
})
export class AppModule {}

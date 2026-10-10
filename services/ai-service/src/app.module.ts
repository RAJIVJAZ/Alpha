import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@foodgrid/utils/server';
import { AiController } from './api/ai.controller';
import { InternalAiController } from './api/internal-ai.controller';
import { SignalsService } from './api/signals.service';
import { ModelRunsService } from './common/model-runs.service';
import { WeatherJobsService } from './jobs/weather-jobs.service';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';

@Module({
  imports: [
    CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }),
    ScheduleModule.forRoot(),
  ],
  controllers: [InternalAiController, AiController],
  providers: [ModelRunsService, SignalsService, WeatherJobsService],
})
export class AppModule {}

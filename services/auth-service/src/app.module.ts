import { Module } from '@nestjs/common';
import { CoreModule } from '@foodgrid/utils/server';
import { AuthFeatureModule } from './auth/auth.module';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';

@Module({
  imports: [
    CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }),
    AuthFeatureModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { CoreModule } from '@foodgrid/utils/server';
import { AdminModule } from './admin/admin.module';
import { CommonModule } from './common/common.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { CmsModule } from './cms/cms.module';
import { InternalModule } from './internal/internal.module';
import { MediaModule } from './media/media.module';
import { ProfileModule } from './profile/profile.module';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';
import { TenantsModule } from './tenants/tenants.module';

@Module({
  imports: [
    CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }),
    CommonModule,
    ApprovalsModule,
    ProfileModule,
    TenantsModule,
    AdminModule,
    CmsModule,
    MediaModule,
    InternalModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { CmsAdminController, CmsPublicController } from './cms.controller';
import { CmsService } from './cms.service';

@Module({ controllers: [CmsPublicController, CmsAdminController], providers: [CmsService] })
export class CmsModule {}

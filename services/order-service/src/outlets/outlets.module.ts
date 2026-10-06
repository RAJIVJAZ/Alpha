import { Module } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { OutletsMerchantController, OutletsPublicController } from './outlets.controller';
import { OutletsService } from './outlets.service';

@Module({
  controllers: [OutletsPublicController, OutletsMerchantController],
  providers: [OutletsService, DiscoveryService],
  exports: [OutletsService, DiscoveryService],
})
export class OutletsModule {}

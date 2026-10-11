import { Module } from '@nestjs/common';
import { CoreModule } from '@foodgrid/utils/server';
import { SellerAnalyticsController } from './analytics/seller-analytics.controller';
import { SellerAnalyticsService } from './analytics/seller-analytics.service';
import { TenantDirectory } from './common/tenant-directory.service';
import { DealersController } from './dealers/dealers.controller';
import { DealersService } from './dealers/dealers.service';
import { SupplierEventHandlers } from './events/supplier-event.handlers';
import { InternalController } from './internal/internal.controller';
import { LogisticsController, SellerSlotsController } from './logistics/logistics.controller';
import { LogisticsService } from './logistics/logistics.service';
import { B2bOrdersService } from './orders/b2b-orders.service';
import { BuyerOrdersController, SellerOrdersController } from './orders/b2b-orders.controller';
import {
  AdminCategoriesController,
  CatalogController,
  SellerProductsController,
} from './products/products.controller';
import { ProductsService } from './products/products.service';
import { QuotesService } from './quotes/quotes.service';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';

@Module({
  imports: [CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS })],
  controllers: [
    CatalogController,
    SellerProductsController,
    AdminCategoriesController,
    LogisticsController,
    SellerSlotsController,
    DealersController,
    BuyerOrdersController,
    SellerOrdersController,
    SellerAnalyticsController,
    InternalController,
  ],
  providers: [
    TenantDirectory,
    ProductsService,
    LogisticsService,
    DealersService,
    B2bOrdersService,
    QuotesService,
    SellerAnalyticsService,
    SupplierEventHandlers,
  ],
})
export class AppModule {}

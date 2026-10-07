import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@foodgrid/utils/server';
import { CartController } from './cart/cart.controller';
import { CartService } from './cart/cart.service';
import { CheckoutService } from './checkout/checkout.service';
import { MoneyJsonInterceptor } from './common/money';
import { CouponsController } from './coupons/coupons.controller';
import { CouponsService } from './coupons/coupons.service';
import { OrderEventHandlers } from './events/order-event.handlers';
import { InternalController } from './internal/internal.controller';
import { OrderJobsService } from './jobs/order-jobs.service';
import { KdsController } from './kds/kds.controller';
import { KdsService } from './kds/kds.service';
import { MembershipsController } from './memberships/memberships.controller';
import { MembershipsService } from './memberships/memberships.service';
import { MenuModule } from './menu/menu.module';
import { DirectOrderService } from './orders/direct-order.service';
import { OrderLifecycleService } from './orders/order-lifecycle.service';
import { MerchantOrdersController, OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { OutletsModule } from './outlets/outlets.module';
import { PosController } from './pos/pos.controller';
import { PosService } from './pos/pos.service';
import { QrController } from './qr/qr.controller';
import { QrService } from './qr/qr.service';
import { RecommendationsController } from './recommendations/recommendations.controller';
import { RecommendationsService } from './recommendations/recommendations.service';
import { ReviewsController } from './reviews/reviews.controller';
import { ReviewsService } from './reviews/reviews.service';
import { SearchModule } from './search/search.module';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';
import { SubscriptionsController } from './subscriptions/subscriptions.controller';
import { SubscriptionsService } from './subscriptions/subscriptions.service';

@Module({
  imports: [
    CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }),
    ScheduleModule.forRoot(),
    OutletsModule,
    MenuModule,
    SearchModule,
  ],
  controllers: [
    CartController,
    OrdersController,
    MerchantOrdersController,
    KdsController,
    PosController,
    QrController,
    CouponsController,
    ReviewsController,
    SubscriptionsController,
    MembershipsController,
    RecommendationsController,
    InternalController,
  ],
  providers: [
    // amounts leave the service as "700.00" strings, never Decimal.toJSON's "700"
    { provide: APP_INTERCEPTOR, useClass: MoneyJsonInterceptor },
    CartService,
    CheckoutService,
    OrdersService,
    OrderLifecycleService,
    DirectOrderService,
    KdsService,
    PosService,
    QrService,
    CouponsService,
    ReviewsService,
    SubscriptionsService,
    MembershipsService,
    RecommendationsService,
    OrderEventHandlers,
    OrderJobsService,
  ],
})
export class AppModule {}

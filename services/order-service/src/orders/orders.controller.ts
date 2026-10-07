import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { IdempotencyInterceptor } from '@foodgrid/utils/server';
import { CheckoutService } from '../checkout/checkout.service';
import { ReviewsService } from '../reviews/reviews.service';
import {
  AcceptOrderDto,
  CancelOrderDto,
  CheckoutDto,
  ListOrdersDto,
  MerchantOrdersQueryDto,
  ReviewDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly checkout: CheckoutService,
    private readonly reviews: ReviewsService,
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Retry-safe checkout' })
  @ApiOperation({ summary: 'Checkout the cart (creates the order; pay next via payment-service)' })
  place(
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Ip() ip: string,
  ) {
    return this.checkout.placeOrder(user, dto, { idempotencyKey, ip });
  }

  @Get()
  @ApiOperation({ summary: 'My orders' })
  list(@CurrentUser('sub') userId: string, @Query() q: ListOrdersDto) {
    return this.orders.listForCustomer(userId, q);
  }

  @Get(':id')
  get(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.orders.getForCustomer(userId, id);
  }

  @Get(':id/track')
  @ApiOperation({ summary: 'Live order tracking (timeline, rider, ETA, delivery OTP)' })
  track(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.orders.track(userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancelByCustomer(userId, id, dto.reason);
  }

  @Post(':id/reorder')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reorder: refill the cart with this order’s items' })
  reorder(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.orders.reorder(userId, id);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Rate the food and delivery' })
  review(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.reviews.create(userId, id, dto);
  }
}

@ApiTags('merchant')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('merchant/orders')
export class MerchantOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(Permissions.OrdersRead)
  @ApiOperation({ summary: 'Order management board with 24h status counts' })
  list(@CurrentUser() user: AccessTokenClaims, @Query() q: MerchantOrdersQueryDto) {
    return this.orders.listForMerchant(user, q);
  }

  @Get(':id')
  @RequirePermissions(Permissions.OrdersRead)
  get(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.orders.getForMerchant(user, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @RequirePermissions(Permissions.OrdersManage)
  accept(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: AcceptOrderDto,
  ) {
    return this.orders.merchantAccept(user, id, dto.prepTimeMins);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(Permissions.OrdersManage)
  reject(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.merchantTransition(user, id, 'REJECTED', dto.reason);
  }

  @Post(':id/preparing')
  @HttpCode(200)
  @RequirePermissions(Permissions.KdsOperate)
  preparing(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.orders.merchantTransition(user, id, 'PREPARING');
  }

  @Post(':id/ready')
  @HttpCode(200)
  @RequirePermissions(Permissions.KdsOperate)
  ready(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.orders.merchantTransition(user, id, 'READY');
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions(Permissions.OrdersManage)
  @ApiOperation({ summary: 'Hand over a takeaway / dine-in order' })
  complete(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.orders.merchantTransition(user, id, 'COMPLETED');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permissions.OrdersManage)
  cancel(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.merchantTransition(user, id, 'CANCELLED', dto.reason);
  }
}

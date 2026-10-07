import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@foodgrid/auth/nest';
import { CheckoutService } from '../checkout/checkout.service';
import { QuoteDto } from '../orders/dto/order.dto';
import { CartService } from './cart.service';
import { AddCartItemDto, ApplyCouponDto, UpdateCartLineDto } from './dto/cart.dto';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly checkout: CheckoutService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current cart (re-priced from the live menu)' })
  async get(@CurrentUser('sub') userId: string) {
    return this.checkout.cartView(await this.cart.hydrate(userId), null);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add an item (409 CART_OUTLET_MISMATCH when switching outlets)' })
  async add(@CurrentUser('sub') userId: string, @Body() dto: AddCartItemDto) {
    await this.cart.addItem(userId, dto);
    return this.get(userId);
  }

  @Patch('items/:lineId')
  async update(
    @CurrentUser('sub') userId: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateCartLineDto,
  ) {
    await this.cart.updateLine(userId, lineId, dto.quantity);
    return this.get(userId);
  }

  @Delete('items/:lineId')
  async remove(@CurrentUser('sub') userId: string, @Param('lineId') lineId: string) {
    await this.cart.updateLine(userId, lineId, 0);
    return this.get(userId);
  }

  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser('sub') userId: string) {
    await this.cart.clear(userId);
  }

  @Post('coupon')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Apply a coupon code to the cart',
    description:
      'The code is checked against this cart before it is stored. When it cannot be used the ' +
      'response is 422 with a readable `message` and a specific `code`: COUPON_INVALID (unknown), ' +
      'COUPON_INACTIVE, COUPON_NOT_STARTED, COUPON_EXPIRED, COUPON_NOT_APPLICABLE, ' +
      'COUPON_EXHAUSTED, COUPON_USED, COUPON_FIRST_ORDER, COUPON_MEMBERS_ONLY or COUPON_MIN_ORDER. ' +
      'Quotes re-check the stored code, since the cart can change afterwards.',
  })
  async applyCoupon(@CurrentUser('sub') userId: string, @Body() dto: ApplyCouponDto) {
    await this.checkout.applyCoupon(userId, dto.code);
    return this.get(userId);
  }

  @Delete('coupon')
  async removeCoupon(@CurrentUser('sub') userId: string) {
    await this.cart.setCoupon(userId, null);
    return this.get(userId);
  }

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Full bill: delivery fee, coupon, membership, GST, round-off' })
  quote(@CurrentUser('sub') userId: string, @Body() dto: QuoteDto) {
    return this.checkout.quote(userId, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { CouponsService } from './coupons.service';
import { CouponDto, PlatformCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@ApiTags('coupons')
@ApiBearerAuth()
@Controller()
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get('coupons')
  @ApiOperation({ summary: 'Coupons with eligibility — for an outlet, or platform-wide offers when outletId is omitted' })
  @ApiQuery({ name: 'outletId', required: false })
  available(@CurrentUser('sub') userId: string, @Query('outletId') outletId?: string) {
    return this.coupons.available(userId, outletId);
  }

  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.PromotionsManage)
  @Get('merchant/coupons')
  merchantList(@CurrentUser() user: AccessTokenClaims) {
    return this.coupons.merchantList(user);
  }

  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.PromotionsManage)
  @Post('merchant/coupons')
  merchantCreate(@CurrentUser() user: AccessTokenClaims, @Body() dto: CouponDto) {
    return this.coupons.merchantCreate(user, dto);
  }

  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.PromotionsManage)
  @Patch('merchant/coupons/:id')
  merchantUpdate(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.merchantUpdate(user, id, dto);
  }

  @RequirePermissions(Permissions.PlatformConfig)
  @Get('admin/coupons')
  adminList(@Query('active') active?: string) {
    return this.coupons.adminList({ active: active === undefined ? undefined : active === 'true' });
  }

  @RequirePermissions(Permissions.PlatformConfig)
  @Post('admin/coupons')
  adminCreate(@Body() dto: PlatformCouponDto) {
    return this.coupons.adminCreate(dto);
  }

  @RequirePermissions(Permissions.PlatformConfig)
  @Patch('admin/coupons/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.adminUpdate(id, dto);
  }
}

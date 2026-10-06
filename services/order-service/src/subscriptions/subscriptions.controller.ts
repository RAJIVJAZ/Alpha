import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, Public, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { PauseDto, SubscribeDto, SubscriptionPlanDto, UpdateSubscriptionPlanDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('meal-subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Public()
  @Get('outlets/:outletId/subscription-plans')
  plans(@Param('outletId') outletId: string) {
    return this.subs.plansForOutlet(outletId);
  }

  @ApiBearerAuth()
  @Post('meal-subscriptions')
  @ApiOperation({ summary: 'Subscribe to a meal plan (then pay with purpose MEAL_SUBSCRIPTION)' })
  subscribe(@CurrentUser('sub') userId: string, @Body() dto: SubscribeDto) {
    return this.subs.subscribe(userId, dto);
  }

  @ApiBearerAuth()
  @Get('meal-subscriptions')
  mine(@CurrentUser('sub') userId: string) {
    return this.subs.mine(userId);
  }

  @ApiBearerAuth()
  @Post('meal-subscriptions/:id/pause')
  @HttpCode(200)
  @ApiOperation({ summary: 'Skip days; the plan end date extends automatically' })
  pause(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: PauseDto) {
    return this.subs.pause(userId, id, dto);
  }

  @ApiBearerAuth()
  @Post('meal-subscriptions/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.subs.cancel(userId, id);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.MenuManage)
  @Post('merchant/subscription-plans')
  createPlan(@CurrentUser() user: AccessTokenClaims, @Body() dto: SubscriptionPlanDto) {
    return this.subs.createPlan(user, dto);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.MenuManage)
  @Patch('merchant/subscription-plans/:id')
  updatePlan(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string, @Body() dto: UpdateSubscriptionPlanDto) {
    return this.subs.updatePlan(user, id, dto);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.OrdersRead)
  @Get('merchant/subscription-plans')
  merchantPlans(@CurrentUser() user: AccessTokenClaims, @Query('outletId') outletId?: string) {
    return this.subs.merchantPlans(user, outletId);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.OrdersRead)
  @Get('merchant/subscribers')
  subscribers(@CurrentUser() user: AccessTokenClaims, @Query('outletId') outletId?: string) {
    return this.subs.merchantSubscribers(user, outletId);
  }
}

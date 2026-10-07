import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { DispatchService } from '../dispatch/dispatch.service';
import { EarningsService } from '../earnings/earnings.service';
import { IncentivesService } from '../incentives/incentives.service';
import { LocationPingDto, RiderOnboardingDto } from '../riders/dto/rider.dto';
import { RidersService } from '../riders/riders.service';
import { HeatmapService } from '../heatmap/heatmap.service';
import { riderView } from '../common/rider-view';
import { DeliveriesService } from './deliveries.service';
import { CompleteDeliveryDto, FailDeliveryDto, RejectOfferDto } from './dto/delivery.dto';

@ApiTags('rider')
@ApiBearerAuth()
@Controller('riders')
export class RiderController {
  constructor(
    private readonly riders: RidersService,
    private readonly earnings: EarningsService,
    private readonly incentives: IncentivesService,
    private readonly heatmap: HeatmapService,
    private readonly deliveries: DeliveriesService,
  ) {}

  @Post('onboarding')
  @ApiOperation({ summary: 'Apply to become a delivery partner (goes to admin approval)' })
  onboard(@CurrentUser() user: AccessTokenClaims, @Body() dto: RiderOnboardingDto) {
    return this.riders.onboard(user, dto);
  }

  @Get('me')
  me(@CurrentUser('sub') userId: string) {
    return this.riders.byUser(userId);
  }

  @Roles('RIDER')
  @Post('me/online')
  @HttpCode(200)
  @ApiOperation({ summary: 'Go online (attendance check-in)' })
  online(@CurrentUser('sub') userId: string, @Body() dto: LocationPingDto) {
    return this.riders.goOnline(userId, dto);
  }

  @Roles('RIDER')
  @Post('me/offline')
  @HttpCode(200)
  offline(@CurrentUser('sub') userId: string) {
    return this.riders.goOffline(userId);
  }

  @Roles('RIDER')
  @Post('me/location')
  @HttpCode(200)
  @ApiOperation({ summary: 'Live GPS update (streams to customers tracking the order)' })
  location(@CurrentUser('sub') userId: string, @Body() dto: LocationPingDto) {
    return this.riders.ping(userId, dto);
  }

  @Roles('RIDER')
  @Get('me/offers')
  @ApiOperation({ summary: 'Pending delivery offers (also pushed over the socket)' })
  offers(@CurrentUser('sub') userId: string) {
    return this.riders.offers(userId);
  }

  @Roles('RIDER')
  @Get('me/deliveries/current')
  async current(@CurrentUser('sub') userId: string) {
    return (await this.riders.current(userId)).map(riderView);
  }

  @Roles('RIDER')
  @Get('me/deliveries')
  async history(@CurrentUser('sub') userId: string, @Query('page') page?: number) {
    const trips = await this.riders.history(userId, Number(page) || 1);
    return { ...trips, data: trips.data.map(riderView) };
  }

  @Roles('RIDER')
  @Get('me/route')
  @ApiOperation({ summary: 'AI-optimised route for open deliveries with a navigation link' })
  route(@CurrentUser('sub') userId: string) {
    return this.deliveries.route(userId);
  }

  @Roles('RIDER')
  @Get('me/attendance')
  attendance(@CurrentUser('sub') userId: string, @Query('month') month?: string) {
    return this.riders.attendance(userId, month);
  }

  @Roles('RIDER')
  @Get('me/earnings')
  @ApiOperation({ summary: 'Earnings dashboard (by type and by day)' })
  earningsSummary(
    @CurrentUser('sub') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.earnings.summary(userId, { from, to });
  }

  @Roles('RIDER')
  @Get('me/incentives')
  myIncentives(@CurrentUser('sub') userId: string) {
    return this.incentives.forRider(userId);
  }

  @Roles('RIDER')
  @Get('heatmap')
  @ApiOperation({ summary: 'Demand heat map: where orders are and riders are not' })
  heat(@Query('city') city?: string) {
    return this.heatmap.build(city);
  }
}

@ApiTags('rider')
@ApiBearerAuth()
@Roles('RIDER')
@Controller('deliveries')
export class DeliveriesController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly deliveries: DeliveriesService,
  ) {}

  @Post('offers/:offerId/accept')
  @HttpCode(200)
  async accept(@CurrentUser('sub') userId: string, @Param('offerId') offerId: string) {
    return riderView(await this.dispatch.accept(userId, offerId));
  }

  @Post('offers/:offerId/reject')
  @HttpCode(200)
  reject(
    @CurrentUser('sub') userId: string,
    @Param('offerId') offerId: string,
    @Body() dto: RejectOfferDto,
  ) {
    return this.dispatch.reject(userId, offerId, dto.reason);
  }

  @Get(':id')
  async get(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return riderView(await this.deliveries.get(userId, id));
  }

  @Post(':id/arrived-pickup')
  @HttpCode(200)
  async arrivedPickup(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return riderView(await this.deliveries.arrivedAtPickup(userId, id));
  }

  @Post(':id/picked-up')
  @HttpCode(200)
  async pickedUp(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return riderView(await this.deliveries.pickedUp(userId, id));
  }

  @Post(':id/arrived-drop')
  @HttpCode(200)
  async arrivedDrop(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return riderView(await this.deliveries.arrivedAtDrop(userId, id));
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete with customer OTP or photo proof (upload via /media/presign)',
  })
  async complete(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: CompleteDeliveryDto,
  ) {
    return riderView(await this.deliveries.complete(userId, id, dto));
  }

  @Post(':id/fail')
  @HttpCode(200)
  async fail(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: FailDeliveryDto,
  ) {
    return riderView(await this.deliveries.fail(userId, id, dto));
  }
}

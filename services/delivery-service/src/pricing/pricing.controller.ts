import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, Public, RequirePermissions } from '@foodgrid/auth/nest';
import { DeliveryPricingDto } from './dto/pricing.dto';
import { PricingService, toPricingView } from './pricing.service';

@ApiTags('delivery')
@Controller('delivery/pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Delivery pricing in force: the customer fee rule and how riders are paid',
  })
  async current() {
    return toPricingView(await this.pricing.current());
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformFinance)
@Controller('admin/delivery-pricing')
export class PricingAdminController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @ApiOperation({ summary: 'Delivery pricing in force and its earlier versions (newest first)' })
  async list() {
    const [current, history] = await Promise.all([this.pricing.current(), this.pricing.history()]);
    return { current: toPricingView(current), history: history.map(toPricingView) };
  }

  @Post()
  @ApiOperation({
    summary: 'Change delivery pricing: adds the next version, used by new quotes and deliveries',
  })
  async create(@Body() dto: DeliveryPricingDto, @CurrentUser('sub') actorId: string) {
    return toPricingView(await this.pricing.create(dto, actorId));
  }
}

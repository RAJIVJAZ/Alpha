import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, Public, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { DiscoveryService } from './discovery.service';
import {
  CreateOutletDto,
  NearbyQueryDto,
  OutletAvailabilityDto,
  OutletLocationDto,
  UpdateOutletDto,
} from './dto/outlet.dto';
import { OutletsService } from './outlets.service';

@ApiTags('outlets')
@Controller('outlets')
export class OutletsPublicController {
  constructor(
    private readonly outlets: OutletsService,
    private readonly discovery: DiscoveryService,
  ) {}

  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Discover restaurants and food carts near a location' })
  nearby(@Query() q: NearbyQueryDto) {
    return this.discovery.nearby(q);
  }

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Outlet details' })
  details(@Param('idOrSlug') idOrSlug: string) {
    return this.outlets.publicDetails(idOrSlug);
  }

  @Public()
  @Get(':idOrSlug/menu')
  @ApiOperation({ summary: 'Browse the menu (categories, items, variants, add-ons)' })
  menu(@Param('idOrSlug') idOrSlug: string) {
    return this.outlets.publicMenu(idOrSlug);
  }
}

@ApiTags('merchant')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('merchant/outlets')
export class OutletsMerchantController {
  constructor(private readonly outlets: OutletsService) {}

  @Get()
  @RequirePermissions(Permissions.OrdersRead)
  mine(@CurrentUser() user: AccessTokenClaims) {
    return this.outlets.listMine(user);
  }

  @Post()
  @RequirePermissions(Permissions.OutletManage)
  create(@CurrentUser() user: AccessTokenClaims, @Body() dto: CreateOutletDto) {
    return this.outlets.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.OutletManage)
  update(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateOutletDto,
  ) {
    return this.outlets.update(user, id, dto);
  }

  @Post(':id/submit')
  @RequirePermissions(Permissions.OutletManage)
  @ApiOperation({ summary: 'Submit the outlet for platform approval' })
  submit(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.outlets.submit(user, id);
  }

  @Post(':id/availability')
  @RequirePermissions(Permissions.OrdersManage)
  @ApiOperation({ summary: 'Open / close for orders' })
  availability(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: OutletAvailabilityDto,
  ) {
    return this.outlets.setAvailability(user, id, dto.isOpen);
  }

  @Post(':id/pause')
  @RequirePermissions(Permissions.OutletManage)
  pause(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.outlets.pause(user, id, true);
  }

  @Post(':id/resume')
  @RequirePermissions(Permissions.OutletManage)
  resume(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.outlets.pause(user, id, false);
  }

  @Post(':id/location')
  @RequirePermissions(Permissions.PosOperate)
  @ApiOperation({ summary: 'Update a food cart’s live location' })
  location(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: OutletLocationDto,
  ) {
    return this.outlets.updateLocation(user, id, dto);
  }
}

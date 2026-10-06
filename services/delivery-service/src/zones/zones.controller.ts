import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { RequirePermissions } from '@foodgrid/auth/nest';
import { DeliveryZoneDto, UpdateDeliveryZoneDto } from './dto/zone.dto';
import { ZonesService } from './zones.service';

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformRiders)
@Controller('admin/delivery-zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get() list() {
    return this.zones.list();
  }
  @Post() create(@Body() dto: DeliveryZoneDto) {
    return this.zones.create(dto);
  }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateDeliveryZoneDto) {
    return this.zones.update(id, dto);
  }
}

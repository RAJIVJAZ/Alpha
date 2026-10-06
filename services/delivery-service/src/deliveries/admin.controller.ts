import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Permissions } from '@foodgrid/auth';
import { RequirePermissions } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import type { DeliveryStatus } from '@foodgrid/database';
import { DispatchService } from '../dispatch/dispatch.service';
import { HeatmapService } from '../heatmap/heatmap.service';
import { IncentiveSchemeDto, UpdateIncentiveSchemeDto } from '../incentives/dto/incentive.dto';
import { IncentivesService } from '../incentives/incentives.service';
import { AdminRiderStatusDto, ListRidersDto } from '../riders/dto/rider.dto';
import { RidersService } from '../riders/riders.service';

class ReassignDto {
  @ApiProperty() @IsString() riderId!: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformRiders)
@Controller('admin')
export class DeliveryAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riders: RidersService,
    private readonly dispatch: DispatchService,
    private readonly incentives: IncentivesService,
    private readonly heatmap: HeatmapService,
  ) {}

  @Get('riders')
  listRiders(@Query() q: ListRidersDto) {
    return this.riders.adminList(q);
  }

  @Patch('riders/:id')
  @ApiOperation({ summary: 'Suspend / reactivate / offboard a rider, move zone' })
  setRider(@Param('id') id: string, @Body() dto: AdminRiderStatusDto) {
    return this.riders.adminSetStatus(id, dto);
  }

  @Get('riders/live')
  @ApiOperation({ summary: 'Live rider map' })
  live(@Query('city') city?: string) {
    return this.riders.liveMap(city);
  }

  @Get('deliveries')
  deliveries(@Query('status') status?: DeliveryStatus) {
    return this.prisma.delivery.findMany({
      where: status ? { status } : { status: { notIn: ['DELIVERED', 'CANCELLED', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { rider: { select: { name: true, phone: true } } },
    });
  }

  @Post('deliveries/:id/reassign')
  @HttpCode(200)
  reassign(@Param('id') id: string, @Body() dto: ReassignDto) {
    return this.dispatch.reassign(id, dto.riderId);
  }

  @Get('incentives')
  listIncentives(@Query('active') active?: string) {
    return this.incentives.list(active === undefined ? undefined : active === 'true');
  }

  @Post('incentives')
  createIncentive(@Body() dto: IncentiveSchemeDto) {
    return this.incentives.create(dto);
  }

  @Patch('incentives/:id')
  updateIncentive(@Param('id') id: string, @Body() dto: UpdateIncentiveSchemeDto) {
    return this.incentives.update(id, dto);
  }

  @Get('heatmap')
  heat(@Query('city') city?: string) {
    return this.heatmap.build(city);
  }
}

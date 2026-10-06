import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import { notFound } from '@foodgrid/utils';
import { ServeDto } from '../campaigns/dto/campaign.dto';
import { ServingService } from '../serving/serving.service';

@ApiTags('internal')
@Internal()
@Controller('internal/ads')
export class InternalController {
  constructor(
    private readonly serving: ServingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('serve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the auction for a placement and return sponsored targets' })
  serve(@Body() dto: ServeDto) {
    return this.serving.serve(dto);
  }

  @Get('campaigns/:id/payable')
  async payable(@Param('id') id: string) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!c) throw notFound('Campaign', id);
    return { referenceId: id, amount: c.totalBudget.toString(), userId: null, tenantId: c.tenantId, payable: c.status === 'DRAFT', description: `Ad budget: ${c.name}` };
  }
}

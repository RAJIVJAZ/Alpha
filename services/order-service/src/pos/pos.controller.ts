import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { PosOrderDto, PosSummaryQueryDto } from './dto/pos.dto';
import { PosService } from './pos.service';

@ApiTags('pos')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Post('orders')
  @RequirePermissions(Permissions.PosOperate)
  @ApiOperation({ summary: 'Bill a counter / table order (paid, goes straight to the kitchen)' })
  create(@CurrentUser() user: AccessTokenClaims, @Body() dto: PosOrderDto) {
    return this.pos.createOrder(user, dto);
  }

  @Post('orders/:id/complete')
  @HttpCode(200)
  @RequirePermissions(Permissions.PosOperate)
  complete(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.pos.complete(user, id);
  }

  @Get('summary')
  @RequirePermissions(Permissions.OrdersRead)
  @ApiOperation({ summary: 'Daily sales: totals, payment split, hourly, top items' })
  summary(@CurrentUser() user: AccessTokenClaims, @Query() q: PosSummaryQueryDto) {
    return this.pos.summary(user, q.outletId, q.date);
  }
}

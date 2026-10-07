import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import type { KdsStatus } from '@foodgrid/database';
import { AccessTokenClaims, KDS_STATUSES } from '@foodgrid/types';
import { ToArray } from '@foodgrid/utils/server';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { KdsService } from './kds.service';

class KdsBoardQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() station?: string;
  @ApiPropertyOptional({ description: 'Comma separated statuses' })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsIn(KDS_STATUSES, { each: true })
  statuses?: KdsStatus[];
}

@ApiTags('kds')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@RequirePermissions(Permissions.KdsOperate)
@Controller('kds')
export class KdsController {
  constructor(
    private readonly kds: KdsService,
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  @Get('tickets')
  @ApiOperation({ summary: 'Kitchen display board (oldest first, priority tickets on top)' })
  board(@CurrentUser() user: AccessTokenClaims, @Query() q: KdsBoardQuery) {
    return this.kds.board(user, q);
  }

  @Post('tickets/:id/start')
  start(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.move(user, id, 'IN_PROGRESS');
  }

  @Post('tickets/:id/ready')
  @ApiOperation({ summary: 'Station finished; order turns READY when all stations are done' })
  ready(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.move(user, id, 'READY');
  }

  @Post('tickets/:id/bump')
  @ApiOperation({ summary: 'Clear the ticket from the screen (served / handed over)' })
  bump(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.move(user, id, 'SERVED');
  }

  @Post('tickets/:id/recall')
  recall(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.move(user, id, 'IN_PROGRESS');
  }

  private async move(user: AccessTokenClaims, id: string, status: KdsStatus) {
    await this.kds.getOwned(user, id);
    return this.prisma.$transaction(async (tx) => {
      const res = await this.kds.setStatus(tx, id, status);
      const order = await tx.order.findUniqueOrThrow({ where: { id: res.orderId } });
      if (res.firstStart && order.status === 'ACCEPTED') {
        await this.lifecycle.transitionInTx(tx, order.id, 'PREPARING', {
          actorType: 'MERCHANT',
          actorId: user.sub,
        });
      }
      if (res.allReady && ['ACCEPTED', 'PREPARING'].includes(order.status)) {
        await this.lifecycle.transitionInTx(tx, order.id, 'READY', {
          actorType: 'MERCHANT',
          actorId: user.sub,
          note: 'All stations ready',
        });
      }
      return { ticketId: id, status, orderReady: res.allReady };
    });
  }
}

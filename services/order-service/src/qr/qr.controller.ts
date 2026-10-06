import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, OptionalUser, Public, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { QrOrderDto, TableDto } from './dto/qr.dto';
import { QrService } from './qr.service';

@ApiTags('qr-ordering')
@Controller()
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Public()
  @Get('qr/:token')
  @ApiOperation({ summary: 'Resolve a table QR code to the outlet menu' })
  scan(@Param('token') token: string) {
    return this.qr.scan(token);
  }

  @Public()
  @Post('qr/:token/orders')
  @ApiOperation({ summary: 'Place a table order (pay at counter or online)' })
  order(@Param('token') token: string, @Body() dto: QrOrderDto, @OptionalUser() user?: AccessTokenClaims) {
    return this.qr.order(token, dto, user?.sub);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.OrdersRead)
  @Get('merchant/outlets/:outletId/tables')
  tables(@CurrentUser() user: AccessTokenClaims, @Param('outletId') outletId: string) {
    return this.qr.listTables(user, outletId);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.OutletManage)
  @Post('merchant/outlets/:outletId/tables')
  createTable(@CurrentUser() user: AccessTokenClaims, @Param('outletId') outletId: string, @Body() dto: TableDto) {
    return this.qr.createTable(user, outletId, dto);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.OutletManage)
  @Post('merchant/tables/:id/rotate-qr')
  @ApiOperation({ summary: 'Invalidate a printed QR code and issue a new one' })
  rotate(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.qr.rotateToken(user, id);
  }
}

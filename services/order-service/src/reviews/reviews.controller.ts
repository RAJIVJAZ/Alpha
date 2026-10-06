import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, Public, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { ReviewsService } from './reviews.service';

class ReplyDto {
  @ApiProperty() @IsString() @MaxLength(1000) reply!: string;
}
class ModerateDto {
  @ApiProperty({ enum: ['PUBLISHED', 'HIDDEN', 'FLAGGED'] }) @IsIn(['PUBLISHED', 'HIDDEN', 'FLAGGED']) status!: 'PUBLISHED' | 'HIDDEN' | 'FLAGGED';
}

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('outlets/:outletId/reviews')
  forOutlet(@Param('outletId') outletId: string, @Query('page') page?: number) {
    return this.reviews.forOutlet(outletId, Number(page) || 1);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.OrdersRead)
  @Get('merchant/reviews')
  merchant(@CurrentUser() user: AccessTokenClaims, @Query('outletId') outletId?: string, @Query('page') page?: number) {
    return this.reviews.forMerchant(user, outletId, Number(page) || 1);
  }

  @ApiBearerAuth()
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.OrdersManage)
  @Post('merchant/reviews/:id/reply')
  reply(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string, @Body() dto: ReplyDto) {
    return this.reviews.reply(user, id, dto.reply);
  }

  @ApiBearerAuth()
  @RequirePermissions(Permissions.PlatformContent)
  @Patch('admin/reviews/:id')
  moderate(@Param('id') id: string, @Body() dto: ModerateDto) {
    return this.reviews.moderate(id, dto.status);
  }
}

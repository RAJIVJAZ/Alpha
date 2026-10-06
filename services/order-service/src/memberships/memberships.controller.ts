import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentUser, Public } from '@foodgrid/auth/nest';
import { MembershipsService } from './memberships.service';

class PurchaseMembershipDto {
  @ApiProperty() @IsString() planId!: string;
}

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Public()
  @Get('plans')
  plans() {
    return this.memberships.plans();
  }

  @ApiBearerAuth()
  @Get('me')
  mine(@CurrentUser('sub') userId: string) {
    return this.memberships.mine(userId);
  }

  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Start a membership purchase (pay with purpose MEMBERSHIP)' })
  purchase(@CurrentUser('sub') userId: string, @Body() dto: PurchaseMembershipDto) {
    return this.memberships.purchase(userId, dto.planId);
  }
}

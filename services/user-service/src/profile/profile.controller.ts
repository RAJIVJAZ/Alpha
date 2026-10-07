import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@foodgrid/auth/nest';
import { AddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'My profile' })
  me(@CurrentUser('sub') userId: string) {
    return this.profile.get(userId);
  }

  @Patch()
  update(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto) {
    return this.profile.update(userId, dto);
  }

  @Get('addresses')
  addresses(@CurrentUser('sub') userId: string) {
    return this.profile.listAddresses(userId);
  }

  @Post('addresses')
  addAddress(@CurrentUser('sub') userId: string, @Body() dto: AddressDto) {
    return this.profile.addAddress(userId, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.profile.updateAddress(userId, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  async deleteAddress(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    await this.profile.deleteAddress(userId, id);
  }
}

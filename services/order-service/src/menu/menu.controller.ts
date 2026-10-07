import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import {
  BulkAvailabilityDto,
  CategoryDto,
  MenuItemDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';
import { MenuService } from './menu.service';

@ApiTags('merchant')
@ApiBearerAuth()
@RequireTenant('RESTAURANT', 'FOOD_CART')
@Controller('merchant')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get('outlets/:outletId/menu')
  @RequirePermissions(Permissions.OrdersRead)
  @ApiOperation({ summary: 'Full menu including unavailable items' })
  full(@CurrentUser() user: AccessTokenClaims, @Param('outletId') outletId: string) {
    return this.menu.fullMenu(user, outletId);
  }

  @Post('outlets/:outletId/categories')
  @RequirePermissions(Permissions.MenuManage)
  createCategory(
    @CurrentUser() user: AccessTokenClaims,
    @Param('outletId') outletId: string,
    @Body() dto: CategoryDto,
  ) {
    return this.menu.createCategory(user, outletId, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(Permissions.MenuManage)
  updateCategory(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.menu.updateCategory(user, id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @RequirePermissions(Permissions.MenuManage)
  async deleteCategory(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    await this.menu.deleteCategory(user, id);
  }

  @Post('outlets/:outletId/items')
  @RequirePermissions(Permissions.MenuManage)
  @ApiOperation({ summary: 'Create a menu item with variants and add-on groups' })
  createItem(
    @CurrentUser() user: AccessTokenClaims,
    @Param('outletId') outletId: string,
    @Body() dto: MenuItemDto,
  ) {
    return this.menu.createItem(user, outletId, dto);
  }

  @Patch('items/:id')
  @RequirePermissions(Permissions.MenuManage)
  updateItem(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.updateItem(user, id, dto);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @RequirePermissions(Permissions.MenuManage)
  async deleteItem(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    await this.menu.deleteItem(user, id);
  }

  @Post('items/availability')
  @RequirePermissions(Permissions.KdsOperate)
  @ApiOperation({ summary: 'Mark items in / out of stock in bulk' })
  bulkAvailability(@CurrentUser() user: AccessTokenClaims, @Body() dto: BulkAvailabilityDto) {
    return this.menu.bulkAvailability(user, dto);
  }
}

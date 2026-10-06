import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, Public, RequirePermissions } from '@foodgrid/auth/nest';
import { CmsService } from './cms.service';
import { BannerQueryDto, CmsBannerDto, CmsPageDto, UpdateCmsBannerDto, UpdateCmsPageDto } from './dto/cms.dto';

@ApiTags('cms')
@Controller('cms')
export class CmsPublicController {
  constructor(private readonly cms: CmsService) {}

  @Public()
  @Get('pages/:slug')
  @ApiOperation({ summary: 'Published CMS page (terms, privacy, FAQ ...)' })
  page(@Param('slug') slug: string) {
    return this.cms.publicPage(slug);
  }

  @Public()
  @Get('banners')
  @ApiOperation({ summary: 'Active banners for a placement / city' })
  banners(@Query() q: BannerQueryDto) {
    return this.cms.publicBanners(q);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformContent)
@Controller('admin/cms')
export class CmsAdminController {
  constructor(private readonly cms: CmsService) {}

  @Get('pages') pages() {
    return this.cms.listPages();
  }
  @Post('pages') createPage(@Body() dto: CmsPageDto, @CurrentUser('sub') actor: string) {
    return this.cms.createPage(dto, actor);
  }
  @Patch('pages/:id') updatePage(@Param('id') id: string, @Body() dto: UpdateCmsPageDto, @CurrentUser('sub') actor: string) {
    return this.cms.updatePage(id, dto, actor);
  }
  @Delete('pages/:id') @HttpCode(204) async archivePage(@Param('id') id: string) {
    await this.cms.deletePage(id);
  }
  @Get('banners') banners() {
    return this.cms.listBanners();
  }
  @Post('banners') createBanner(@Body() dto: CmsBannerDto) {
    return this.cms.createBanner(dto);
  }
  @Patch('banners/:id') updateBanner(@Param('id') id: string, @Body() dto: UpdateCmsBannerDto) {
    return this.cms.updateBanner(id, dto);
  }
  @Delete('banners/:id') @HttpCode(204) async deleteBanner(@Param('id') id: string) {
    await this.cms.deleteBanner(id);
  }
}

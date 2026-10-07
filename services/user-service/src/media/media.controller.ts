import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@foodgrid/auth/nest';
import { PresignDto } from './dto/media.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('presign')
  @ApiOperation({
    summary: 'Get a presigned S3 URL to upload an image / KYC document / delivery proof',
  })
  presign(@CurrentUser('sub') userId: string, @Body() dto: PresignDto) {
    return this.media.presign(userId, dto);
  }
}

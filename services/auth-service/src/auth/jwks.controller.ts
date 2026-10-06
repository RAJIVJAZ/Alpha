import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenService } from '@foodgrid/auth';
import { Public } from '@foodgrid/auth/nest';

@ApiTags('auth')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly tokens: AccessTokenService) {}

  @Public()
  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Public signing keys (JWKS) for access-token verification' })
  jwks() {
    return this.tokens.jwks();
  }
}

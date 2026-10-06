import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Internal, Public } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { AuthService } from './auth.service';
import {
  GoogleLoginDto,
  PasswordLoginDto,
  RefreshTokenDto,
  RequestOtpDto,
  RevokeUserSessionsDto,
  SwitchTenantDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { ClientMeta, SessionService } from './session.service';

const metaFrom = (req: Request, ip: string, deviceId?: string): ClientMeta => ({
  ip,
  userAgent: req.headers['user-agent'],
  deviceId: deviceId ?? (req.headers['x-device-id'] as string | undefined),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a 6-digit login OTP by SMS (rate limited)' })
  requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.requestOtp(dto.phone, metaFrom(req, ip));
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify OTP; signs up new users automatically and returns tokens' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.verifyOtp(dto, metaFrom(req, ip, dto.deviceId));
  }

  @Public()
  @Post('google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with a Google ID token' })
  google(@Body() dto: GoogleLoginDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.loginWithGoogle(dto.idToken, metaFrom(req, ip, dto.deviceId));
  }

  @Public()
  @Post('password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Email + password login (back-office and merchant staff)' })
  password(@Body() dto: PasswordLoginDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.loginWithPassword(dto.email, dto.password, metaFrom(req, ip, dto.deviceId));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token and obtain a new access token' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request, @Ip() ip: string) {
    return this.sessions.refresh(dto.refreshToken, metaFrom(req, ip));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the session behind a refresh token' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.sessions.revokeByToken(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('switch-tenant')
  @HttpCode(200)
  @ApiOperation({ summary: 'Select the active business (tenant) for merchant dashboards' })
  switchTenant(@CurrentUser() user: AccessTokenClaims, @Body() dto: SwitchTenantDto) {
    return this.sessions.switchTenant(user, dto.tenantId);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user with business memberships' })
  me(@CurrentUser() user: AccessTokenClaims) {
    return this.auth.me(user.sub, user.tenantId);
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'Active login sessions / devices' })
  listSessions(@CurrentUser() user: AccessTokenClaims) {
    return this.sessions.listSessions(user.sub, user.sid);
  }

  @ApiBearerAuth()
  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(@CurrentUser() user: AccessTokenClaims, @Param('sessionId') sessionId: string) {
    await this.sessions.revokeSession(user.sub, sessionId);
  }
}


/** Service-to-service endpoints (never routed by the public gateway). */
@ApiTags('internal')
@Controller('internal/auth')
export class InternalAuthController {
  constructor(private readonly sessions: SessionService) {}

  @Internal()
  @Post('revoke-user-sessions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke every session of a user (e.g. account blocked)' })
  async revokeUser(@Body() dto: RevokeUserSessionsDto) {
    return { revoked: await this.sessions.revokeAllForUser(dto.userId) };
  }
}

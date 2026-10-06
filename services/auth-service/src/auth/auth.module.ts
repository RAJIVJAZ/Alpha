import { Module } from '@nestjs/common';
import { AuthController, InternalAuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleTokenVerifier } from './google-verifier';
import { JwksController } from './jwks.controller';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController, InternalAuthController, JwksController],
  providers: [AuthService, SessionService, GoogleTokenVerifier],
})
export class AuthFeatureModule {}

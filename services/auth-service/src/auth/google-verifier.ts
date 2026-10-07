import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '@foodgrid/utils';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/** Verifies Google ID tokens issued to any of our OAuth clients (web, Android, iOS). */
@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  private readonly audiences = (process.env.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  async verify(idToken: string): Promise<GoogleProfile> {
    if (!this.audiences.length)
      throw new AppError('GOOGLE_NOT_CONFIGURED', 'Google login is not configured', 503);
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new Error('missing claims');
      return {
        sub: p.sub,
        email: p.email.toLowerCase(),
        emailVerified: !!p.email_verified,
        name: p.name,
        picture: p.picture,
      };
    } catch {
      throw new AppError('GOOGLE_TOKEN_INVALID', 'Invalid Google credential', 401);
    }
  }
}

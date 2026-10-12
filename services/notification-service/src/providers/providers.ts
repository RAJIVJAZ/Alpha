import { Logger } from '@nestjs/common';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GoogleAuth } from 'google-auth-library';

export interface DeliveryResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** Token is permanently invalid and should be deactivated. */
  invalidToken?: boolean;
}

export interface SmsProvider {
  readonly name: string;
  /** vars: the template's data (e.g. code, minutes) for gateways that send DLT templates. */
  send(phone: string, body: string, vars?: Record<string, unknown>): Promise<DeliveryResult>;
}
export interface PushProvider {
  readonly name: string;
  send(
    token: string,
    msg: { title: string; body: string; data?: Record<string, string>; imageUrl?: string },
  ): Promise<DeliveryResult>;
}
export interface EmailProvider {
  readonly name: string;
  send(to: string, subject: string, html: string): Promise<DeliveryResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

const logger = new Logger('Notifications');

// ─── console (local development) ─────────────────────────────────────────────
export class ConsoleSms implements SmsProvider {
  readonly name = 'console';
  async send(phone: string, body: string) {
    logger.log(`[SMS → ${phone}] ${body}`);
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}
export class ConsolePush implements PushProvider {
  readonly name = 'console';
  async send(token: string, msg: { title: string; body: string }) {
    logger.log(`[PUSH → ${token.slice(0, 12)}…] ${msg.title}: ${msg.body}`);
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}
export class ConsoleEmail implements EmailProvider {
  readonly name = 'console';
  async send(to: string, subject: string) {
    logger.log(`[EMAIL → ${to}] ${subject}`);
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}

// ─── AWS SNS (transactional SMS, India DLT sender id) ───────────────────────
export class SnsSms implements SmsProvider {
  readonly name = 'sns';
  private readonly client = new SNSClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });
  async send(phone: string, body: string) {
    try {
      const res = await this.client.send(
        new PublishCommand({
          PhoneNumber: phone,
          Message: body,
          MessageAttributes: {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
            ...(process.env.SMS_SENDER_ID
              ? {
                  'AWS.SNS.SMS.SenderID': {
                    DataType: 'String',
                    StringValue: process.env.SMS_SENDER_ID,
                  },
                }
              : {}),
            ...(process.env.SMS_DLT_ENTITY_ID
              ? {
                  'AWS.MM.SMS.EntityId': {
                    DataType: 'String',
                    StringValue: process.env.SMS_DLT_ENTITY_ID,
                  },
                }
              : {}),
            // India: the registered DLT template the body matches (needed with the entity id)
            ...(process.env.SMS_DLT_TEMPLATE_ID
              ? {
                  'AWS.MM.SMS.TemplateId': {
                    DataType: 'String',
                    StringValue: process.env.SMS_DLT_TEMPLATE_ID,
                  },
                }
              : {}),
          },
        }),
      );
      return { ok: true, providerMessageId: res.MessageId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

// ─── MSG91 (popular Indian SMS gateway, OTP flow) ───────────────────────────
/**
 * Sends the MSG91 flow MSG91_TEMPLATE_ID, linked to a DLT-approved template. Flows fill only
 * the variables they name, so the template's data goes as variables (the login code flow uses
 * ##code## and ##minutes##); DLT rejects a whole message passed as one variable.
 */
export class Msg91Sms implements SmsProvider {
  readonly name = 'msg91';
  async send(phone: string, body: string, vars?: Record<string, unknown>) {
    const values = vars
      ? Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v)]))
      : { message: body };
    try {
      const res = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { authkey: process.env.MSG91_AUTH_KEY ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: process.env.MSG91_TEMPLATE_ID,
          recipients: [{ mobiles: phone.replace('+', ''), ...values }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      const json = (await res.json()) as { type?: string; message?: string };
      return res.ok && json.type === 'success'
        ? { ok: true, providerMessageId: json.message }
        : { ok: false, error: json.message ?? `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

// ─── Firebase Cloud Messaging HTTP v1 ───────────────────────────────────────
export class FcmPush implements PushProvider {
  readonly name = 'fcm';
  private readonly projectId: string;
  private readonly auth: GoogleAuth;

  constructor(serviceAccountBase64: string) {
    const credentials = JSON.parse(
      Buffer.from(serviceAccountBase64, 'base64').toString('utf8'),
    ) as { project_id: string };
    this.projectId = credentials.project_id;
    this.auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
  }

  async send(
    token: string,
    msg: { title: string; body: string; data?: Record<string, string>; imageUrl?: string },
  ) {
    try {
      const client = await this.auth.getClient();
      const { token: accessToken } = await client.getAccessToken();
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: msg.title, body: msg.body, image: msg.imageUrl },
              data: msg.data,
              android: {
                priority: 'HIGH',
                notification: { channel_id: msg.data?.channel ?? 'orders' },
              },
              apns: { payload: { aps: { sound: 'default' } } },
            },
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      const json = (await res.json()) as {
        name?: string;
        error?: { status?: string; message?: string };
      };
      if (res.ok) return { ok: true, providerMessageId: json.name };
      const invalid = ['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND'].includes(
        json.error?.status ?? '',
      );
      return {
        ok: false,
        error: json.error?.message ?? `HTTP ${res.status}`,
        invalidToken: invalid,
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

// ─── Amazon SES ─────────────────────────────────────────────────────────────
export class SesEmail implements EmailProvider {
  readonly name = 'ses';
  // SES_* when the AWS_* variables belong to other S3-compatible storage (e.g. R2 on Railway);
  // otherwise AWS_REGION and the default credential chain (IRSA on Kubernetes)
  private readonly client = new SESv2Client({
    region: process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1',
    ...(process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.SES_ACCESS_KEY_ID,
            secretAccessKey: process.env.SES_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
  async send(to: string, subject: string, html: string) {
    try {
      const res = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: process.env.SES_FROM_ADDRESS ?? 'no-reply@foodgrid.in',
          Destination: { ToAddresses: [to] },
          Content: { Simple: { Subject: { Data: subject }, Body: { Html: { Data: html } } } },
        }),
      );
      return { ok: true, providerMessageId: res.MessageId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

export const providerFactories = [
  {
    provide: SMS_PROVIDER,
    useFactory: (): SmsProvider => {
      if (process.env.SMS_PROVIDER === 'sns') return new SnsSms();
      if (process.env.SMS_PROVIDER === 'msg91') {
        // without both every login code fails at MSG91; say so at boot (push and email still work)
        if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID)
          logger.error(
            'SMS_PROVIDER=msg91 needs MSG91_AUTH_KEY and MSG91_TEMPLATE_ID: SMS will fail',
          );
        return new Msg91Sms();
      }
      return new ConsoleSms();
    },
  },
  {
    provide: PUSH_PROVIDER,
    useFactory: (): PushProvider =>
      process.env.PUSH_PROVIDER === 'fcm' && process.env.FCM_SERVICE_ACCOUNT_BASE64
        ? new FcmPush(process.env.FCM_SERVICE_ACCOUNT_BASE64)
        : new ConsolePush(),
  },
  {
    provide: EMAIL_PROVIDER,
    useFactory: (): EmailProvider =>
      process.env.EMAIL_PROVIDER === 'ses' ? new SesEmail() : new ConsoleEmail(),
  },
];

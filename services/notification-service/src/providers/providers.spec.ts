import { Msg91Sms, SesEmail } from './providers';

describe('Msg91Sms', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: 'success', message: 'req-1' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.MSG91_AUTH_KEY = 'key';
    process.env.MSG91_TEMPLATE_ID = 'tpl_login';
  });

  it('fills the DLT template variables instead of sending the whole message', async () => {
    const res = await new Msg91Sms().send('+919800000001', '482913 is your FoodGrid login code.', {
      code: '482913',
      minutes: 5,
    });
    expect(res).toEqual({ ok: true, providerMessageId: 'req-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/flow/');
    expect(JSON.parse(init.body as string)).toEqual({
      template_id: 'tpl_login',
      recipients: [{ mobiles: '919800000001', code: '482913', minutes: '5' }],
    });
  });

  it('reports the gateway error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ type: 'error', message: 'Template not found' }),
    });
    expect(await new Msg91Sms().send('+919800000001', 'x', { code: '1' })).toEqual({
      ok: false,
      error: 'Template not found',
    });
  });
});

describe('SesEmail', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const config = (e: SesEmail) =>
    (
      e as unknown as {
        client: {
          config: {
            region: () => Promise<string>;
            credentials: () => Promise<{ accessKeyId: string }>;
          };
        };
      }
    ).client.config;

  it('uses its own region and keys when AWS_* belong to other storage (R2 on Railway)', async () => {
    Object.assign(process.env, {
      AWS_REGION: 'auto',
      AWS_ACCESS_KEY_ID: 'r2-key',
      AWS_SECRET_ACCESS_KEY: 'r2-secret',
      SES_REGION: 'ap-south-1',
      SES_ACCESS_KEY_ID: 'ses-key',
      SES_SECRET_ACCESS_KEY: 'ses-secret',
    });
    const c = config(new SesEmail());
    expect(await c.region()).toBe('ap-south-1');
    expect((await c.credentials()).accessKeyId).toBe('ses-key');
  });

  it('falls back to AWS_REGION', async () => {
    delete process.env.SES_REGION;
    process.env.AWS_REGION = 'eu-west-1';
    expect(await config(new SesEmail()).region()).toBe('eu-west-1');
  });
});

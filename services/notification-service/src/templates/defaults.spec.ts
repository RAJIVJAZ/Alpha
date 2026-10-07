import { DEFAULT_TEMPLATES, render } from './defaults';

describe('templates', () => {
  it('renders placeholders and drops missing ones', () => {
    expect(
      render('Order {{orderNumber}} for {{ name }}', { orderNumber: 'ORD-1', name: 'Asha' }),
    ).toBe('Order ORD-1 for Asha');
    expect(render('Refund {{missing}} done', {})).toBe('Refund done');
  });
  it('ships an OTP SMS template', () => {
    expect(
      render(DEFAULT_TEMPLATES['auth.otp']!.SMS!.body, { code: '123456', minutes: 5 }),
    ).toContain('123456');
  });
});

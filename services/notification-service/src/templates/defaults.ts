/**
 * Built-in templates (English). Rows in notifications.NotificationTemplate
 * with the same key/channel/locale override these at runtime, so copy can be
 * changed from the admin panel without a deploy. Placeholders: {{name}}.
 */
export interface TemplateContent {
  title?: string;
  body: string;
}

export const DEFAULT_TEMPLATES: Record<string, Partial<Record<'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP', TemplateContent>>> = {
  'auth.otp': { SMS: { body: '{{code}} is your FoodGrid login code. It expires in {{minutes}} minutes. Do not share it with anyone.' } },
  'user.welcome': { IN_APP: { title: 'Welcome to FoodGrid 🎉', body: 'Use code WELCOME50 to get 50% off your first order.' } },

  'order.placed.merchant': { PUSH: { title: 'New order #{{orderNumber}}', body: '{{itemsCount}} item(s) · ₹{{total}} · accept within 5 minutes' } },
  'order.placed.customer': { IN_APP: { title: 'Order placed', body: 'Waiting for {{outletName}} to confirm your order.' } },
  'order.accepted': { PUSH: { title: 'Order confirmed ✅', body: '{{outletName}} is preparing your food.' } },
  'order.ready.takeaway': { PUSH: { title: 'Ready for pickup', body: 'Your order #{{orderNumber}} is ready at {{outletName}}.' } },
  'order.picked_up': { PUSH: { title: 'On the way 🛵', body: 'Your order is on the way. Share OTP {{otp}} with the rider.' } },
  'order.delivered': { PUSH: { title: 'Delivered — enjoy your meal!', body: 'How was {{outletName}}? Tap to rate.' } },
  'order.cancelled': { PUSH: { title: 'Order cancelled', body: 'Order #{{orderNumber}} was cancelled. {{refundNote}}' } },
  'order.rejected': { PUSH: { title: 'Order could not be accepted', body: '{{outletName}} could not take your order. {{refundNote}}' } },
  'delivery.assigned': { PUSH: { title: '{{riderName}} is picking up your order', body: 'Track your rider live in the app.' } },
  'payment.failed': { PUSH: { title: 'Payment failed', body: 'Retry payment for order #{{referenceShort}} to place it.' } },
  'refund.processed': { PUSH: { title: 'Refund processed', body: '₹{{amount}} has been refunded {{destination}}.' } },

  'rider.offer': { PUSH: { title: 'New delivery ₹{{earning}}', body: '{{distance}} km trip · order #{{orderNumber}} · accept in 45s' } },
  'rider.incentive': { PUSH: { title: 'Incentive unlocked 🏆', body: '₹{{reward}} for "{{scheme}}" has been added to your wallet.' } },

  'inventory.low': { PUSH: { title: 'Low stock: {{ingredient}}', body: 'Only {{stock}} {{unit}} left. Review the reorder suggestion.' } },
  'procurement.po.approval': { PUSH: { title: 'PO {{poNumber}} needs approval', body: '{{supplier}} · ₹{{total}}' } },
  'procurement.po.received_by_supplier': { PUSH: { title: 'New purchase order {{poNumber}}', body: 'From {{buyer}} · ₹{{total}} — confirm in the supplier dashboard.' } },
  'marketplace.order.update': { PUSH: { title: 'Order {{orderNumber}}: {{status}}', body: '{{note}}' } },

  'approval.decided': {
    PUSH: { title: 'Your {{entity}} application was {{decision}}', body: '{{notes}}' },
    EMAIL: { title: 'FoodGrid: {{entity}} {{decision}}', body: '<p>Your {{entity}} application was <b>{{decision}}</b>.</p><p>{{notes}}</p>' },
  },
};

export function render(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => (data[key] === undefined || data[key] === null ? '' : String(data[key]))).replace(/\s+/g, ' ').trim();
}

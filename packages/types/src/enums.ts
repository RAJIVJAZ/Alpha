/**
 * String-literal mirrors of the Prisma enums that cross service / client
 * boundaries. A parity test in @foodgrid/database fails the build if these
 * drift from prisma/schema.
 */
const values = <T extends string>(...v: T[]) => Object.freeze(v);

export const TENANT_TYPES = values(
  'PLATFORM',
  'RESTAURANT',
  'FOOD_CART',
  'SUPPLIER',
  'WHOLESALER',
  'RETAILER',
);
export type TenantType = (typeof TENANT_TYPES)[number];

export const TENANT_STATUSES = values('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED');
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const PLATFORM_ROLES = values('CUSTOMER', 'RIDER', 'ADMIN', 'SUPPORT', 'FINANCE', 'OPS');
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const TENANT_ROLES = values(
  'OWNER',
  'MANAGER',
  'CHEF',
  'CASHIER',
  'STAFF',
  'ACCOUNTANT',
  'PROCUREMENT_MANAGER',
);
export type TenantRole = (typeof TENANT_ROLES)[number];

export const OUTLET_TYPES = values('RESTAURANT', 'FOOD_CART', 'CLOUD_KITCHEN');
export type OutletType = (typeof OUTLET_TYPES)[number];

export const OUTLET_STATUSES = values(
  'DRAFT',
  'PENDING_APPROVAL',
  'ACTIVE',
  'PAUSED',
  'SUSPENDED',
  'CLOSED',
);
export type OutletStatus = (typeof OUTLET_STATUSES)[number];

export const ORDER_CHANNELS = values('APP', 'WEB', 'QR', 'POS');
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_TYPES = values('DELIVERY', 'TAKEAWAY', 'DINE_IN');
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = values(
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
);
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = values(
  'PENDING',
  'PAID',
  'COD_PENDING',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
);
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = values('UPI', 'CARD', 'NETBANKING', 'WALLET', 'COD', 'CASH');
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PURPOSES = values(
  'ORDER',
  'WALLET_TOPUP',
  'MEMBERSHIP',
  'MEAL_SUBSCRIPTION',
  'B2B_ORDER',
  'AD_CAMPAIGN',
);
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PAYMENT_STATES = values(
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'CANCELLED',
);
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const KDS_STATUSES = values('QUEUED', 'IN_PROGRESS', 'READY', 'SERVED', 'CANCELLED');
export type KdsStatus = (typeof KDS_STATUSES)[number];

export const COUPON_TYPES = values('FLAT', 'PERCENT', 'FREE_DELIVERY');
export type CouponType = (typeof COUPON_TYPES)[number];

export const DELIVERY_STATUSES = values(
  'UNASSIGNED',
  'SEARCHING',
  'ASSIGNED',
  'AT_PICKUP',
  'PICKED_UP',
  'AT_DROP',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
);
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const VEHICLE_TYPES = values('BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'EV_SCOOTER');
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const INGREDIENT_CATEGORIES = values(
  'FLOUR',
  'OIL',
  'SUGAR',
  'DAIRY',
  'VEGETABLES',
  'FRUITS',
  'PACKAGING',
  'SPICES',
  'GRAINS',
  'PULSES',
  'MEAT_SEAFOOD',
  'BEVERAGES',
  'FROZEN',
  'BAKERY',
  'CONDIMENTS',
  'OTHER',
);
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const STOCK_UNITS = values('KG', 'G', 'L', 'ML', 'PCS', 'PACK', 'DOZEN', 'BOX');
export type StockUnit = (typeof STOCK_UNITS)[number];

export const STOCK_MOVEMENT_TYPES = values(
  'OPENING',
  'PURCHASE',
  'CONSUMPTION',
  'WASTAGE',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'PRODUCTION',
  'RETURN',
);
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const SUPPLIER_STRATEGIES = values('LOWEST_COST', 'FASTEST', 'BEST_RATED', 'BALANCED');
export type SupplierStrategy = (typeof SUPPLIER_STRATEGIES)[number];

export const PURCHASE_ORDER_STATUSES = values(
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SENT_TO_SUPPLIER',
  'CONFIRMED',
  'PARTIALLY_CONFIRMED',
  'SUPPLIER_REJECTED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
  'CLOSED',
);
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const ALERT_SEVERITIES = values('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const SELLER_TYPES = values('SUPPLIER', 'WHOLESALER', 'RETAILER');
export type SellerType = (typeof SELLER_TYPES)[number];

export const B2B_ORDER_STATUSES = values(
  'PLACED',
  'CONFIRMED',
  'PARTIALLY_CONFIRMED',
  'REJECTED',
  'PACKED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
);
export type B2bOrderStatus = (typeof B2B_ORDER_STATUSES)[number];

export const PAYMENT_TERMS = values('PREPAID', 'COD', 'NET_7', 'NET_15', 'NET_30');
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const BUYER_SEGMENTS = values('ALL', 'RESTAURANT', 'RETAILER', 'DEALER');
export type BuyerSegment = (typeof BUYER_SEGMENTS)[number];

export const DEALER_TIERS = values('PLATINUM', 'GOLD', 'SILVER', 'BRONZE');
export type DealerTier = (typeof DEALER_TIERS)[number];

export const FRAUD_DECISIONS = values('ALLOW', 'REVIEW', 'BLOCK');
export type FraudDecision = (typeof FRAUD_DECISIONS)[number];

export const NOTIFICATION_CHANNELS = values('PUSH', 'SMS', 'EMAIL', 'IN_APP', 'WHATSAPP');
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const APP_KINDS = values('CUSTOMER', 'RIDER', 'MERCHANT', 'ADMIN');
export type AppKind = (typeof APP_KINDS)[number];

export const AD_PLACEMENTS = values(
  'SEARCH_TOP',
  'HOME_CAROUSEL',
  'CATEGORY_TOP',
  'MARKETPLACE_TOP',
  'MENU_HIGHLIGHT',
);
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const MEAL_SLOTS = values('BREAKFAST', 'LUNCH', 'DINNER');
export type MealSlot = (typeof MEAL_SLOTS)[number];

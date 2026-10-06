import * as T from '@foodgrid/types';
import { $Enums } from '../generated/client';

/**
 * @foodgrid/types mirrors the Prisma enums for use in web/mobile clients.
 * This test fails if the two drift apart.
 */
const pairs: [string, readonly string[], Record<string, string>][] = [
  ['TenantType', T.TENANT_TYPES, $Enums.TenantType],
  ['TenantStatus', T.TENANT_STATUSES, $Enums.TenantStatus],
  ['PlatformRole', T.PLATFORM_ROLES, $Enums.PlatformRole],
  ['TenantRole', T.TENANT_ROLES, $Enums.TenantRole],
  ['OutletType', T.OUTLET_TYPES, $Enums.OutletType],
  ['OutletStatus', T.OUTLET_STATUSES, $Enums.OutletStatus],
  ['OrderChannel', T.ORDER_CHANNELS, $Enums.OrderChannel],
  ['OrderType', T.ORDER_TYPES, $Enums.OrderType],
  ['OrderStatus', T.ORDER_STATUSES, $Enums.OrderStatus],
  ['OrderPaymentStatus', T.ORDER_PAYMENT_STATUSES, $Enums.OrderPaymentStatus],
  ['PaymentMethod', T.PAYMENT_METHODS, $Enums.PaymentMethod],
  ['PaymentPurpose', T.PAYMENT_PURPOSES, $Enums.PaymentPurpose],
  ['PaymentState', T.PAYMENT_STATES, $Enums.PaymentState],
  ['KdsStatus', T.KDS_STATUSES, $Enums.KdsStatus],
  ['CouponType', T.COUPON_TYPES, $Enums.CouponType],
  ['DeliveryStatus', T.DELIVERY_STATUSES, $Enums.DeliveryStatus],
  ['VehicleType', T.VEHICLE_TYPES, $Enums.VehicleType],
  ['IngredientCategory', T.INGREDIENT_CATEGORIES, $Enums.IngredientCategory],
  ['StockUnit', T.STOCK_UNITS, $Enums.StockUnit],
  ['StockMovementType', T.STOCK_MOVEMENT_TYPES, $Enums.StockMovementType],
  ['SupplierStrategy', T.SUPPLIER_STRATEGIES, $Enums.SupplierStrategy],
  ['PurchaseOrderStatus', T.PURCHASE_ORDER_STATUSES, $Enums.PurchaseOrderStatus],
  ['AlertSeverity', T.ALERT_SEVERITIES, $Enums.AlertSeverity],
  ['SellerType', T.SELLER_TYPES, $Enums.SellerType],
  ['B2bOrderStatus', T.B2B_ORDER_STATUSES, $Enums.B2bOrderStatus],
  ['PaymentTerms', T.PAYMENT_TERMS, $Enums.PaymentTerms],
  ['BuyerSegment', T.BUYER_SEGMENTS, $Enums.BuyerSegment],
  ['DealerTier', T.DEALER_TIERS, $Enums.DealerTier],
  ['FraudDecision', T.FRAUD_DECISIONS, $Enums.FraudDecision],
  ['NotificationChannel', T.NOTIFICATION_CHANNELS, $Enums.NotificationChannel],
  ['AppKind', T.APP_KINDS, $Enums.AppKind],
  ['AdPlacement', T.AD_PLACEMENTS, $Enums.AdPlacement],
  ['MealSlot', T.MEAL_SLOTS, $Enums.MealSlot],
];

describe('enum parity between @foodgrid/types and Prisma', () => {
  it.each(pairs)('%s matches', (_name, mirror, prismaEnum) => {
    expect([...mirror].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});

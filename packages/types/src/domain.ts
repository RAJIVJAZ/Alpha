import type {
  AlertSeverity,
  DeliveryStatus,
  IngredientCategory,
  KdsStatus,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
  OutletType,
  PaymentMethod,
  StockUnit,
  SupplierStrategy,
} from './enums';
import type { AddressSnapshot, Money } from './api';

/** Lightweight read models returned by public APIs and consumed by clients. */

export interface OutletCard {
  id: string;
  slug: string;
  name: string;
  type: OutletType;
  cuisines: string[];
  city: string;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
  costForTwo: Money;
  avgPrepTimeMins: number;
  isPureVeg: boolean;
  /** The merchant's "accepting orders" switch (same meaning as on the outlet detail). */
  isOpen: boolean;
  /** Can take an order right now: switch on and inside opening hours. Show open/closed from this. */
  isOpenNow: boolean;
  coverImageUrl: string | null;
  distanceKm?: number;
  etaMins?: number;
  sponsored?: boolean;
  /** campaign behind a sponsored placement, for click attribution */
  adCampaignId?: string | null;
  offer?: string | null;
}

export interface MenuItemView {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: Money;
  isVeg: boolean;
  isAvailable: boolean;
  isRecommended: boolean;
  variants: { id: string; name: string; priceDelta: Money; isDefault: boolean }[];
  addonGroups: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    addons: { id: string; name: string; price: Money; isVeg: boolean }[];
  }[];
}

export interface CartLine {
  lineId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  variantId?: string;
  addonIds?: string[];
  unitPrice: Money;
  totalPrice: Money;
  isVeg: boolean;
  notes?: string;
}

export interface CartView {
  outletId: string | null;
  outletName: string | null;
  lines: CartLine[];
  couponCode: string | null;
  pricing: PriceBreakdown | null;
}

export interface PriceBreakdown {
  subtotal: Money;
  couponDiscount: Money;
  membershipDiscount: Money;
  deliveryFee: Money;
  packagingCharge: Money;
  platformFee: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  taxTotal: Money;
  tip: Money;
  roundOff: Money;
  total: Money;
  savings: Money;
  messages: string[];
}

export interface OrderSummaryView {
  id: string;
  orderNumber: string;
  outletId: string;
  outletName: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethod | null;
  type: OrderType;
  total: Money;
  itemsCount: number;
  createdAt: string;
  estimatedDeliveryAt: string | null;
}

export interface OrderTrackingView {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryStatus: DeliveryStatus | null;
  timeline: { status: OrderStatus; at: string; note?: string | null }[];
  rider: { id: string; name: string; phone: string; lat: number | null; lng: number | null } | null;
  outlet: { name: string; lat: number; lng: number };
  drop: AddressSnapshot | null;
  /** Minutes to arrival; null once delivered, completed, cancelled, rejected or failed. */
  etaMins: number | null;
  deliveryOtp: string | null;
}

export interface KitchenTicketView {
  id: string;
  orderId: string;
  orderNumber: string;
  ticketNumber: number;
  station: string;
  status: KdsStatus;
  orderType: OrderType;
  createdAt: string;
  elapsedSeconds: number;
  items: {
    name: string;
    quantity: number;
    variant?: string | null;
    addons: string[];
    notes?: string | null;
  }[];
}

export interface IngredientView {
  id: string;
  name: string;
  sku: string;
  category: IngredientCategory;
  unit: StockUnit;
  currentStock: string;
  reorderLevel: string;
  avgUnitCost: string;
  stockValue: Money;
  status: 'OK' | 'LOW' | 'OUT';
}

export interface ReorderAlertView {
  id: string;
  ingredientId: string;
  ingredientName: string;
  category: string;
  currentStock: string;
  avgDailyUsage: string;
  daysOfCover: number;
  predictedDepletionDate: string | null;
  suggestedQty: string;
  unit: string;
  severity: AlertSeverity;
}

export interface SupplierOption {
  productId: string;
  supplierTenantId: string;
  supplierName: string;
  productName: string;
  brand: string | null;
  unitPrice: number;
  packSize: number;
  packs: number;
  quantity: number;
  subtotal: number;
  tax: number;
  deliveryCharge: number;
  landedCost: number;
  costPerBaseUnit: number;
  leadTimeHours: number;
  rating: number;
  onTimeRate: number;
  fillRate: number;
  moqSatisfied: boolean;
  score: number;
  rank: number;
}

export interface SupplierRecommendation {
  ingredientId: string;
  quantity: number;
  unit: StockUnit;
  strategy: SupplierStrategy;
  options: SupplierOption[];
  best: Record<SupplierStrategy, SupplierOption | null>;
}

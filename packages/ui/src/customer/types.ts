/** Response shapes for the customer storefront (decimals arrive as strings). */
export type Dec = string;

export interface OutletSummary {
  id: string;
  slug: string;
  name: string;
  type: 'RESTAURANT' | 'FOOD_CART' | string;
  cuisines: string[];
  city: string;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
  costForTwo: Dec;
  avgPrepTimeMins: number;
  isPureVeg: boolean;
  isOpen: boolean;
  coverImageUrl: string | null;
  distanceKm: number;
  etaMins: number;
  sponsored: boolean;
  /** campaign behind a sponsored placement; reported on click */
  adCampaignId?: string | null;
  reasons?: string[];
}

export interface OpeningHours {
  day: number;
  open: string;
  close: string;
}

export interface OutletDetail {
  id: string;
  slug: string;
  type: string;
  name: string;
  description: string | null;
  cuisines: string[];
  tags: string[];
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  isPureVeg: boolean;
  costForTwo: Dec;
  avgPrepTimeMins: number;
  minOrderValue: Dec;
  packagingCharge: Dec;
  ratingAvg: number;
  ratingCount: number;
  isOpen: boolean;
  isOpenNow: boolean;
  openingHours: OpeningHours[] | null;
  fssaiNumber: string | null;
  gstin: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  acceptsDelivery: boolean;
  acceptsTakeaway: boolean;
  acceptsQrOrders: boolean;
  isMobile: boolean;
}

export interface Addon {
  id: string;
  name: string;
  price: Dec;
  isVeg: boolean;
  isAvailable: boolean;
}

export interface AddonGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  addons: Addon[];
}

export interface Variant {
  id: string;
  name: string;
  priceDelta: Dec;
  isDefault: boolean;
  isAvailable: boolean;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: Dec;
  compareAtPrice: Dec | null;
  isVeg: boolean;
  isAvailable: boolean;
  isRecommended: boolean;
  tags: string[];
  spiceLevel: number | null;
  variants: Variant[];
  addonGroups: AddonGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  items: MenuItem[];
}

export interface Menu {
  outlet: OutletDetail;
  recommended: MenuItem[];
  categories: MenuCategory[];
}

export interface CartLine {
  lineId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  variantId: string | null;
  variant: string | null;
  addonIds: string[];
  addons: string[];
  unitPrice: Dec;
  totalPrice: Dec;
  isVeg: boolean;
}

export interface Pricing {
  subtotal: Dec;
  couponDiscount: Dec;
  membershipDiscount: Dec;
  deliveryFee: Dec;
  packagingCharge: Dec;
  platformFee: Dec;
  cgst: Dec;
  sgst: Dec;
  igst: Dec;
  taxTotal: Dec;
  tip: Dec;
  roundOff: Dec;
  total: Dec;
  savings: Dec;
  messages: string[];
}

export interface Cart {
  outletId: string | null;
  outletName: string | null;
  couponCode: string | null;
  removedItems: string[];
  lines: CartLine[];
  pricing: Pricing | null;
}

export interface Quote {
  cart: Cart;
  delivery: {
    serviceable: boolean;
    reason?: string;
    distanceKm: number;
    deliveryFee: number;
    etaMins: number;
  } | null;
  coupon: { code: string; valid: boolean; reason?: string | null } | null;
  isMember: boolean;
}

export interface Coupon {
  code: string;
  title: string;
  description: string | null;
  type: string;
  value: Dec;
  maxDiscount: Dec | null;
  minOrderValue: Dec;
  validTo: string | null;
  eligible: boolean;
  reason: string | null;
}

export interface Address {
  id: string;
  label: string;
  contactName: string | null;
  contactPhone: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export type PaymentMethod = 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'COD';

export interface CheckoutResult {
  order: { id: string; orderNumber: string; status: string; total: Dec; paymentStatus: string };
  pricing: Pricing;
  payment: {
    required: boolean;
    purpose: string;
    referenceId: string;
    amount: Dec;
    method: PaymentMethod;
  };
}

export interface PaymentIntent {
  paymentId: string;
  state: 'CREATED' | 'CAPTURED' | 'FAILED' | string;
  provider: 'RAZORPAY' | 'WALLET' | string;
  amount: Dec;
  sandbox?: boolean;
  checkout?: Record<string, unknown> & { key: string; order_id: string; amount: number };
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  variant: string | null;
  addons: { id: string; name: string; price: Dec }[];
  quantity: number;
  unitPrice: Dec;
  totalPrice: Dec;
  isVeg: boolean;
  notes: string | null;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  type: 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN' | string;
  channel: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: Dec;
  createdAt: string;
  placedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  outlet: { name: string; slug: string; coverImageUrl: string | null };
  items: { name: string; quantity: number }[];
  review: { rating: number } | null;
}

export interface OrderDetail extends Omit<OrderSummary, 'items' | 'outlet' | 'review'> {
  subtotal: Dec;
  couponDiscount: Dec;
  membershipDiscount: Dec;
  deliveryFee: Dec;
  packagingCharge: Dec;
  platformFee: Dec;
  taxTotal: Dec;
  cgst: Dec;
  sgst: Dec;
  igst: Dec;
  tip: Dec;
  roundOff: Dec;
  couponCode: string | null;
  deliveryAddress: (Partial<Address> & { line1: string }) | null;
  specialInstructions: string | null;
  cancelReason: string | null;
  items: OrderItem[];
  outlet: {
    name: string;
    slug: string;
    phone: string | null;
    lat: number;
    lng: number;
    addressLine1: string;
  };
  review: {
    rating: number;
    foodRating: number | null;
    deliveryRating: number | null;
    comment: string | null;
  } | null;
}

export interface Tracking {
  orderId: string;
  orderNumber: string;
  status: string;
  deliveryStatus: string | null;
  timeline: { status: string; at: string; note: string | null }[];
  rider: {
    name: string;
    phone: string;
    vehicleNumber: string | null;
    rating: number;
    lat: number | null;
    lng: number | null;
  } | null;
  outlet: { name: string; lat: number; lng: number };
  drop: { lat: number; lng: number; line1?: string; label?: string } | null;
  etaMins: number | null;
  deliveryOtp: string | null;
}

export interface HomeFeed {
  recommended: OutletSummary[];
  reorder: {
    orderId: string;
    outletName: string;
    slug: string;
    items: string[];
    count: number;
    lastAt: string;
    total: Dec;
    imageUrl: string | null;
  }[];
  topRated: OutletSummary[];
  fastDelivery: OutletSummary[];
}

export interface SearchResult {
  query: string;
  outlets: OutletSummary[];
  dishes: {
    id: string;
    name: string;
    price: Dec;
    imageUrl: string | null;
    isVeg: boolean;
    outlet: OutletSummary;
  }[];
}

export interface Suggestions {
  cuisines: string[];
  outlets: { id: string; slug: string; name: string; type: string }[];
  dishes: string[];
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  placement: string;
}

export interface Review {
  id: string;
  rating: number;
  foodRating: number | null;
  deliveryRating: number | null;
  comment: string | null;
  tags: string[];
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface MembershipPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: Dec;
  durationDays: number;
  benefits: { extraDiscountPct?: number; freeDeliveryAbove?: number; maxDiscountPerOrder?: number };
}

export interface MyMembership {
  active: {
    id: string;
    status: string;
    startsAt: string;
    endsAt: string;
    autoRenew: boolean;
    savings: Dec;
    plan: MembershipPlan;
  } | null;
}

export interface SubscriptionPlan {
  id: string;
  outletId: string;
  name: string;
  description: string | null;
  slot: string;
  mealsPerDay: number;
  durationDays: number;
  daysOfWeek: number[];
  pricePerMeal: Dec;
  totalPrice: Dec;
  isVeg: boolean;
}

export interface MealSubscription {
  id: string;
  outletId: string;
  status: string;
  startDate: string;
  endDate: string;
  slot: string;
  deliveryTime: string;
  mealsTotal: number;
  mealsDelivered: number;
  pausedDates: string[];
  amountPaid: Dec;
  plan: { name: string; slot: string; outletId: string };
}

export interface WalletStatement {
  wallet: { id: string; balance: Dec; status: string };
  transactions: {
    id: string;
    type: 'CREDIT' | 'DEBIT';
    reason: string;
    amount: Dec;
    balanceAfter: Dec;
    description: string | null;
    createdAt: string;
  }[];
  meta: { page: number; totalPages: number; total: number };
}

export interface Profile {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  referralCode: string | null;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPrefs {
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  marketingEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export interface TableMenu {
  table: { id: string; label: string; seats: number };
  outlet: OutletDetail;
  recommended: MenuItem[];
  categories: MenuCategory[];
}

/** Response shapes used by the supplier / wholesaler / retailer screens (decimals arrive as strings). */
export type Dec = string;
export type SellerType = 'SUPPLIER' | 'WHOLESALER' | 'RETAILER';
export type BuyerSegment = 'ALL' | 'RESTAURANT' | 'RETAILER' | 'DEALER';
export type PaymentTerms = 'PREPAID' | 'COD' | 'NET_7' | 'NET_15' | 'NET_30';

export const STOCK_UNITS = ['KG', 'G', 'L', 'ML', 'PCS', 'PACK', 'DOZEN', 'BOX'] as const;
export const BUYER_SEGMENTS: BuyerSegment[] = ['ALL', 'RESTAURANT', 'RETAILER', 'DEALER'];
export const PAYMENT_TERMS: PaymentTerms[] = ['PREPAID', 'COD', 'NET_7', 'NET_15', 'NET_30'];
export const GST_RATES = [0, 5, 12, 18, 28];

export interface MarketplaceCategory {
  id: string;
  code: string;
  name: string;
  slug: string;
  imageUrl: string | null;
}

export interface PriceTier {
  id?: string;
  minQty: Dec | number;
  maxQty: Dec | number | null;
  unitPrice: Dec | number;
  segment: BuyerSegment;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface SellerProduct {
  id: string;
  sellerType: SellerType;
  categoryId: string;
  name: string;
  slug: string;
  sku: string;
  brand: string | null;
  description: string | null;
  images: string[];
  unit: (typeof STOCK_UNITS)[number];
  packSize: Dec;
  price: Dec;
  mrp: Dec | null;
  moq: Dec;
  maxOrderQty: Dec | null;
  stepQty: Dec;
  gstRate: Dec;
  hsnCode: string | null;
  deliveryTimeHours: number;
  stockQty: Dec;
  lowStockThreshold: Dec;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  isActive: boolean;
  rating: number;
  ratingCount: number;
  tags: string[];
  category?: MarketplaceCategory;
  priceTiers: PriceTier[];
}

export interface SellerOrder {
  id: string;
  orderNumber: string;
  buyerTenantId: string;
  buyerName: string;
  sellerName: string;
  sourcePurchaseOrderId: string | null;
  status: 'PLACED' | 'CONFIRMED' | 'PARTIALLY_CONFIRMED' | 'REJECTED' | 'PACKED' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  subtotal: Dec;
  discount: Dec;
  taxTotal: Dec;
  deliveryCharge: Dec;
  total: Dec;
  paymentTerms: PaymentTerms;
  paymentStatus: string;
  deliveryDate: string | null;
  deliveryAddress: { contactName?: string; contactPhone?: string; line1: string; city: string; state: string; pincode: string; lat?: number; lng?: number } | null;
  expectedDeliveryAt: string | null;
  trackingInfo: { vehicleNumber?: string; driverName?: string; driverPhone?: string; eta?: string; lat?: number; lng?: number } | null;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  items: { id: string; productId: string; name: string; sku: string; quantity: Dec; unit: string; unitPrice: Dec; gstRate: Dec; taxAmount: Dec; lineTotal: Dec; confirmedQty: Dec | null }[];
  events?: { id: string; status: string; note: string | null; lat: number | null; lng: number | null; createdAt: string }[];
}

export interface SellerSummary {
  from: string;
  to: string;
  orders: number;
  gmv: number;
  averageOrderValue: number;
  fulfilmentRate: number;
  onTimeRate: number;
  rejectionRate: number;
  pendingConfirmation: number;
  lowStockProducts: number;
  daily: { date: string; orders: number; gmv: number }[];
  topProducts: { productId: string; name: string; units: number; revenue: number }[];
  topBuyers: { buyerTenantId: string; name: string; orders: number; gmv: number }[];
}

export interface DeliveryZone {
  id: string;
  name: string;
  pincodes: string[];
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  deliveryCharge: Dec;
  freeDeliveryAbove: Dec | null;
  minOrderValue: Dec | null;
  leadTimeHours: number;
  isActive: boolean;
}

export interface DeliverySlot {
  id: string;
  label: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  cutoffMinutes: number;
  isActive: boolean;
}

export interface Territory {
  id: string;
  name: string;
  code: string | null;
  states: string[];
  cities: string[];
  pincodes: string[];
  monthlyTarget: Dec | null;
  isActive: boolean;
  _count?: { dealers: number };
  monthToDateSales: number;
  targetAchievementPct: number | null;
}

export interface Dealer {
  id: string;
  dealerTenantId: string | null;
  name: string;
  contactName: string | null;
  phone: string;
  email: string | null;
  gstin: string | null;
  address: string | null;
  city: string;
  territoryId: string | null;
  tier: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';
  status: 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  creditLimit: Dec | null;
  outstanding: Dec;
  paymentTerms: PaymentTerms;
  discountPct: Dec;
  onboardedAt: string | null;
  territory?: { name: string } | null;
}

/** Response shapes used by the merchant screens (subset of fields; decimals arrive as strings). */
export type Dec = string;

export interface Outlet {
  id: string;
  name: string;
  slug: string;
  type: 'RESTAURANT' | 'FOOD_CART' | 'CLOUD_KITCHEN';
  status: string;
  city: string;
  addressLine1: string;
  isOpen: boolean;
  avgPrepTimeMins: number;
  acceptsQrOrders: boolean;
  isMobile: boolean;
  kdsStations: string[];
  ratingAvg: number;
  ratingCount: number;
}

export interface MerchantOrder {
  id: string;
  orderNumber: string;
  outletId: string;
  customerName: string | null;
  customerPhone: string | null;
  channel: 'APP' | 'WEB' | 'QR' | 'POS';
  type: 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  subtotal: Dec;
  total: Dec;
  placedAt: string | null;
  acceptedAt: string | null;
  estimatedReadyAt: string | null;
  specialInstructions: string | null;
  createdAt: string;
  items?: {
    id: string;
    name: string;
    quantity: number;
    variant: string | null;
    addons: { name: string }[];
    totalPrice: Dec;
    notes: string | null;
  }[];
}

export interface KitchenTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  ticketNumber: number;
  station: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'READY' | 'SERVED' | 'CANCELLED';
  orderType: string;
  createdAt: string;
  elapsedSeconds: number;
  items: {
    name: string;
    quantity: number;
    variant: string | null;
    addons: string[];
    notes: string | null;
  }[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: Dec;
  isVeg: boolean;
  isAvailable: boolean;
  isRecommended: boolean;
  kdsStation: string;
  prepTimeMins: number | null;
  imageUrl: string | null;
  variants: {
    id: string;
    name: string;
    priceDelta: Dec;
    isDefault: boolean;
    isAvailable: boolean;
  }[];
  addonGroups: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    addons: { id: string; name: string; price: Dec; isVeg: boolean; isAvailable: boolean }[];
  }[];
}
export interface MenuCategory {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  items: MenuItem[];
}

export interface Ingredient {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  currentStock: Dec;
  reorderLevel: Dec;
  avgUnitCost: Dec;
  stockValue: Dec;
  status: 'OK' | 'LOW' | 'OUT' | string;
}

/** GET inventory/ingredients/:id: the master data behind the stock list row. */
export interface IngredientDetail {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  currentStock: Dec;
  reorderLevel: Dec;
  reorderQty: Dec;
  maxStock: Dec | null;
  avgUnitCost: Dec;
  leadTimeDays: number;
  shelfLifeDays: number | null;
}

/** Recipe (bill of materials) for one dish, from GET inventory/recipes. */
export interface Recipe {
  id: string;
  menuItemId: string;
  name: string;
  yieldQty: Dec;
  prepTimeMins: number | null;
  instructions: string | null;
  lines: {
    ingredientId: string;
    quantity: Dec;
    unit: string;
    wastagePct: Dec;
    ingredient: { name: string; unit: string };
  }[];
}

export interface InventorySummary {
  totalItems: number;
  totalValue: number;
  lowStock: number;
  outOfStock: number;
  categories: { category: string; items: number; value: number; low: number; out: number }[];
  expiringSoon: {
    batchId: string;
    ingredient: string;
    unit: string;
    remainingQty: Dec;
    expiresAt: string;
    value: number;
  }[];
}

export interface StockMovement {
  id: string;
  ingredientId: string;
  type: string;
  quantity: Dec;
  unitCost: Dec | null;
  totalCost: Dec | null;
  balanceAfter: Dec;
  reason: string | null;
  referenceType: string | null;
  createdAt: string;
  ingredient?: { name: string; unit: string };
}

export interface ReorderAlert {
  id: string;
  outletId: string;
  ingredientId: string;
  ingredientName: string;
  category: string;
  unit: string;
  currentStock: Dec;
  reorderLevel: Dec;
  avgDailyUsage: Dec;
  daysOfCover: number;
  predictedDepletionDate: string | null;
  suggestedQty: Dec;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  purchaseOrderId: string | null;
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
  feasible: boolean;
  score: number;
  rank: number;
}
export interface SupplierRecommendation {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  strategy: string;
  options: SupplierOption[];
  best: Record<'LOWEST_COST' | 'FASTEST' | 'BEST_RATED' | 'BALANCED', SupplierOption | null>;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  outletId: string;
  supplierTenantId: string;
  supplierName: string;
  status: string;
  source: 'MANUAL' | 'AUTO_REORDER' | 'PRODUCTION_PLAN';
  subtotal: Dec;
  taxTotal: Dec;
  deliveryCharge: Dec;
  total: Dec;
  paymentTerms: string;
  expectedDeliveryAt: string | null;
  notes: string | null;
  supplierNotes: string | null;
  trackingInfo: {
    vehicleNumber?: string;
    driverName?: string;
    driverPhone?: string;
    lat?: number;
    lng?: number;
    eta?: string;
  } | null;
  createdAt: string;
  items: {
    id: string;
    ingredientId: string | null;
    productId: string | null;
    name: string;
    quantity: Dec;
    unit: string;
    unitPrice: Dec;
    gstRate: Dec;
    lineTotal: Dec;
    confirmedQty: Dec | null;
    receivedQty: Dec;
    baseQtyPerPack: Dec;
    ingredientUnit: string | null;
  }[];
  events?: {
    id: string;
    status: string;
    note: string | null;
    actorType: string | null;
    createdAt: string;
  }[];
  approvals?: { id: string; decision: string; comment: string | null; decidedAt: string }[];
}

export interface Settlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  grossSales: Dec;
  merchantDiscounts: Dec;
  commission: Dec;
  commissionGst: Dec;
  tcs: Dec;
  tds: Dec;
  netPayable: Dec;
  status: string;
  payoutReference: string | null;
  paidAt: string | null;
}

export interface SalesReport {
  from: string;
  to: string;
  kpis: {
    orders: number;
    gmv: number;
    netSales: number;
    averageOrderValue: number;
    cancellationRatePct: number;
    newCustomers: number;
    repeatCustomers: number;
  };
  daily: { date: string; orders: number; gmv: number; netSales: number; cancelled: number }[];
  byChannel: { channel: string; orders: number; gmv: number }[];
  byPaymentMethod: { method: string; orders: number; gmv: number }[];
  heatmap: { dow: number; hour: number; orders: number }[];
}

export interface ProfitReport {
  totals: {
    orders: number;
    gmv: number;
    netSales: number;
    discounts: number;
    commission: number;
    foodCost: number;
    grossProfit: number;
  };
  marginPct: number;
  foodCostPct: number;
  commissionPct: number;
  daily: {
    date: string;
    orders: number;
    netSales: number;
    commission: number;
    foodCost: number;
    grossProfit: number;
  }[];
}

export interface ProductionPlanItem {
  id: string;
  menuItemId: string;
  name: string;
  forecastQty: Dec;
  plannedQty: Dec;
  producedQty: Dec;
}
export interface ProductionPlan {
  id: string;
  outletId: string;
  planDate: string;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
  items: ProductionPlanItem[];
  requirements?: {
    ingredientId: string;
    name: string;
    unit: string;
    category: string;
    currentStock: number;
    required: number;
    shortage: number;
  }[];
}

export interface CostingReport {
  outletId: string;
  items: {
    menuItemId: string;
    name: string;
    sellingPrice: number;
    foodCost: number | null;
    foodCostPct: number | null;
    marginPct: number | null;
    flag: 'OK' | 'HIGH_COST' | 'NO_RECIPE' | string;
  }[];
  averageFoodCostPct: number | null;
  highCostItems: number;
  missingRecipes: number;
}
export interface RecipeCost {
  menuItemId: string;
  name: string;
  perPortion: number;
  lines: {
    ingredientId: string;
    name: string;
    quantity: number;
    unit: string;
    cost: number;
    sharePct: number;
  }[];
}
export interface PricingSuggestion {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string;
  currentPrice: Dec;
  suggestedPrice: Dec;
  changePct: number;
  reason: string;
  confidence: number;
  factors: { outletId?: string; elasticity?: number } | null;
  status: string;
  validUntil: string | null;
  createdAt: string;
}

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ads";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ai";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "commerce";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "delivery";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "marketplace";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notifications";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "payments";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "procurement";

-- CreateEnum
CREATE TYPE "ads"."AdPlacement" AS ENUM ('SEARCH_TOP', 'HOME_CAROUSEL', 'CATEGORY_TOP', 'MARKETPLACE_TOP', 'MENU_HIGHLIGHT');

-- CreateEnum
CREATE TYPE "ads"."AdTargetType" AS ENUM ('OUTLET', 'MENU_ITEM', 'PRODUCT');

-- CreateEnum
CREATE TYPE "ads"."CampaignStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'EXHAUSTED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ads"."BidType" AS ENUM ('CPC', 'CPM');

-- CreateEnum
CREATE TYPE "ads"."AdEventType" AS ENUM ('IMPRESSION', 'CLICK', 'CONVERSION');

-- CreateEnum
CREATE TYPE "ai"."AiModelKind" AS ENUM ('DEMAND_FORECAST', 'DYNAMIC_PRICING', 'INVENTORY_OPTIMIZATION', 'SUPPLIER_RECOMMENDATION', 'FRAUD_DETECTION', 'ROUTE_OPTIMIZATION', 'CUSTOMER_RECOMMENDATION', 'OUTLET_SCORING');

-- CreateEnum
CREATE TYPE "ai"."FraudEntityType" AS ENUM ('ORDER', 'PAYMENT', 'USER', 'RIDER', 'COUPON_REDEMPTION', 'REFUND');

-- CreateEnum
CREATE TYPE "ai"."FraudDecision" AS ENUM ('ALLOW', 'REVIEW', 'BLOCK');

-- CreateEnum
CREATE TYPE "ai"."PricingTargetType" AS ENUM ('MENU_ITEM', 'PRODUCT', 'DELIVERY_FEE');

-- CreateEnum
CREATE TYPE "ai"."SuggestionStatus" AS ENUM ('SUGGESTED', 'APPLIED', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ai"."SignalType" AS ENUM ('FESTIVAL', 'WEATHER', 'EVENT', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "commerce"."OutletType" AS ENUM ('RESTAURANT', 'FOOD_CART', 'CLOUD_KITCHEN');

-- CreateEnum
CREATE TYPE "commerce"."OutletStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "commerce"."OrderChannel" AS ENUM ('APP', 'WEB', 'QR', 'POS');

-- CreateEnum
CREATE TYPE "commerce"."OrderType" AS ENUM ('DELIVERY', 'TAKEAWAY', 'DINE_IN');

-- CreateEnum
CREATE TYPE "commerce"."OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "commerce"."OrderPaymentStatus" AS ENUM ('PENDING', 'PAID', 'COD_PENDING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "commerce"."ActorType" AS ENUM ('CUSTOMER', 'MERCHANT', 'RIDER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "commerce"."KdsStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "commerce"."CouponType" AS ENUM ('FLAT', 'PERCENT', 'FREE_DELIVERY');

-- CreateEnum
CREATE TYPE "commerce"."FundingSource" AS ENUM ('PLATFORM', 'MERCHANT', 'SHARED');

-- CreateEnum
CREATE TYPE "commerce"."ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'FLAGGED');

-- CreateEnum
CREATE TYPE "commerce"."MealSlot" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "commerce"."SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "commerce"."CustomerMembershipStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "delivery"."RiderStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'OFFBOARDED');

-- CreateEnum
CREATE TYPE "delivery"."VehicleType" AS ENUM ('BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'EV_SCOOTER');

-- CreateEnum
CREATE TYPE "delivery"."DeliveryStatus" AS ENUM ('UNASSIGNED', 'SEARCHING', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "delivery"."OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "delivery"."AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "delivery"."IncentiveType" AS ENUM ('ORDER_COUNT', 'PEAK_HOURS', 'LOGIN_HOURS', 'STREAK', 'RATING');

-- CreateEnum
CREATE TYPE "delivery"."IncentiveProgressStatus" AS ENUM ('IN_PROGRESS', 'ACHIEVED', 'PAID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "delivery"."EarningType" AS ENUM ('BASE_PAY', 'DISTANCE_PAY', 'SURGE', 'TIP', 'INCENTIVE', 'WAITING_TIME', 'PENALTY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "identity"."TenantType" AS ENUM ('PLATFORM', 'RESTAURANT', 'FOOD_CART', 'SUPPLIER', 'WHOLESALER', 'RETAILER');

-- CreateEnum
CREATE TYPE "identity"."TenantStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "identity"."PlatformRole" AS ENUM ('CUSTOMER', 'RIDER', 'ADMIN', 'SUPPORT', 'FINANCE', 'OPS');

-- CreateEnum
CREATE TYPE "identity"."TenantRole" AS ENUM ('OWNER', 'MANAGER', 'CHEF', 'CASHIER', 'STAFF', 'ACCOUNTANT', 'PROCUREMENT_MANAGER');

-- CreateEnum
CREATE TYPE "identity"."UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "identity"."TenantMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "identity"."OtpPurpose" AS ENUM ('LOGIN', 'VERIFY_PHONE', 'DELIVERY_HANDOVER');

-- CreateEnum
CREATE TYPE "identity"."OAuthProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "identity"."ApprovalEntityType" AS ENUM ('TENANT', 'OUTLET', 'RIDER', 'PRODUCT', 'AD_CAMPAIGN');

-- CreateEnum
CREATE TYPE "identity"."ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "identity"."ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "identity"."Audience" AS ENUM ('ALL', 'CUSTOMER', 'MERCHANT', 'RIDER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "inventory"."IngredientCategory" AS ENUM ('FLOUR', 'OIL', 'SUGAR', 'DAIRY', 'VEGETABLES', 'FRUITS', 'PACKAGING', 'SPICES', 'GRAINS', 'PULSES', 'MEAT_SEAFOOD', 'BEVERAGES', 'FROZEN', 'BAKERY', 'CONDIMENTS', 'OTHER');

-- CreateEnum
CREATE TYPE "inventory"."StorageType" AS ENUM ('DRY', 'CHILLED', 'FROZEN');

-- CreateEnum
CREATE TYPE "inventory"."StockMovementType" AS ENUM ('OPENING', 'PURCHASE', 'CONSUMPTION', 'WASTAGE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'PRODUCTION', 'RETURN');

-- CreateEnum
CREATE TYPE "inventory"."ProductionPlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "marketplace"."SellerType" AS ENUM ('SUPPLIER', 'WHOLESALER', 'RETAILER');

-- CreateEnum
CREATE TYPE "marketplace"."StockStatus" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "marketplace"."BuyerSegment" AS ENUM ('ALL', 'RESTAURANT', 'RETAILER', 'DEALER');

-- CreateEnum
CREATE TYPE "marketplace"."B2bOrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'REJECTED', 'PACKED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "marketplace"."B2bPaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'OVERDUE');

-- CreateEnum
CREATE TYPE "marketplace"."PaymentTerms" AS ENUM ('PREPAID', 'COD', 'NET_7', 'NET_15', 'NET_30');

-- CreateEnum
CREATE TYPE "marketplace"."DealerTier" AS ENUM ('PLATINUM', 'GOLD', 'SILVER', 'BRONZE');

-- CreateEnum
CREATE TYPE "marketplace"."DealerStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "notifications"."NotificationChannel" AS ENUM ('PUSH', 'SMS', 'EMAIL', 'IN_APP', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "notifications"."NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ', 'SKIPPED');

-- CreateEnum
CREATE TYPE "notifications"."DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "notifications"."AppKind" AS ENUM ('CUSTOMER', 'RIDER', 'MERCHANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "notifications"."PushCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "payments"."PaymentProvider" AS ENUM ('RAZORPAY', 'WALLET', 'CASH');

-- CreateEnum
CREATE TYPE "payments"."PaymentPurpose" AS ENUM ('ORDER', 'WALLET_TOPUP', 'MEMBERSHIP', 'MEAL_SUBSCRIPTION', 'B2B_ORDER', 'AD_CAMPAIGN');

-- CreateEnum
CREATE TYPE "payments"."PaymentState" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payments"."RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "payments"."WalletOwnerType" AS ENUM ('CUSTOMER', 'RIDER', 'TENANT');

-- CreateEnum
CREATE TYPE "payments"."WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "payments"."LedgerEntryType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "payments"."LedgerReason" AS ENUM ('TOPUP', 'ORDER_PAYMENT', 'ORDER_REFUND', 'CASHBACK', 'REFERRAL_BONUS', 'DELIVERY_EARNING', 'INCENTIVE', 'TIP', 'PAYOUT', 'PAYOUT_REVERSAL', 'ADJUSTMENT', 'MEMBERSHIP_PURCHASE', 'SUBSCRIPTION_PURCHASE', 'COD_COLLECTION', 'PENALTY');

-- CreateEnum
CREATE TYPE "payments"."SettlementStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "payments"."PayoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "payments"."InvoiceType" AS ENUM ('CUSTOMER_ORDER', 'COMMISSION', 'DELIVERY_SERVICE', 'B2B_SALE');

-- CreateEnum
CREATE TYPE "platform"."PaymentMethod" AS ENUM ('UPI', 'CARD', 'NETBANKING', 'WALLET', 'COD', 'CASH');

-- CreateEnum
CREATE TYPE "platform"."StockUnit" AS ENUM ('KG', 'G', 'L', 'ML', 'PCS', 'PACK', 'DOZEN', 'BOX');

-- CreateEnum
CREATE TYPE "procurement"."AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "procurement"."ReorderAlertStatus" AS ENUM ('OPEN', 'PO_CREATED', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "procurement"."PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT_TO_SUPPLIER', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'SUPPLIER_REJECTED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "procurement"."PurchaseOrderSource" AS ENUM ('MANUAL', 'AUTO_REORDER', 'PRODUCTION_PLAN');

-- CreateEnum
CREATE TYPE "procurement"."SupplierStrategy" AS ENUM ('LOWEST_COST', 'FASTEST', 'BEST_RATED', 'BALANCED');

-- CreateEnum
CREATE TYPE "procurement"."ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ads"."AdCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "placement" "ads"."AdPlacement" NOT NULL,
    "targetType" "ads"."AdTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "ads"."CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "bidType" "ads"."BidType" NOT NULL DEFAULT 'CPC',
    "bidAmount" DECIMAL(10,2) NOT NULL,
    "dailyBudget" DECIMAL(12,2) NOT NULL,
    "totalBudget" DECIMAL(12,2) NOT NULL,
    "spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "spentToday" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "spentTodayDate" DATE,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "creative" JSONB NOT NULL DEFAULT '{}',
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads"."AdEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "ads"."AdEventType" NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "cost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads"."AdDailyStats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "AdDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."AiModelRun" (
    "id" TEXT NOT NULL,
    "kind" "ai"."AiModelKind" NOT NULL,
    "tenantId" TEXT,
    "scope" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "metrics" JSONB,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModelRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."FraudAssessment" (
    "id" TEXT NOT NULL,
    "entityType" "ai"."FraudEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "decision" "ai"."FraudDecision" NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "features" JSONB NOT NULL,
    "reviewedBy" TEXT,
    "reviewOutcome" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."PricingSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "targetType" "ai"."PricingTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT,
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "suggestedPrice" DECIMAL(12,2) NOT NULL,
    "changePct" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "status" "ai"."SuggestionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "validUntil" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."OutletScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutletScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."ExternalSignal" (
    "id" TEXT NOT NULL,
    "type" "ai"."SignalType" NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "date" DATE NOT NULL,
    "impact" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."OrderFact" (
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "outletType" TEXT NOT NULL,
    "city" TEXT,
    "customerId" TEXT,
    "channel" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "itemsCount" INTEGER NOT NULL,
    "gmv" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL,
    "deliveryFee" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "foodCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isFirstOrder" BOOLEAN NOT NULL DEFAULT false,
    "prepMins" INTEGER,
    "deliveryMins" INTEGER,
    "riderId" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderFact_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "analytics"."DailyOutletStats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "cancelledOrders" INTEGER NOT NULL DEFAULT 0,
    "gmv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "foodCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "avgPrepMins" DOUBLE PRECISION,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "repeatCustomers" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyOutletStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."DailyRiderStats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "riderId" TEXT NOT NULL,
    "deliveries" INTEGER NOT NULL DEFAULT 0,
    "earnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "onlineMinutes" INTEGER NOT NULL DEFAULT 0,
    "avgDeliveryMins" DOUBLE PRECISION,
    "offers" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRiderStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."DailySupplierStats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "gmv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitsSold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "deliveredOrders" INTEGER NOT NULL DEFAULT 0,
    "onTimeDeliveries" INTEGER NOT NULL DEFAULT 0,
    "rejectedOrders" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySupplierStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."DailyPlatformStats" (
    "date" DATE NOT NULL,
    "gmv" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "cancelledOrders" INTEGER NOT NULL DEFAULT 0,
    "activeCustomers" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "activeOutlets" INTEGER NOT NULL DEFAULT 0,
    "activeRiders" INTEGER NOT NULL DEFAULT 0,
    "deliveries" INTEGER NOT NULL DEFAULT 0,
    "b2bOrders" INTEGER NOT NULL DEFAULT 0,
    "b2bGmv" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlatformStats_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "commerce"."Outlet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "commerce"."OutletType" NOT NULL,
    "status" "commerce"."OutletStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "cuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateCode" TEXT,
    "pincode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geohash" TEXT NOT NULL,
    "isPureVeg" BOOLEAN NOT NULL DEFAULT false,
    "costForTwo" DECIMAL(10,2) NOT NULL DEFAULT 300,
    "avgPrepTimeMins" INTEGER NOT NULL DEFAULT 20,
    "deliveryRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "minOrderValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "packagingCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "openingHours" JSONB NOT NULL DEFAULT '[]',
    "fssaiNumber" TEXT,
    "gstin" TEXT,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "acceptsDelivery" BOOLEAN NOT NULL DEFAULT true,
    "acceptsTakeaway" BOOLEAN NOT NULL DEFAULT true,
    "acceptsDineIn" BOOLEAN NOT NULL DEFAULT false,
    "acceptsQrOrders" BOOLEAN NOT NULL DEFAULT false,
    "isMobile" BOOLEAN NOT NULL DEFAULT false,
    "lastLocationAt" TIMESTAMP(3),
    "commissionRate" DECIMAL(5,2),
    "kdsStations" TEXT[] DEFAULT ARRAY['MAIN']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."MenuCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."MenuItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sku" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "compareAtPrice" DECIMAL(10,2),
    "isVeg" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "prepTimeMins" INTEGER,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "hsnCode" TEXT DEFAULT '996331',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spiceLevel" INTEGER,
    "calories" INTEGER,
    "kdsStation" TEXT NOT NULL DEFAULT 'MAIN',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."MenuItemVariant" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuItemVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."MenuAddonGroup" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MenuAddonGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."MenuAddon" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isVeg" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."DiningTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "qrToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "channel" "commerce"."OrderChannel" NOT NULL DEFAULT 'APP',
    "type" "commerce"."OrderType" NOT NULL DEFAULT 'DELIVERY',
    "status" "commerce"."OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "commerce"."OrderPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "platform"."PaymentMethod",
    "paymentId" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "couponDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "membershipDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "packagingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "couponCode" TEXT,
    "couponFundedBy" "commerce"."FundingSource",
    "commissionRate" DECIMAL(5,2),
    "commissionAmount" DECIMAL(12,2),
    "deliveryAddress" JSONB,
    "deliveryLat" DOUBLE PRECISION,
    "deliveryLng" DOUBLE PRECISION,
    "distanceKm" DOUBLE PRECISION,
    "tableId" TEXT,
    "specialInstructions" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "mealSubscriptionId" TEXT,
    "riderId" TEXT,
    "deliveryOtp" TEXT,
    "estimatedReadyAt" TIMESTAMP(3),
    "estimatedDeliveryAt" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "preparingAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledBy" "commerce"."ActorType",
    "fraudScore" DOUBLE PRECISION,
    "idempotencyKey" TEXT,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variantId" TEXT,
    "variant" TEXT,
    "addons" JSONB NOT NULL DEFAULT '[]',
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "isVeg" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "kdsStation" TEXT NOT NULL DEFAULT 'MAIN',
    "kdsStatus" "commerce"."KdsStatus" NOT NULL DEFAULT 'QUEUED',

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "commerce"."OrderStatus",
    "toStatus" "commerce"."OrderStatus" NOT NULL,
    "actorType" "commerce"."ActorType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."KitchenTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "station" TEXT NOT NULL,
    "status" "commerce"."KdsStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "bumpedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tenantId" TEXT,
    "outletIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "commerce"."CouponType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2),
    "minOrderValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "membersOnly" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethods" "platform"."PaymentMethod"[] DEFAULT ARRAY[]::"platform"."PaymentMethod"[],
    "fundedBy" "commerce"."FundingSource" NOT NULL DEFAULT 'PLATFORM',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "riderId" TEXT,
    "rating" INTEGER NOT NULL,
    "foodRating" INTEGER,
    "deliveryRating" INTEGER,
    "comment" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "commerce"."ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slot" "commerce"."MealSlot" NOT NULL,
    "mealsPerDay" INTEGER NOT NULL DEFAULT 1,
    "durationDays" INTEGER NOT NULL,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "pricePerMeal" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "isVeg" BOOLEAN NOT NULL DEFAULT true,
    "menuRotation" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."MealSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "commerce"."SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "slot" "commerce"."MealSlot" NOT NULL,
    "deliveryTime" TEXT NOT NULL,
    "deliveryAddress" JSONB NOT NULL,
    "mealsTotal" INTEGER NOT NULL,
    "mealsDelivered" INTEGER NOT NULL DEFAULT 0,
    "pausedDates" DATE[],
    "paymentId" TEXT,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."MembershipPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "benefits" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."CustomerMembership" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "commerce"."CustomerMembershipStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "paymentId" TEXT,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "savings" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."RiderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "delivery"."RiderStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zoneId" TEXT,
    "vehicleType" "delivery"."VehicleType" NOT NULL DEFAULT 'MOTORCYCLE',
    "vehicleNumber" TEXT,
    "licenseNumber" TEXT,
    "aadhaarLast4" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isOnDelivery" BOOLEAN NOT NULL DEFAULT false,
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
    "bankAccount" JSONB,
    "upiId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."DeliveryZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "baseFee" DECIMAL(10,2) NOT NULL,
    "perKmFee" DECIMAL(10,2) NOT NULL,
    "freeKm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "riderBasePay" DECIMAL(10,2) NOT NULL,
    "riderPerKm" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "customerId" TEXT,
    "riderId" TEXT,
    "zoneId" TEXT,
    "status" "delivery"."DeliveryStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "pickupName" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupPhone" TEXT,
    "dropName" TEXT,
    "dropAddress" TEXT NOT NULL,
    "dropLat" DOUBLE PRECISION NOT NULL,
    "dropLng" DOUBLE PRECISION NOT NULL,
    "dropPhone" TEXT,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "estimatedMins" INTEGER NOT NULL,
    "orderValue" DECIMAL(12,2) NOT NULL,
    "isCod" BOOLEAN NOT NULL DEFAULT false,
    "codAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tipAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "riderEarning" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "deliveryOtp" TEXT,
    "proofPhotoUrl" TEXT,
    "proofSignatureUrl" TEXT,
    "proofNote" TEXT,
    "failureReason" TEXT,
    "route" JSONB,
    "batchId" TEXT,
    "searchAttempts" INTEGER NOT NULL DEFAULT 0,
    "readyAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "arrivedPickupAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "arrivedDropAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."DeliveryOffer" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "status" "delivery"."OfferStatus" NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION NOT NULL,
    "distanceToPickupKm" DOUBLE PRECISION NOT NULL,
    "estimatedEarning" DECIMAL(10,2) NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "rejectReason" TEXT,

    CONSTRAINT "DeliveryOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."RiderLocationPing" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedKmph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "batteryPct" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderLocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."RiderAttendance" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "delivery"."AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "onlineMinutes" INTEGER NOT NULL DEFAULT 0,
    "deliveryCount" INTEGER NOT NULL DEFAULT 0,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."IncentiveScheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "delivery"."IncentiveType" NOT NULL,
    "zoneId" TEXT,
    "city" TEXT,
    "target" INTEGER NOT NULL,
    "rewardAmount" DECIMAL(10,2) NOT NULL,
    "peakWindows" JSONB,
    "minRating" DOUBLE PRECISION,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."RiderIncentive" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "rewardAmount" DECIMAL(10,2) NOT NULL,
    "status" "delivery"."IncentiveProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "achievedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderIncentive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."RiderEarning" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "type" "delivery"."EarningType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "walletTxnId" TEXT,

    CONSTRAINT "RiderEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."Tenant" (
    "id" TEXT NOT NULL,
    "type" "identity"."TenantType" NOT NULL,
    "status" "identity"."TenantStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "fssaiLicense" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "logoUrl" TEXT,
    "commissionRate" DECIMAL(5,2),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "kycDocuments" JSONB NOT NULL DEFAULT '[]',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."User" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "passwordHash" TEXT,
    "roles" "identity"."PlatformRole"[] DEFAULT ARRAY['CUSTOMER']::"identity"."PlatformRole"[],
    "status" "identity"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "phoneVerifiedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "referralCode" TEXT,
    "referredBy" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."TenantMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "identity"."TenantRole" NOT NULL,
    "status" "identity"."TenantMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "outletIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT,
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "contactName" TEXT,
    "contactPhone" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."OtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "identity"."OtpPurpose" NOT NULL DEFAULT 'LOGIN',
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tenantId" TEXT,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "identity"."OAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."ApprovalRequest" (
    "id" TEXT NOT NULL,
    "entityType" "identity"."ApprovalEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "submittedBy" TEXT,
    "status" "identity"."ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "tenantId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."CmsPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "identity"."ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "identity"."Audience" NOT NULL DEFAULT 'ALL',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."CmsBanner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "placement" TEXT NOT NULL,
    "audience" "identity"."Audience" NOT NULL DEFAULT 'CUSTOMER',
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."Ingredient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" "inventory"."IngredientCategory" NOT NULL,
    "unit" "platform"."StockUnit" NOT NULL,
    "currentStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "safetyStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "maxStock" DECIMAL(14,3),
    "avgUnitCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "lastPurchasePrice" DECIMAL(12,4),
    "shelfLifeDays" INTEGER,
    "storageType" "inventory"."StorageType" NOT NULL DEFAULT 'DRY',
    "isPerishable" BOOLEAN NOT NULL DEFAULT false,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 2,
    "preferredSupplierId" TEXT,
    "marketplaceCategory" TEXT,
    "marketplaceProductId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."StockBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "remainingQty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "purchaseOrderId" TEXT,
    "supplierTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" "inventory"."StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(12,4),
    "totalCost" DECIMAL(14,2),
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."ConsumptionDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "consumedQty" DECIMAL(14,3) NOT NULL,
    "wastedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConsumptionDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."Recipe" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yieldQty" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "yieldUnit" "platform"."StockUnit" NOT NULL DEFAULT 'PCS',
    "prepTimeMins" INTEGER,
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" "platform"."StockUnit" NOT NULL,
    "wastagePct" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."ProductionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "planDate" DATE NOT NULL,
    "status" "inventory"."ProductionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."ProductionPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "recipeId" TEXT,
    "name" TEXT NOT NULL,
    "forecastQty" DECIMAL(10,2) NOT NULL,
    "plannedQty" DECIMAL(10,2) NOT NULL,
    "producedQty" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."CostSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sellingPrice" DECIMAL(10,2) NOT NULL,
    "foodCost" DECIMAL(10,4) NOT NULL,
    "packagingCost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "foodCostPct" DECIMAL(6,2) NOT NULL,
    "marginPct" DECIMAL(6,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."ProductCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sellerType" "marketplace"."SellerType" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unit" "platform"."StockUnit" NOT NULL,
    "packSize" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,
    "mrp" DECIMAL(12,2),
    "moq" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "maxOrderQty" DECIMAL(12,3),
    "stepQty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "hsnCode" TEXT,
    "deliveryTimeHours" INTEGER NOT NULL DEFAULT 24,
    "stockQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "lowStockThreshold" DECIMAL(14,3) NOT NULL DEFAULT 10,
    "stockStatus" "marketplace"."StockStatus" NOT NULL DEFAULT 'IN_STOCK',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."PriceTier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQty" DECIMAL(12,3) NOT NULL,
    "maxQty" DECIMAL(12,3),
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "segment" "marketplace"."BuyerSegment" NOT NULL DEFAULT 'ALL',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."SellerDeliveryZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pincodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "radiusKm" DOUBLE PRECISION,
    "deliveryCharge" DECIMAL(10,2) NOT NULL,
    "freeDeliveryAbove" DECIMAL(12,2),
    "minOrderValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "leadTimeHours" INTEGER NOT NULL DEFAULT 24,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerDeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."DeliverySlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "cutoffMinutes" INTEGER NOT NULL DEFAULT 120,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."Territory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pincodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "managerUserId" TEXT,
    "monthlyTarget" DECIMAL(14,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."Dealer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealerTenantId" TEXT,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "territoryId" TEXT,
    "tier" "marketplace"."DealerTier" NOT NULL DEFAULT 'BRONZE',
    "status" "marketplace"."DealerStatus" NOT NULL DEFAULT 'PROSPECT',
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTerms" "marketplace"."PaymentTerms" NOT NULL DEFAULT 'PREPAID',
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."B2bOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "buyerTenantId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "sellerTenantId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sourcePurchaseOrderId" TEXT,
    "status" "marketplace"."B2bOrderStatus" NOT NULL DEFAULT 'PLACED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "deliveryCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "paymentTerms" "marketplace"."PaymentTerms" NOT NULL DEFAULT 'PREPAID',
    "paymentStatus" "marketplace"."B2bPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "deliverySlotId" TEXT,
    "deliveryDate" DATE,
    "deliveryAddress" JSONB NOT NULL,
    "expectedDeliveryAt" TIMESTAMP(3),
    "trackingInfo" JSONB,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2bOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."B2bOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "confirmedQty" DECIMAL(12,3),

    CONSTRAINT "B2bOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."B2bOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "marketplace"."B2bOrderStatus" NOT NULL,
    "note" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2bOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."SellerRating" (
    "id" TEXT NOT NULL,
    "b2bOrderId" TEXT NOT NULL,
    "buyerTenantId" TEXT NOT NULL,
    "sellerTenantId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "qualityRating" INTEGER,
    "onTime" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."SellerMetrics" (
    "tenantId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "onTimeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fillRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "avgLeadTimeHours" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerMetrics_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "notifications"."NotificationTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "notifications"."NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "recipient" TEXT NOT NULL,
    "channel" "notifications"."NotificationChannel" NOT NULL,
    "templateKey" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" "notifications"."NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "campaignId" TEXT,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "notifications"."DevicePlatform" NOT NULL,
    "app" "notifications"."AppKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."PushCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "deepLink" TEXT,
    "app" "notifications"."AppKind" NOT NULL,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "status" "notifications"."PushCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."NotificationPreference" (
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "marketingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "payments"."Payment" (
    "id" TEXT NOT NULL,
    "purpose" "payments"."PaymentPurpose" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "method" "platform"."PaymentMethod",
    "provider" "payments"."PaymentProvider" NOT NULL,
    "state" "payments"."PaymentState" NOT NULL DEFAULT 'CREATED',
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "providerSignature" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "idempotencyKey" TEXT,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "payments"."RefundStatus" NOT NULL DEFAULT 'PENDING',
    "toWallet" BOOLEAN NOT NULL DEFAULT false,
    "providerRefundId" TEXT,
    "initiatedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."Wallet" (
    "id" TEXT NOT NULL,
    "ownerType" "payments"."WalletOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "payments"."WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "payments"."LedgerEntryType" NOT NULL,
    "reason" "payments"."LedgerReason" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."CommissionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantType" "identity"."TenantType",
    "tenantId" TEXT,
    "outletId" TEXT,
    "ratePct" DECIMAL(5,2) NOT NULL,
    "fixedFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minFee" DECIMAL(10,2),
    "maxFee" DECIMAL(10,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."Settlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "grossSales" DECIMAL(14,2) NOT NULL,
    "merchantDiscounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(14,2) NOT NULL,
    "commissionGst" DECIMAL(14,2) NOT NULL,
    "tcs" DECIMAL(14,2) NOT NULL,
    "tds" DECIMAL(14,2) NOT NULL,
    "refunds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adjustments" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(14,2) NOT NULL,
    "status" "payments"."SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "payoutReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."SettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "orderTotal" DECIMAL(12,2) NOT NULL,
    "taxableValue" DECIMAL(12,2) NOT NULL,
    "gstCollected" DECIMAL(12,2) NOT NULL,
    "merchantDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(12,2) NOT NULL,
    "commissionGst" DECIMAL(12,2) NOT NULL,
    "tcs" DECIMAL(12,2) NOT NULL,
    "tds" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."Payout" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "ownerType" "payments"."WalletOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "payments"."PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "method" TEXT NOT NULL DEFAULT 'UPI',
    "destination" JSONB NOT NULL,
    "utr" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."GstInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "payments"."InvoiceType" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "tenantId" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierGstin" TEXT,
    "supplierStateCode" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientGstin" TEXT,
    "placeOfSupply" TEXT NOT NULL,
    "isInterState" BOOLEAN NOT NULL,
    "hsnSac" TEXT NOT NULL,
    "taxableValue" DECIMAL(14,2) NOT NULL,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cess" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfUrl" TEXT,

    CONSTRAINT "GstInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "payments"."PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."OutboxEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "tenantId" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."ProcessedEvent" (
    "consumer" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("consumer","eventId")
);

-- CreateTable
CREATE TABLE "platform"."IdempotencyRecord" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("scope","key")
);

-- CreateTable
CREATE TABLE "platform"."SequenceCounter" (
    "name" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "procurement"."ProcurementSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "autoPoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveBelow" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "defaultStrategy" "procurement"."SupplierStrategy" NOT NULL DEFAULT 'BALANCED',
    "forecastHorizonDays" INTEGER NOT NULL DEFAULT 14,
    "serviceLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    "reviewPeriodDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement"."DemandForecast" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "forecastDate" DATE NOT NULL,
    "predictedQty" DECIMAL(14,3) NOT NULL,
    "lowerQty" DECIMAL(14,3) NOT NULL,
    "upperQty" DECIMAL(14,3) NOT NULL,
    "model" TEXT NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement"."ReorderAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" DECIMAL(14,3) NOT NULL,
    "reorderLevel" DECIMAL(14,3) NOT NULL,
    "avgDailyUsage" DECIMAL(14,3) NOT NULL,
    "daysOfCover" DOUBLE PRECISION NOT NULL,
    "predictedDepletionDate" TIMESTAMP(3),
    "suggestedQty" DECIMAL(14,3) NOT NULL,
    "severity" "procurement"."AlertSeverity" NOT NULL,
    "status" "procurement"."ReorderAlertStatus" NOT NULL DEFAULT 'OPEN',
    "purchaseOrderId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReorderAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement"."SupplierQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierTenantId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "landedCost" DECIMAL(14,2) NOT NULL,
    "leadTimeHours" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "onTimeRate" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "strategy" "procurement"."SupplierStrategy" NOT NULL,
    "purchaseOrderId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement"."PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "supplierTenantId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "status" "procurement"."PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "procurement"."PurchaseOrderSource" NOT NULL DEFAULT 'MANUAL',
    "strategy" "procurement"."SupplierStrategy",
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "deliveryCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentTerms" TEXT NOT NULL DEFAULT 'PREPAID',
    "expectedDeliveryAt" TIMESTAMP(3),
    "deliveryAddress" JSONB,
    "notes" TEXT,
    "createdBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "supplierOrderId" TEXT,
    "supplierConfirmedAt" TIMESTAMP(3),
    "supplierNotes" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "trackingInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement"."PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "confirmedQty" DECIMAL(14,3),
    "receivedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement"."PurchaseOrderApproval" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "procurement"."ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement"."PurchaseOrderEvent" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "status" "procurement"."PurchaseOrderStatus" NOT NULL,
    "note" TEXT,
    "actorType" TEXT,
    "actorId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCampaign_status_placement_idx" ON "ads"."AdCampaign"("status", "placement");

-- CreateIndex
CREATE INDEX "AdCampaign_tenantId_idx" ON "ads"."AdCampaign"("tenantId");

-- CreateIndex
CREATE INDEX "AdEvent_campaignId_createdAt_idx" ON "ads"."AdEvent"("campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdDailyStats_campaignId_date_key" ON "ads"."AdDailyStats"("campaignId", "date");

-- CreateIndex
CREATE INDEX "AiModelRun_kind_createdAt_idx" ON "ai"."AiModelRun"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "FraudAssessment_entityType_entityId_idx" ON "ai"."FraudAssessment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "FraudAssessment_decision_createdAt_idx" ON "ai"."FraudAssessment"("decision", "createdAt");

-- CreateIndex
CREATE INDEX "PricingSuggestion_tenantId_status_idx" ON "ai"."PricingSuggestion"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OutletScore_tenantId_idx" ON "ai"."OutletScore"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OutletScore_outletId_periodStart_periodEnd_key" ON "ai"."OutletScore"("outletId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ExternalSignal_date_city_idx" ON "ai"."ExternalSignal"("date", "city");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSignal_type_name_city_date_key" ON "ai"."ExternalSignal"("type", "name", "city", "date");

-- CreateIndex
CREATE INDEX "OrderFact_date_idx" ON "analytics"."OrderFact"("date");

-- CreateIndex
CREATE INDEX "OrderFact_tenantId_date_idx" ON "analytics"."OrderFact"("tenantId", "date");

-- CreateIndex
CREATE INDEX "OrderFact_outletId_date_idx" ON "analytics"."OrderFact"("outletId", "date");

-- CreateIndex
CREATE INDEX "OrderFact_customerId_date_idx" ON "analytics"."OrderFact"("customerId", "date");

-- CreateIndex
CREATE INDEX "DailyOutletStats_tenantId_date_idx" ON "analytics"."DailyOutletStats"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyOutletStats_outletId_date_key" ON "analytics"."DailyOutletStats"("outletId", "date");

-- CreateIndex
CREATE INDEX "DailyRiderStats_date_idx" ON "analytics"."DailyRiderStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRiderStats_riderId_date_key" ON "analytics"."DailyRiderStats"("riderId", "date");

-- CreateIndex
CREATE INDEX "DailySupplierStats_date_idx" ON "analytics"."DailySupplierStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailySupplierStats_tenantId_date_key" ON "analytics"."DailySupplierStats"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Outlet_slug_key" ON "commerce"."Outlet"("slug");

-- CreateIndex
CREATE INDEX "Outlet_tenantId_idx" ON "commerce"."Outlet"("tenantId");

-- CreateIndex
CREATE INDEX "Outlet_city_status_idx" ON "commerce"."Outlet"("city", "status");

-- CreateIndex
CREATE INDEX "Outlet_geohash_idx" ON "commerce"."Outlet"("geohash");

-- CreateIndex
CREATE INDEX "MenuCategory_outletId_sortOrder_idx" ON "commerce"."MenuCategory"("outletId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_outletId_categoryId_idx" ON "commerce"."MenuItem"("outletId", "categoryId");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_idx" ON "commerce"."MenuItem"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItemVariant_menuItemId_idx" ON "commerce"."MenuItemVariant"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuAddonGroup_menuItemId_idx" ON "commerce"."MenuAddonGroup"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuAddon_groupId_idx" ON "commerce"."MenuAddon"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_qrToken_key" ON "commerce"."DiningTable"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_outletId_label_key" ON "commerce"."DiningTable"("outletId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "commerce"."Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "commerce"."Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_tenantId_createdAt_idx" ON "commerce"."Order"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_outletId_status_idx" ON "commerce"."Order"("outletId", "status");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "commerce"."Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "commerce"."Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "commerce"."OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_menuItemId_idx" ON "commerce"."OrderItem"("menuItemId");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_createdAt_idx" ON "commerce"."OrderStatusEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "KitchenTicket_outletId_status_createdAt_idx" ON "commerce"."KitchenTicket"("outletId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "commerce"."Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_tenantId_isActive_idx" ON "commerce"."Coupon"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "commerce"."CouponRedemption"("orderId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_userId_idx" ON "commerce"."CouponRedemption"("couponId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "commerce"."Review"("orderId");

-- CreateIndex
CREATE INDEX "Review_outletId_createdAt_idx" ON "commerce"."Review"("outletId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "commerce"."Review"("customerId");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_outletId_isActive_idx" ON "commerce"."SubscriptionPlan"("outletId", "isActive");

-- CreateIndex
CREATE INDEX "MealSubscription_customerId_idx" ON "commerce"."MealSubscription"("customerId");

-- CreateIndex
CREATE INDEX "MealSubscription_outletId_status_idx" ON "commerce"."MealSubscription"("outletId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_code_key" ON "commerce"."MembershipPlan"("code");

-- CreateIndex
CREATE INDEX "CustomerMembership_customerId_status_idx" ON "commerce"."CustomerMembership"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RiderProfile_userId_key" ON "delivery"."RiderProfile"("userId");

-- CreateIndex
CREATE INDEX "RiderProfile_status_isOnline_idx" ON "delivery"."RiderProfile"("status", "isOnline");

-- CreateIndex
CREATE INDEX "RiderProfile_zoneId_idx" ON "delivery"."RiderProfile"("zoneId");

-- CreateIndex
CREATE INDEX "DeliveryZone_city_idx" ON "delivery"."DeliveryZone"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "delivery"."Delivery"("orderId");

-- CreateIndex
CREATE INDEX "Delivery_riderId_status_idx" ON "delivery"."Delivery"("riderId", "status");

-- CreateIndex
CREATE INDEX "Delivery_status_createdAt_idx" ON "delivery"."Delivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_tenantId_createdAt_idx" ON "delivery"."Delivery"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryOffer_riderId_status_idx" ON "delivery"."DeliveryOffer"("riderId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOffer_deliveryId_idx" ON "delivery"."DeliveryOffer"("deliveryId");

-- CreateIndex
CREATE INDEX "RiderLocationPing_riderId_recordedAt_idx" ON "delivery"."RiderLocationPing"("riderId", "recordedAt");

-- CreateIndex
CREATE INDEX "RiderLocationPing_recordedAt_idx" ON "delivery"."RiderLocationPing"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiderAttendance_riderId_date_key" ON "delivery"."RiderAttendance"("riderId", "date");

-- CreateIndex
CREATE INDEX "IncentiveScheme_isActive_startsAt_endsAt_idx" ON "delivery"."IncentiveScheme"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiderIncentive_riderId_schemeId_key" ON "delivery"."RiderIncentive"("riderId", "schemeId");

-- CreateIndex
CREATE INDEX "RiderEarning_riderId_earnedAt_idx" ON "delivery"."RiderEarning"("riderId", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "identity"."Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_type_status_idx" ON "identity"."Tenant"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "identity"."User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "identity"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "identity"."User"("referralCode");

-- CreateIndex
CREATE INDEX "TenantMember_userId_idx" ON "identity"."TenantMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMember_tenantId_userId_key" ON "identity"."TenantMember"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "identity"."Address"("userId");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_purpose_createdAt_idx" ON "identity"."OtpChallenge"("phone", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "identity"."RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "identity"."RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "identity"."RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "identity"."OAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entityType_status_createdAt_idx" ON "identity"."ApprovalRequest"("entityType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entityId_idx" ON "identity"."ApprovalRequest"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "identity"."AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "identity"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CmsPage_slug_key" ON "identity"."CmsPage"("slug");

-- CreateIndex
CREATE INDEX "CmsBanner_placement_isActive_idx" ON "identity"."CmsBanner"("placement", "isActive");

-- CreateIndex
CREATE INDEX "Ingredient_tenantId_category_idx" ON "inventory"."Ingredient"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_outletId_sku_key" ON "inventory"."Ingredient"("outletId", "sku");

-- CreateIndex
CREATE INDEX "StockBatch_ingredientId_expiresAt_idx" ON "inventory"."StockBatch"("ingredientId", "expiresAt");

-- CreateIndex
CREATE INDEX "StockMovement_ingredientId_createdAt_idx" ON "inventory"."StockMovement"("ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_outletId_createdAt_idx" ON "inventory"."StockMovement"("tenantId", "outletId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "inventory"."StockMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "ConsumptionDaily_tenantId_outletId_date_idx" ON "inventory"."ConsumptionDaily"("tenantId", "outletId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumptionDaily_ingredientId_date_key" ON "inventory"."ConsumptionDaily"("ingredientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_menuItemId_key" ON "inventory"."Recipe"("menuItemId");

-- CreateIndex
CREATE INDEX "Recipe_tenantId_outletId_idx" ON "inventory"."Recipe"("tenantId", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "inventory"."RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPlan_outletId_planDate_key" ON "inventory"."ProductionPlan"("outletId", "planDate");

-- CreateIndex
CREATE INDEX "ProductionPlanItem_planId_idx" ON "inventory"."ProductionPlanItem"("planId");

-- CreateIndex
CREATE INDEX "CostSnapshot_tenantId_outletId_date_idx" ON "inventory"."CostSnapshot"("tenantId", "outletId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CostSnapshot_menuItemId_date_key" ON "inventory"."CostSnapshot"("menuItemId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_code_key" ON "marketplace"."ProductCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "marketplace"."ProductCategory"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_idx" ON "marketplace"."Product"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "Product_tenantId_isActive_idx" ON "marketplace"."Product"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "marketplace"."Product"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "PriceTier_productId_segment_idx" ON "marketplace"."PriceTier"("productId", "segment");

-- CreateIndex
CREATE INDEX "SellerDeliveryZone_tenantId_isActive_idx" ON "marketplace"."SellerDeliveryZone"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "DeliverySlot_tenantId_dayOfWeek_idx" ON "marketplace"."DeliverySlot"("tenantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Territory_tenantId_idx" ON "marketplace"."Territory"("tenantId");

-- CreateIndex
CREATE INDEX "Dealer_tenantId_territoryId_idx" ON "marketplace"."Dealer"("tenantId", "territoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_tenantId_phone_key" ON "marketplace"."Dealer"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "B2bOrder_orderNumber_key" ON "marketplace"."B2bOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "B2bOrder_sourcePurchaseOrderId_key" ON "marketplace"."B2bOrder"("sourcePurchaseOrderId");

-- CreateIndex
CREATE INDEX "B2bOrder_sellerTenantId_status_idx" ON "marketplace"."B2bOrder"("sellerTenantId", "status");

-- CreateIndex
CREATE INDEX "B2bOrder_buyerTenantId_createdAt_idx" ON "marketplace"."B2bOrder"("buyerTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "B2bOrder_deliverySlotId_deliveryDate_idx" ON "marketplace"."B2bOrder"("deliverySlotId", "deliveryDate");

-- CreateIndex
CREATE INDEX "B2bOrderItem_orderId_idx" ON "marketplace"."B2bOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "B2bOrderItem_productId_idx" ON "marketplace"."B2bOrderItem"("productId");

-- CreateIndex
CREATE INDEX "B2bOrderEvent_orderId_createdAt_idx" ON "marketplace"."B2bOrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerRating_b2bOrderId_key" ON "marketplace"."SellerRating"("b2bOrderId");

-- CreateIndex
CREATE INDEX "SellerRating_sellerTenantId_idx" ON "marketplace"."SellerRating"("sellerTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_channel_locale_key" ON "notifications"."NotificationTemplate"("key", "channel", "locale");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "notifications"."Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "notifications"."Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_campaignId_idx" ON "notifications"."Notification"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "notifications"."DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_app_idx" ON "notifications"."DeviceToken"("userId", "app");

-- CreateIndex
CREATE INDEX "PushCampaign_status_scheduledAt_idx" ON "notifications"."PushCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "payments"."Payment"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "payments"."Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "payments"."Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_purpose_referenceId_idx" ON "payments"."Payment"("purpose", "referenceId");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "payments"."Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_state_createdAt_idx" ON "payments"."Payment"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "payments"."Refund"("providerRefundId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "payments"."Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_ownerType_ownerId_key" ON "payments"."Wallet"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "payments"."WalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "payments"."WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_referenceType_referenceId_idx" ON "payments"."WalletTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantId_idx" ON "payments"."CommissionRule"("tenantId");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantType_isActive_idx" ON "payments"."CommissionRule"("tenantType", "isActive");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "payments"."Settlement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_tenantId_periodStart_periodEnd_key" ON "payments"."Settlement"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLine_orderId_key" ON "payments"."SettlementLine"("orderId");

-- CreateIndex
CREATE INDEX "SettlementLine_tenantId_settlementId_idx" ON "payments"."SettlementLine"("tenantId", "settlementId");

-- CreateIndex
CREATE INDEX "SettlementLine_orderDate_idx" ON "payments"."SettlementLine"("orderDate");

-- CreateIndex
CREATE INDEX "Payout_ownerType_ownerId_idx" ON "payments"."Payout"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "payments"."Payout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GstInvoice_invoiceNumber_key" ON "payments"."GstInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "GstInvoice_tenantId_issuedAt_idx" ON "payments"."GstInvoice"("tenantId", "issuedAt");

-- CreateIndex
CREATE INDEX "GstInvoice_type_issuedAt_idx" ON "payments"."GstInvoice"("type", "issuedAt");

-- CreateIndex
CREATE INDEX "GstInvoice_referenceId_idx" ON "payments"."GstInvoice"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_eventId_key" ON "payments"."PaymentWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "OutboxEvent_source_publishedAt_occurredAt_idx" ON "platform"."OutboxEvent"("source", "publishedAt", "occurredAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "platform"."IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementSettings_tenantId_key" ON "procurement"."ProcurementSettings"("tenantId");

-- CreateIndex
CREATE INDEX "DemandForecast_tenantId_outletId_forecastDate_idx" ON "procurement"."DemandForecast"("tenantId", "outletId", "forecastDate");

-- CreateIndex
CREATE UNIQUE INDEX "DemandForecast_ingredientId_forecastDate_key" ON "procurement"."DemandForecast"("ingredientId", "forecastDate");

-- CreateIndex
CREATE INDEX "ReorderAlert_tenantId_status_idx" ON "procurement"."ReorderAlert"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ReorderAlert_ingredientId_status_idx" ON "procurement"."ReorderAlert"("ingredientId", "status");

-- CreateIndex
CREATE INDEX "SupplierQuote_tenantId_ingredientId_generatedAt_idx" ON "procurement"."SupplierQuote"("tenantId", "ingredientId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "procurement"."PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_status_idx" ON "procurement"."PurchaseOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierTenantId_status_idx" ON "procurement"."PurchaseOrder"("supplierTenantId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "procurement"."PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderApproval_purchaseOrderId_idx" ON "procurement"."PurchaseOrderApproval"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderEvent_purchaseOrderId_createdAt_idx" ON "procurement"."PurchaseOrderEvent"("purchaseOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "ads"."AdEvent" ADD CONSTRAINT "AdEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ads"."AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads"."AdDailyStats" ADD CONSTRAINT "AdDailyStats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ads"."AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."MenuCategory" ADD CONSTRAINT "MenuCategory_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "commerce"."Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."MenuItem" ADD CONSTRAINT "MenuItem_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "commerce"."Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "commerce"."MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."MenuItemVariant" ADD CONSTRAINT "MenuItemVariant_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "commerce"."MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."MenuAddonGroup" ADD CONSTRAINT "MenuAddonGroup_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "commerce"."MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."MenuAddon" ADD CONSTRAINT "MenuAddon_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "commerce"."MenuAddonGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."DiningTable" ADD CONSTRAINT "DiningTable_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "commerce"."Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."Order" ADD CONSTRAINT "Order_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "commerce"."Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "commerce"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "commerce"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."KitchenTicket" ADD CONSTRAINT "KitchenTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "commerce"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "commerce"."Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "commerce"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."Review" ADD CONSTRAINT "Review_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "commerce"."Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "commerce"."Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."MealSubscription" ADD CONSTRAINT "MealSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "commerce"."SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."CustomerMembership" ADD CONSTRAINT "CustomerMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "commerce"."MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."RiderProfile" ADD CONSTRAINT "RiderProfile_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery"."DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."Delivery" ADD CONSTRAINT "Delivery_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "delivery"."RiderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."Delivery" ADD CONSTRAINT "Delivery_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery"."DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "delivery"."Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "delivery"."RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."RiderAttendance" ADD CONSTRAINT "RiderAttendance_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "delivery"."RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."IncentiveScheme" ADD CONSTRAINT "IncentiveScheme_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery"."DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."RiderIncentive" ADD CONSTRAINT "RiderIncentive_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "delivery"."RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."RiderIncentive" ADD CONSTRAINT "RiderIncentive_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "delivery"."IncentiveScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."RiderEarning" ADD CONSTRAINT "RiderEarning_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "delivery"."RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."TenantMember" ADD CONSTRAINT "TenantMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "identity"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."TenantMember" ADD CONSTRAINT "TenantMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."StockBatch" ADD CONSTRAINT "StockBatch_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "inventory"."Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."StockMovement" ADD CONSTRAINT "StockMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "inventory"."Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."ConsumptionDaily" ADD CONSTRAINT "ConsumptionDaily_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "inventory"."Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "inventory"."Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "inventory"."Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."ProductionPlanItem" ADD CONSTRAINT "ProductionPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "inventory"."ProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "marketplace"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "marketplace"."ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."PriceTier" ADD CONSTRAINT "PriceTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "marketplace"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."Dealer" ADD CONSTRAINT "Dealer_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "marketplace"."Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."B2bOrderItem" ADD CONSTRAINT "B2bOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace"."B2bOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."B2bOrderEvent" ADD CONSTRAINT "B2bOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace"."B2bOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "payments"."Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."SettlementLine" ADD CONSTRAINT "SettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "payments"."Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."Payout" ADD CONSTRAINT "Payout_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "payments"."Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement"."PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "procurement"."PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement"."PurchaseOrderApproval" ADD CONSTRAINT "PurchaseOrderApproval_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "procurement"."PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement"."PurchaseOrderEvent" ADD CONSTRAINT "PurchaseOrderEvent_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "procurement"."PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

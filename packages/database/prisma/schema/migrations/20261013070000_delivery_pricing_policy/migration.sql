-- Delivery pricing versions replace the per-zone tariffs: a flat customer fee below a free-delivery
-- threshold, rider pay of the greater of a minimum and a per-km rate, and one-time waiting pay.
-- AlterTable
ALTER TABLE "delivery"."Delivery" ADD COLUMN     "orderReadyAt" TIMESTAMP(3),
ADD COLUMN     "payableKm" DOUBLE PRECISION,
ADD COLUMN     "pricingPolicyId" TEXT;

-- AlterTable
ALTER TABLE "delivery"."DeliveryZone" DROP COLUMN "baseFee",
DROP COLUMN "freeKm",
DROP COLUMN "perKmFee",
DROP COLUMN "riderBasePay",
DROP COLUMN "riderPerKm";

-- CreateTable
CREATE TABLE "delivery"."DeliveryPricingPolicy" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "customerFlatFee" DECIMAL(10,2) NOT NULL,
    "freeDeliveryAbove" DECIMAL(10,2),
    "riderPerKm" DECIMAL(10,2) NOT NULL,
    "riderMinPayout" DECIMAL(10,2) NOT NULL,
    "waitingThresholdMins" INTEGER NOT NULL,
    "waitingPay" DECIMAL(10,2) NOT NULL,
    "arrivalRadiusM" INTEGER NOT NULL,
    "cancellationPay" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPricingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."DeliveryWait" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL,
    "arrivalLat" DOUBLE PRECISION,
    "arrivalLng" DOUBLE PRECISION,
    "arrivalDistanceM" INTEGER,
    "verified" BOOLEAN NOT NULL,
    "orderReadyAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedBy" "delivery"."DeliveryStatus",
    "waitedMins" DOUBLE PRECISION,
    "thresholdMins" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryWait_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPricingPolicy_version_key" ON "delivery"."DeliveryPricingPolicy"("version");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryWait_deliveryId_key" ON "delivery"."DeliveryWait"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryWait_riderId_arrivedAt_idx" ON "delivery"."DeliveryWait"("riderId", "arrivedAt");

-- AddForeignKey
ALTER TABLE "delivery"."Delivery" ADD CONSTRAINT "Delivery_pricingPolicyId_fkey" FOREIGN KEY ("pricingPolicyId") REFERENCES "delivery"."DeliveryPricingPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."DeliveryWait" ADD CONSTRAINT "DeliveryWait_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "delivery"."Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."DeliveryWait" ADD CONSTRAINT "DeliveryWait_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "delivery"."DeliveryPricingPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "analytics"."OrderFact" ADD COLUMN     "merchantDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "packagingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0;

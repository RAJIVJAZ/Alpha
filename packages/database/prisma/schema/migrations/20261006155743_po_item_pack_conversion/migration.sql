-- AlterTable
ALTER TABLE "procurement"."PurchaseOrderItem" ADD COLUMN     "baseQtyPerPack" DECIMAL(14,4) NOT NULL DEFAULT 1,
ADD COLUMN     "ingredientUnit" TEXT;

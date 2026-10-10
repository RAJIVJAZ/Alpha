-- The per-business commission override lives in payments."CommissionRule" (tenant-scoped
-- rules), the only table settlements read. Carry existing overrides over as rules unless
-- the business already has an active business-wide rule, then drop the unused column.
INSERT INTO "payments"."CommissionRule"
  ("id", "name", "tenantId", "ratePct", "effectiveFrom", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Business override', t."id", t."commissionRate", now(), true, now(), now()
FROM "identity"."Tenant" t
WHERE t."commissionRate" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "payments"."CommissionRule" r
    WHERE r."tenantId" = t."id" AND r."outletId" IS NULL AND r."isActive"
  );

-- AlterTable
ALTER TABLE "identity"."Tenant" DROP COLUMN "commissionRate";

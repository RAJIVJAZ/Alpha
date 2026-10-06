-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";

-- CreateIndex
CREATE INDEX "MenuItem_name_trgm_idx" ON "commerce"."MenuItem" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Outlet_name_trgm_idx" ON "commerce"."Outlet" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_name_trgm_idx" ON "marketplace"."Product" USING GIN ("name" gin_trgm_ops);

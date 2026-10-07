import { Prisma, PrismaClient } from '../generated/client';

/**
 * Models partitioned by a non-null `tenantId`. Queries issued through a
 * tenant-scoped client are automatically constrained to the caller's tenant,
 * and writes are stamped with it. This is the primary multi-tenancy guard;
 * services must use `prisma.forTenant(tenantId)` for every merchant-facing
 * query.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  // commerce
  'Outlet',
  'MenuCategory',
  'MenuItem',
  'DiningTable',
  'Order',
  'KitchenTicket',
  'Review',
  'SubscriptionPlan',
  'MealSubscription',
  // inventory
  'Ingredient',
  'StockBatch',
  'StockMovement',
  'ConsumptionDaily',
  'Recipe',
  'ProductionPlan',
  'CostSnapshot',
  // procurement
  'ProcurementSettings',
  'DemandForecast',
  'ReorderAlert',
  'SupplierQuote',
  'PurchaseOrder',
  // marketplace (seller side)
  'Product',
  'SellerDeliveryZone',
  'DeliverySlot',
  'Territory',
  'Dealer',
  // payments
  'Settlement',
  'SettlementLine',
  // ads / ai / analytics
  'AdCampaign',
  'OutletScore',
  'OrderFact',
  'DailyOutletStats',
  'DailySupplierStats',
]);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

const CREATE_OPERATIONS = new Set(['create']);
const CREATE_MANY_OPERATIONS = new Set(['createMany', 'createManyAndReturn']);

export class TenantScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeViolationError';
  }
}

type AnyArgs = Record<string, any> | undefined;

function stampData(data: Record<string, any>, tenantId: string, model: string) {
  if (data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantScopeViolationError(
      `Refusing to write ${model} for tenant ${String(data.tenantId)} from tenant ${tenantId}`,
    );
  }
  return { ...data, tenantId };
}

function guardUpdate(data: Record<string, any> | undefined, tenantId: string, model: string) {
  if (data && data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantScopeViolationError(`Refusing to move ${model} to another tenant`);
  }
}

/**
 * Pure function that rewrites Prisma operation arguments so that they are
 * restricted to `tenantId`. Exposed for unit testing.
 */
export function applyTenantScope(
  model: string,
  operation: string,
  args: AnyArgs,
  tenantId: string,
): AnyArgs {
  if (!tenantId) throw new TenantScopeViolationError('tenantId is required for scoped queries');
  const next: Record<string, any> = { ...(args ?? {}) };

  if (WHERE_OPERATIONS.has(operation)) {
    next.where = { ...(next.where ?? {}), tenantId };
    if (operation.startsWith('update')) guardUpdate(next.data, tenantId, model);
    return next;
  }

  if (CREATE_OPERATIONS.has(operation)) {
    next.data = stampData(next.data ?? {}, tenantId, model);
    return next;
  }

  if (CREATE_MANY_OPERATIONS.has(operation)) {
    const rows = Array.isArray(next.data) ? next.data : [next.data];
    next.data = rows.map((row: Record<string, any>) => stampData(row, tenantId, model));
    return next;
  }

  if (operation === 'upsert') {
    next.where = { ...(next.where ?? {}), tenantId };
    next.create = stampData(next.create ?? {}, tenantId, model);
    guardUpdate(next.update, tenantId, model);
    return next;
  }

  return next;
}

export function withTenantScope(client: PrismaClient, tenantId: string) {
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) return query(args);
          return query(
            applyTenantScope(model, operation, args as AnyArgs, tenantId) as typeof args,
          );
        },
      },
    },
  });
}

export type TenantScopedClient = ReturnType<typeof withTenantScope>;

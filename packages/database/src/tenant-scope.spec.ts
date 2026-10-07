import { applyTenantScope, TenantScopeViolationError, TENANT_SCOPED_MODELS } from './tenant-scope';

describe('applyTenantScope', () => {
  const T = 'tenant_a';

  it('adds tenantId to read filters', () => {
    expect(applyTenantScope('MenuItem', 'findMany', { where: { isVeg: true } }, T)).toEqual({
      where: { isVeg: true, tenantId: T },
    });
    expect(applyTenantScope('MenuItem', 'findUnique', { where: { id: 'x' } }, T)).toEqual({
      where: { id: 'x', tenantId: T },
    });
    expect(applyTenantScope('MenuItem', 'count', undefined, T)).toEqual({ where: { tenantId: T } });
  });

  it('overrides a spoofed tenantId in filters', () => {
    const out = applyTenantScope('Order', 'findMany', { where: { tenantId: 'tenant_b' } }, T);
    expect(out?.where.tenantId).toBe(T);
  });

  it('stamps tenantId on create and createMany', () => {
    expect(applyTenantScope('Ingredient', 'create', { data: { name: 'Flour' } }, T)).toEqual({
      data: { name: 'Flour', tenantId: T },
    });
    const many = applyTenantScope(
      'Ingredient',
      'createMany',
      { data: [{ name: 'a' }, { name: 'b' }] },
      T,
    );
    expect(many?.data).toEqual([
      { name: 'a', tenantId: T },
      { name: 'b', tenantId: T },
    ]);
  });

  it('rejects writes for another tenant', () => {
    expect(() =>
      applyTenantScope('Ingredient', 'create', { data: { name: 'x', tenantId: 'tenant_b' } }, T),
    ).toThrow(TenantScopeViolationError);
    expect(() =>
      applyTenantScope(
        'Ingredient',
        'update',
        { where: { id: '1' }, data: { tenantId: 'tenant_b' } },
        T,
      ),
    ).toThrow(TenantScopeViolationError);
  });

  it('scopes upserts on both where and create', () => {
    const out = applyTenantScope(
      'ProcurementSettings',
      'upsert',
      { where: { tenantId: T }, create: { autoPoEnabled: true }, update: { autoPoEnabled: false } },
      T,
    );
    expect(out).toEqual({
      where: { tenantId: T },
      create: { autoPoEnabled: true, tenantId: T },
      update: { autoPoEnabled: false },
    });
  });

  it('requires a tenant id', () => {
    expect(() => applyTenantScope('Order', 'findMany', {}, '')).toThrow(TenantScopeViolationError);
  });

  it('covers core merchant models', () => {
    for (const model of ['Outlet', 'Order', 'Ingredient', 'PurchaseOrder', 'Product'] as const) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
    }
    expect(TENANT_SCOPED_MODELS.has('User')).toBe(false);
  });
});

/** Response shapes for the admin console (subset of fields; decimals arrive as strings). */
export type Dec = string;

export interface AdminStats {
  totalUsers: number;
  blockedUsers: number;
  usersByRole: Record<string, number>;
  tenants: { type: string; status: string; count: number }[];
  pendingApprovals: Record<string, number>;
}

export interface PlatformOverview {
  from: string;
  to: string;
  kpis: {
    gmv: number;
    revenue: number;
    takeRatePct: number;
    orders: number;
    averageOrderValue: number;
    cancellationRatePct: number;
    activeCustomers: number;
    newCustomers: number;
    deliveries: number;
    b2bGmv: number;
    b2bOrders: number;
  };
  change: { gmvPct: number | null; revenuePct: number | null; ordersPct: number | null };
  daily: { date: string; gmv: number; revenue: number; orders: number; newCustomers: number }[];
}

export interface AdminUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  roles: string[];
  status: 'ACTIVE' | 'BLOCKED' | string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminTenant {
  id: string;
  type: string;
  status: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  fssaiLicense: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  kycDocuments: { type: string; url?: string; number?: string; verified?: boolean }[] | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  _count?: { members?: number };
}

/** payment-service commission rule; a business-wide one is that business's override. */
export interface CommissionRule {
  id: string;
  name: string;
  tenantType: string | null;
  tenantId: string | null;
  tenantName: string | null;
  outletId: string | null;
  ratePct: Dec;
  fixedFee: Dec;
  minFee: Dec | null;
  maxFee: Dec | null;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface Approval {
  id: string;
  entityType: 'TENANT' | 'RIDER' | 'AD_CAMPAIGN' | 'OUTLET' | string;
  entityId: string;
  tenantId: string | null;
  title: string;
  submittedBy: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | string;
  documents: { type: string; url?: string; number?: string; verified?: boolean }[] | null;
  metadata: Record<string, unknown> | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

/**
 * Form state → user-service bodies for a business application: POST /tenants
 * (CreateTenantDto) to apply, POST /tenants/current/kyc (SubmitKycDto) to fix
 * and resubmit one. The service validates everything again.
 */

export const BUSINESS_TYPES: Record<string, string> = {
  RESTAURANT: 'Restaurant',
  FOOD_CART: 'Food cart',
  RETAILER: 'Retail store',
  WHOLESALER: 'Wholesaler',
  SUPPLIER: 'Supplier',
};

export const DOCUMENTS: Record<string, string> = {
  PAN: 'PAN card',
  GST_CERTIFICATE: 'GST registration certificate',
  FSSAI_LICENSE: 'FSSAI licence or registration',
};

export interface BusinessForm {
  type: string;
  name: string;
  legalName: string;
  pan: string;
  gstin: string;
  fssaiLicense: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
}

/** The KYC identifiers of a business as GET tenants/current returns them. */
export interface BusinessIds {
  legalName: string | null;
  pan?: string | null;
  gstin: string | null;
  fssaiLicense: string | null;
}

/** Restaurants and food carts cook, so they apply with an FSSAI licence. */
export const needsFssai = (type: string) => type === 'RESTAURANT' || type === 'FOOD_CART';

/** Documents to upload: the PAN card, and proof of the GSTIN and FSSAI number when given. */
export const documentsFor = (f: Pick<BusinessForm, 'gstin' | 'fssaiLicense'>) => [
  'PAN',
  ...(f.gstin.trim() ? ['GST_CERTIFICATE'] : []),
  ...(f.fssaiLicense.trim() ? ['FSSAI_LICENSE'] : []),
];

const ids = (f: BusinessForm) => ({
  legalName: f.legalName.trim(),
  pan: f.pan.trim().toUpperCase(),
  gstin: f.gstin.trim().toUpperCase(),
  fssaiLicense: f.fssaiLicense.trim(),
});

const NUMBER_OF: Record<string, keyof ReturnType<typeof ids>> = {
  PAN: 'pan',
  GST_CERTIFICATE: 'gstin',
  FSSAI_LICENSE: 'fssaiLicense',
};

/** `documents` maps each kind from {@link documentsFor} to its uploaded URL. */
const kycDocuments = (f: BusinessForm, documents: Record<string, string>) =>
  documentsFor(f).map((kind) => ({
    kind,
    url: documents[kind]!,
    number: ids(f)[NUMBER_OF[kind]!],
  }));

/** Optional fields left empty are left out: the service refuses blank ones. */
const filled = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v));

export function businessBody(f: BusinessForm, documents: Record<string, string>) {
  return {
    type: f.type,
    name: f.name.trim(),
    ...filled({ ...ids(f), email: f.email.trim(), phone: f.phone.trim() }),
    addressLine1: f.addressLine1.trim(),
    city: f.city.trim(),
    state: f.state.trim(),
    pincode: f.pincode.trim(),
    kycDocuments: kycDocuments(f, documents),
  };
}

/** A resubmission: every document, and only the identifiers that changed (they wait for review). */
export function kycBody(f: BusinessForm, tenant: BusinessIds, documents: Record<string, string>) {
  const changed = Object.entries(ids(f)).filter(
    ([k, v]) => v && v !== (tenant[k as keyof BusinessIds] ?? ''),
  );
  return { ...Object.fromEntries(changed), documents: kycDocuments(f, documents) };
}

/** URLs of documents sent earlier, by kind, that a resubmission may keep (seeded ones are not web links). */
export const sentDocuments = (docs: { kind?: string; url?: string }[] | null | undefined) =>
  Object.fromEntries(
    (docs ?? [])
      .filter((d) => d.kind && d.url && /^https?:\/\//.test(d.url))
      .map((d) => [d.kind!, d.url!]),
  );

/** The service takes a resubmission from a rejected business or one asked for changes. */
export const canResubmit = (t: { status: string; rejectionReason?: string | null }) =>
  t.status === 'REJECTED' || (t.status === 'PENDING_APPROVAL' && !!t.rejectionReason);

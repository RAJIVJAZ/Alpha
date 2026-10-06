import { round2 } from '@foodgrid/utils';

/** Amounts as billed on the supplier's B2B order. */
export interface SupplierBilledAmounts {
  subtotal: number;
  discount: number;
  taxTotal: number;
  deliveryCharge: number;
  total: number;
  paymentTerms?: string;
}

/**
 * The supplier's order is the invoice of record (dealer discount, GST on
 * freight), so the buyer's PO adopts its amounts and both sides agree on
 * what is owed. The PO has no discount column: its subtotal is stored net
 * of any dealer discount, keeping subtotal + tax + delivery = total.
 */
export function poAmountsFromSupplier(b: SupplierBilledAmounts) {
  return {
    subtotal: round2(b.subtotal - b.discount),
    taxTotal: round2(b.taxTotal),
    deliveryCharge: round2(b.deliveryCharge),
    total: round2(b.total),
    ...(b.paymentTerms ? { paymentTerms: b.paymentTerms } : {}),
  };
}

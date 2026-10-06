import { poAmountsFromSupplier } from './billing';

describe('poAmountsFromSupplier', () => {
  it('nets the dealer discount into the subtotal so the PO still adds up', () => {
    // 2 x 2100 sugar bags, 2% dealer discount, ₹250 freight taxed at 18%
    const billed = { subtotal: 4200, discount: 84, taxTotal: 250.8, deliveryCharge: 250, total: 4616.8, paymentTerms: 'NET_15' };
    const po = poAmountsFromSupplier(billed);
    expect(po).toEqual({ subtotal: 4116, taxTotal: 250.8, deliveryCharge: 250, total: 4616.8, paymentTerms: 'NET_15' });
    expect(po.subtotal + po.taxTotal + po.deliveryCharge).toBeCloseTo(po.total, 2);
  });

  it('keeps the existing payment terms when the supplier does not send any', () => {
    expect(poAmountsFromSupplier({ subtotal: 100, discount: 0, taxTotal: 5, deliveryCharge: 0, total: 105 })).not.toHaveProperty('paymentTerms');
  });
});

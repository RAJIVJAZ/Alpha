import { computeGst, extractGst, isInterState, isValidGstin, sumGst } from './gst';

describe('GST', () => {
  it('splits intra-state tax into CGST + SGST', () => {
    const g = computeGst(1000, 5, false);
    expect(g).toMatchObject({ cgst: 25, sgst: 25, igst: 0, totalTax: 50, total: 1050 });
  });
  it('charges IGST on inter-state supply', () => {
    const g = computeGst(1000, 18, true);
    expect(g).toMatchObject({ cgst: 0, sgst: 0, igst: 180, total: 1180 });
  });
  it('keeps odd paise consistent when splitting', () => {
    const g = computeGst(10.1, 5, false); // 0.505 -> 0.51 total tax
    expect(g.cgst + g.sgst).toBeCloseTo(g.totalTax, 5);
  });
  it('extracts tax from inclusive prices exactly', () => {
    const g = extractGst(105, 5, false);
    expect(g.taxableValue).toBe(100);
    expect(g.total).toBe(105);
    const odd = extractGst(99, 18, true);
    expect(odd.taxableValue + odd.totalTax).toBeCloseTo(99, 5);
  });
  it('detects inter-state supply from state codes', () => {
    expect(isInterState('29', '29')).toBe(false);
    expect(isInterState('29', '27')).toBe(true);
    expect(isInterState(undefined, '27')).toBe(false);
  });
  it('validates GSTIN check digits', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false);
    expect(isValidGstin('not-a-gstin')).toBe(false);
  });
  it('sums line breakdowns', () => {
    const total = sumGst([computeGst(100, 5, false), computeGst(200, 18, false)]);
    expect(total.totalTax).toBe(41);
    expect(total.total).toBe(341);
  });
});

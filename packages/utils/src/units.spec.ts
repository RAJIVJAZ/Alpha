import { canConvert, convertUnit, UnitConversionError } from './units';

describe('units', () => {
  it('converts within a family', () => {
    expect(convertUnit(250, 'G', 'KG')).toBe(0.25);
    expect(convertUnit(1.5, 'L', 'ML')).toBe(1500);
    expect(convertUnit(2, 'DOZEN', 'PCS')).toBe(24);
  });
  it('refuses cross-family conversion', () => {
    expect(canConvert('KG', 'L')).toBe(false);
    expect(() => convertUnit(1, 'KG', 'L')).toThrow(UnitConversionError);
  });
});

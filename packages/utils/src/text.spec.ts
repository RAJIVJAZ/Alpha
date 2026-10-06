import { enumLabel } from './text';

describe('enumLabel', () => {
  it('turns enum values into sentence-case labels and keeps acronyms', () => {
    expect(enumLabel('FOOD_CART')).toBe('Food cart');
    expect(enumLabel('EV_SCOOTER')).toBe('EV scooter');
    expect(enumLabel('CATEGORY_TOP')).toBe('Category top');
    expect(enumLabel(null)).toBe('');
  });
});

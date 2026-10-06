import { unitPrice, validateOptions } from './cart.service';

const item: any = {
  name: 'Pizza',
  price: 299,
  variants: [
    { id: 'v-reg', priceDelta: 0, isDefault: true, isAvailable: true },
    { id: 'v-lg', priceDelta: 150, isDefault: false, isAvailable: true },
  ],
  addonGroups: [
    {
      name: 'Crust',
      minSelect: 1,
      maxSelect: 1,
      addons: [
        { id: 'thin', price: 0, isAvailable: true },
        { id: 'cheese-burst', price: 99, isAvailable: true },
      ],
    },
    { name: 'Toppings', minSelect: 0, maxSelect: 2, addons: [{ id: 'olives', price: 40, isAvailable: true }, { id: 'jalapeno', price: 40, isAvailable: true }, { id: 'corn', price: 30, isAvailable: false }] },
  ],
};

describe('cart option validation', () => {
  it('prices variant + add-ons', () => {
    expect(unitPrice(item, item.variants[1], [item.addonGroups[0].addons[1], item.addonGroups[1].addons[0]])).toBe(588);
  });
  it('enforces group min/max', () => {
    expect(() => validateOptions(item, undefined, [])).toThrow(/Crust/);
    expect(() => validateOptions(item, undefined, ['thin', 'cheese-burst'])).toThrow(/Crust/);
    expect(() => validateOptions(item, undefined, ['thin', 'olives', 'jalapeno'])).not.toThrow();
  });
  it('rejects unknown, unavailable and duplicate add-ons', () => {
    expect(() => validateOptions(item, undefined, ['thin', 'corn'])).toThrow();
    expect(() => validateOptions(item, undefined, ['thin', 'thin'])).toThrow();
    expect(() => validateOptions(item, 'nope', ['thin'])).toThrow();
  });
});

const ACRONYMS = new Set(['ev', 'upi', 'cod', 'qr', 'pos', 'gst', 'kds', 'moq', 'sku', 'po', 'b2b', 'ai']);

/** Readable label for an enum value: "FOOD_CART" → "Food cart", "EV_SCOOTER" → "EV scooter". */
export function enumLabel(value: string | null | undefined): string {
  if (!value) return '';
  const words = value.replace(/[_-]+/g, ' ').trim().toLowerCase().split(/\s+/);
  return words.map((w, i) => (ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

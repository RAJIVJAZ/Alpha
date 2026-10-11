-- Marketplace categories are reference data: every product needs one, so every
-- environment (not only the demo seed) starts with the standard set. Admins
-- manage them afterwards (admin/marketplace/categories). Codes match the seed.
INSERT INTO "marketplace"."ProductCategory" ("id", "code", "name", "slug", "sortOrder", "isActive")
VALUES
  ('mcat_dairy', 'DAIRY', 'Dairy', 'dairy', 0, true),
  ('mcat_flour', 'FLOUR', 'Flour & Atta', 'flour-and-atta', 1, true),
  ('mcat_sugar', 'SUGAR', 'Sugar & Sweeteners', 'sugar-and-sweeteners', 2, true),
  ('mcat_rice', 'RICE', 'Rice & Grains', 'rice-and-grains', 3, true),
  ('mcat_pulses', 'PULSES', 'Pulses & Dals', 'pulses-and-dals', 4, true),
  ('mcat_oil', 'OIL', 'Edible Oils', 'edible-oils', 5, true),
  ('mcat_vegetables', 'VEGETABLES', 'Vegetables', 'vegetables', 6, true),
  ('mcat_fruits', 'FRUITS', 'Fruits', 'fruits', 7, true),
  ('mcat_packaging', 'PACKAGING', 'Packaging', 'packaging', 8, true),
  ('mcat_spices', 'SPICES', 'Spices & Masalas', 'spices-and-masalas', 9, true),
  ('mcat_beverages', 'BEVERAGES', 'Beverages', 'beverages', 10, true),
  ('mcat_frozen', 'FROZEN', 'Frozen Products', 'frozen-products', 11, true)
-- idempotent: categories that already exist (seeded or added by an admin) are left alone
ON CONFLICT DO NOTHING;

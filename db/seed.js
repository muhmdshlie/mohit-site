// Fills an empty database with the demo content from the original showroom.html.
// Safe to run more than once: each table is only filled when it is empty.
// Sample products and reviews are marked is_sample = 1 so they can be removed
// in one click from the admin panel (Products -> "Delete all samples").
const db = require('./index');
const { uniqueProductSlug } = require('../lib/util');

const BRANDS = ['Jaquar', 'Essco', 'Ess Ess', 'Bath Sense', 'Parryware', 'Johnson Pedder',
  'Viking', 'Kohinoor', 'Bathwin', 'Jayanti', 'Vaishno'];

const CATEGORIES = ['Faucets', 'Showers', 'Basins', 'WCs', 'Accessories', 'Heaters', 'Kitchen'];

// [name, brand, model code, category, MRP, NRP]
const PRODUCTS = [
  ['Single Lever Basin Mixer', 'Jaquar', 'ALI-CHR-85011B', 'Faucets', 4500, 3150],
  ['Round Rain Shower 200mm', 'Jaquar', 'SHS-CHR-1617', 'Showers', 8200, 6150],
  ['Wall-hung WC', 'Jaquar', 'ALS-WHT-85951', 'WCs', 21000, 16800],
  ['Towel Rail 600mm', 'Jaquar', 'ACN-CHR-1115', 'Accessories', 2400, 1800],
  ['Counter Top Basin', 'Parryware', 'C0451', 'Basins', 6200, 4650],
  ['Pillar Cock', 'Essco', 'ESS-PC-101', 'Faucets', 1800, 1260],
  ['Overhead Shower Set', 'Bath Sense', 'BS-OS-22', 'Showers', 5400, 3780],
  ['Wall Mixer with Diverter', 'Jaquar', 'FLR-CHR-5473', 'Faucets', 7600, 5700],
  ['Health Faucet with Hose', 'Jaquar', 'HFK-CHR-1163', 'Accessories', 1900, 1330],
  ['Hand Shower 3-Flow', 'Jaquar', 'HSH-CHR-1739', 'Showers', 2800, 2100],
  ['Single Piece Closet', 'Parryware', 'C8068', 'WCs', 14500, 10900],
  ['Wall Hung Basin', 'Jaquar', 'ALS-WHT-85101', 'Basins', 5200, 3900],
  ['Instant Water Heater 3L', 'Jaquar', 'WHT-INS-03', 'Heaters', 7800, 5850],
  ['Storage Water Heater 15L', 'Viking', 'VK-SWH-15', 'Heaters', 9200, 6440],
  ['Kitchen Sink Mixer', 'Jaquar', 'KTM-CHR-4107', 'Kitchen', 6800, 4760],
  ['Stainless Steel Sink', 'Kohinoor', 'KH-SS-3218', 'Kitchen', 8400, 5880],
  ['Soap Dispenser', 'Essco', 'ES-SD-12', 'Accessories', 1500, 1050],
  ['Bathroom Shelf Glass', 'Bathwin', 'BW-SH-60', 'Accessories', 1700, 1190],
  ['Pedestal Basin', 'Johnson Pedder', 'JP-PB-501', 'Basins', 4800, 3360],
  ['Two-Piece Closet', 'Ess Ess', 'EE-TP-210', 'WCs', 9800, 6860],
  ['Angle Cock', 'Jayanti', 'JY-AC-15', 'Faucets', 650, 455],
  ['Overhead Shower 12 inch', 'Vaishno', 'VS-OH-12', 'Showers', 3900, 2730],
  ['Bib Cock Long Body', 'Bath Sense', 'BS-BC-LB', 'Faucets', 1100, 770]
];

const REVIEWS = [
  ['Sample customer', 'Indiranagar', 'Clear prices and quick help on WhatsApp. Picked everything for my bathroom in one visit.'],
  ['Sample customer', 'Whitefield', 'Good range of Jaquar and other brands. Delivery was on time.'],
  ['Sample builder', 'Bangalore', 'Got a fair bulk quote for our apartment project.']
];

const FAQS = [
  ['Are the products genuine?', 'Yes. We are an authorised dealer and every product comes with the brand warranty.'],
  ['Can I buy online?', 'Right now you enquire on WhatsApp or call, then pay at the showroom or on delivery. Online payment can be added later.'],
  ['Do you deliver across Bangalore?', 'Yes. Share your area on WhatsApp and we will confirm delivery time and charges.'],
  ['Do you give bulk or project pricing?', "Yes. Use the builders' form above and we will send a quote."],
  ['Is the price on the website final?', 'Prices are our current selling price and can change. Confirm on WhatsApp before you buy.']
];

const isEmpty = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n === 0;

// Remembers that demo data was added once, so it does not come back after
// "Delete all sample data" and a restart. getSettings() ignores this key.
const SEEDED_KEY = '_demo_seeded';

const seed = db.transaction(({ force = false } = {}) => {
  const done = [];
  if (!force && db.prepare('SELECT 1 FROM settings WHERE key = ?').get(SEEDED_KEY)) return done;
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(SEEDED_KEY, JSON.stringify(new Date().toISOString()));

  if (isEmpty('brands')) {
    const ins = db.prepare('INSERT INTO brands (name, sort_order) VALUES (?, ?)');
    BRANDS.forEach((b, i) => ins.run(b, i + 1));
    done.push(`${BRANDS.length} brands`);
  }

  if (isEmpty('categories')) {
    const ins = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)');
    CATEGORIES.forEach((c, i) => ins.run(c, i + 1));
    done.push(`${CATEGORIES.length} categories`);
  }

  if (isEmpty('products')) {
    const brandId = db.prepare('SELECT id FROM brands WHERE name = ?');
    const catId = db.prepare('SELECT id FROM categories WHERE name = ?');
    const ins = db.prepare(`INSERT INTO products
      (name, slug, brand_id, category_id, model_code, mrp, nrp, description, specs, in_stock, featured, is_sample)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1)`);
    PRODUCTS.forEach(([name, brand, code, cat, mrp, nrp]) => {
      const b = brandId.get(brand), c = catId.get(cat);
      if (!b || !c) return;
      ins.run(name, uniqueProductSlug(name, code), b.id, c.id, code, mrp, nrp,
        `SAMPLE PRODUCT – ${name} from ${brand}. Replace this with your real product details.`,
        `Brand: ${brand}\nModel: ${code}\nCategory: ${cat}`);
    });
    done.push(`${PRODUCTS.length} sample products`);
  }

  if (isEmpty('reviews')) {
    const ins = db.prepare('INSERT INTO reviews (name, place, text, stars, visible, is_sample, sort_order) VALUES (?, ?, ?, 5, 1, 1, ?)');
    REVIEWS.forEach(([n, p, t], i) => ins.run(n, p, t, i + 1));
    done.push(`${REVIEWS.length} sample reviews`);
  }

  if (isEmpty('faqs')) {
    const ins = db.prepare('INSERT INTO faqs (question, answer, sort_order) VALUES (?, ?, ?)');
    FAQS.forEach(([q, a], i) => ins.run(q, a, i + 1));
    done.push(`${FAQS.length} FAQs`);
  }

  return done;
});

module.exports = seed;

if (require.main === module) {
  const done = seed({ force: true });
  console.log(done.length ? `Added demo data: ${done.join(', ')}.` : 'Database already has data. Nothing added.');
}

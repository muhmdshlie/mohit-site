// All editable site settings live here: one list drives the database defaults,
// the admin "Settings" form and validation. To add a new setting, add one line.
const db = require('../db');

// type: text | textarea | url | phone | whatsapp | email | color | image | images | pairs
const FIELDS = [
  // Shop details
  { key: 'shop_name', group: 'Shop details', label: 'Shop name', type: 'text', max: 80, default: 'Mohit Marketing' },
  { key: 'logo', group: 'Shop details', label: 'Logo (optional, replaces the shop name in the header)', type: 'image', default: '' },
  { key: 'tagline', group: 'Shop details', label: 'Tagline', type: 'text', max: 120, default: 'Authorised Jaquar dealer, Bangalore' },
  { key: 'phone', group: 'Shop details', label: 'Mobile (as shown on the site)', type: 'phone', max: 30, default: '+91 93417 37000' },
  { key: 'phone2', group: 'Shop details', label: 'Landline (optional)', type: 'phone', max: 30, default: '080-4173 7000' },
  { key: 'whatsapp', group: 'Shop details', label: 'WhatsApp number with country code, digits only (e.g. 919876543210)', type: 'whatsapp', default: '919341737000' },
  { key: 'email', group: 'Shop details', label: 'Email (optional)', type: 'email', default: 'info@mohitmarketing.com' },
  { key: 'address', group: 'Shop details', label: 'Address', type: 'textarea', max: 300, default: '60/1, Oil Mill Road, K K Halli,\nBangalore – 560084' },
  { key: 'maps_link', group: 'Shop details', label: 'Google Maps link', type: 'url', default: 'https://www.google.com/maps/search/?api=1&query=60%2F1+Oil+Mill+Road+K+K+Halli+Bangalore+560084' },
  { key: 'hours', group: 'Shop details', label: 'Opening hours', type: 'text', max: 80, default: 'Open 10 AM – 8 PM' },
  { key: 'instagram', group: 'Social links', label: 'Instagram link', type: 'url', default: '' },
  { key: 'facebook', group: 'Social links', label: 'Facebook link', type: 'url', default: '' },
  { key: 'youtube', group: 'Social links', label: 'YouTube link', type: 'url', default: '' },

  // SEO
  { key: 'meta_title', group: 'Search engines (SEO)', label: 'Home page title', type: 'text', max: 70, default: 'Mohit Marketing – Jaquar Dealer, Bangalore' },
  { key: 'meta_description', group: 'Search engines (SEO)', label: 'Home page description', type: 'textarea', max: 170, default: 'Authorised Jaquar dealer in Bangalore. Faucets, showers, sanitaryware, heaters and kitchen fittings from 11 brands. See MRP, our price and your saving.' },

  // Hero
  { key: 'hero_title', group: 'Hero (top banner)', label: 'Title', type: 'text', max: 120, default: 'Premium bathroom fittings at the best prices' },
  { key: 'hero_text', group: 'Hero (top banner)', label: 'Text', type: 'textarea', max: 300, default: 'Authorised Jaquar dealer in Bangalore. See the MRP, our price and your saving before you visit.' },
  { key: 'hero_btn1', group: 'Hero (top banner)', label: 'First button text', type: 'text', max: 30, default: 'Explore Products' },
  { key: 'hero_btn2', group: 'Hero (top banner)', label: 'Second button text', type: 'text', max: 30, default: 'Contact Us' },
  { key: 'stats', group: 'Hero (top banner)', label: 'Stats strip (big text + small text)', type: 'pairs', max: 6, a: 'Big text', b: 'Small text',
    default: [
      { title: '11', text: 'Top brands' },
      { title: 'Genuine', text: 'Brand warranty' },
      { title: 'Bangalore', text: 'Home delivery' },
      { title: '10 AM – 8 PM', text: 'Showroom open daily' }
    ] },

  // Section texts
  { key: 'categories_title', group: 'Section headings', label: 'Categories – heading', type: 'text', max: 80, default: 'Shop by category' },
  { key: 'categories_sub', group: 'Section headings', label: 'Categories – subheading', type: 'text', max: 200, default: 'Everything for a bathroom and kitchen, from one showroom.' },
  { key: 'shop_title', group: 'Section headings', label: 'Shop – heading', type: 'text', max: 80, default: 'Shop' },
  { key: 'shop_sub', group: 'Section headings', label: 'Shop – subheading', type: 'text', max: 200, default: 'Search by name or model code, then filter by brand and category.' },
  { key: 'price_note', group: 'Section headings', label: 'Note under the product list', type: 'text', max: 300, default: 'Prices shown are samples for illustration. Real MRP and NRP will come from your price list.' },
  { key: 'offers_title', group: 'Section headings', label: 'Offers – heading', type: 'text', max: 80, default: 'Offers & deals' },
  { key: 'offers_sub', group: 'Section headings', label: 'Offers – subheading', type: 'text', max: 200, default: 'Biggest savings first.' },
  { key: 'brands_title', group: 'Section headings', label: 'Brands – heading', type: 'text', max: 80, default: 'Our brands' },
  { key: 'brands_sub', group: 'Section headings', label: 'Brands – subheading', type: 'text', max: 200, default: 'Jaquar first, plus ten more names under one roof.' },
  { key: 'why_title', group: 'Section headings', label: 'Why choose us – heading', type: 'text', max: 80, default: 'Why choose us' },
  { key: 'why_sub', group: 'Section headings', label: 'Why choose us – subheading', type: 'text', max: 200, default: '' },
  { key: 'steps_title', group: 'Section headings', label: 'How to buy – heading', type: 'text', max: 80, default: 'How to buy' },
  { key: 'steps_sub', group: 'Section headings', label: 'How to buy – subheading', type: 'text', max: 200, default: 'Four simple steps.' },
  { key: 'reviews_title', group: 'Section headings', label: 'Reviews – heading', type: 'text', max: 80, default: 'What customers say' },
  { key: 'reviews_sub', group: 'Section headings', label: 'Reviews – subheading', type: 'text', max: 200, default: 'Sample reviews. Real Google reviews will replace these.' },
  { key: 'faq_title', group: 'Section headings', label: 'FAQ – heading', type: 'text', max: 80, default: 'Questions' },
  { key: 'faq_sub', group: 'Section headings', label: 'FAQ – subheading', type: 'text', max: 200, default: 'Quick answers.' },
  { key: 'builders_title', group: 'Section headings', label: 'Builders – heading', type: 'text', max: 80, default: 'For builders & projects' },
  { key: 'builders_text', group: 'Section headings', label: 'Builders – text', type: 'textarea', max: 500, default: 'Planning a flat, villa or hotel project? Share your requirement and get bulk pricing and delivery planning.' },
  { key: 'contact_title', group: 'Section headings', label: 'Contact – heading', type: 'text', max: 80, default: 'Contact us' },
  { key: 'enquiry_title', group: 'Section headings', label: 'Enquiry form – heading', type: 'text', max: 80, default: 'Send an enquiry' },
  { key: 'footer_text', group: 'Section headings', label: 'Footer text', type: 'text', max: 200, default: '© Mohit Marketing · Authorised Jaquar dealer, Bangalore' },

  // Why / steps
  { key: 'why', group: 'Why choose us', label: 'Points (title + text)', type: 'pairs', max: 8, a: 'Title', b: 'Text',
    default: [
      { title: 'Genuine products', text: 'Authorised dealer stock with brand warranty.' },
      { title: 'Best prices', text: 'MRP and our price shown side by side.' },
      { title: 'Expert advice', text: 'Showroom staff help you pick the right fit.' },
      { title: 'Delivery in Bangalore', text: 'Safe delivery to your home or site.' }
    ] },
  { key: 'steps', group: 'How to buy', label: 'Steps (title + text)', type: 'pairs', max: 8, a: 'Title', b: 'Text',
    default: [
      { title: '1. Browse', text: 'Search the catalogue by brand, category or model code.' },
      { title: '2. Compare', text: 'See the MRP, our price and your saving.' },
      { title: '3. Enquire', text: 'Tap WhatsApp or call. Add several items to one list.' },
      { title: '4. Buy', text: 'Visit the showroom or get it delivered.' }
    ] },

  // About
  { key: 'about_title', group: 'About', label: 'Heading', type: 'text', max: 80, default: 'About Mohit Marketing' },
  { key: 'about_text', group: 'About', label: 'Text (leave an empty line between paragraphs)', type: 'textarea', max: 3000,
    default: 'We are an authorised Jaquar dealer in Bangalore, supplying faucets, showers, sanitaryware, heaters and kitchen fittings for homes, apartments and projects.\n\nOur team helps you choose the right products for your budget and your space, and you can see the real MRP and our price before you step in.' },
  { key: 'showroom_photos', group: 'About', label: 'Showroom photos', type: 'images', max: 12, default: [] },

  // Colours (light mode; dark mode keeps its own darker palette)
  { key: 'color_ocean', group: 'Colours', label: 'Main colour (headings, buttons)', type: 'color', default: '#0A5C8C' },
  { key: 'color_deep', group: 'Colours', label: 'Dark colour (top bar, footer)', type: 'color', default: '#06385A' },
  { key: 'color_aqua', group: 'Colours', label: 'Accent colour', type: 'color', default: '#18B6D6' },
  { key: 'color_red', group: 'Colours', label: 'Discount badge colour', type: 'color', default: '#D62F3A' },
  { key: 'color_wa', group: 'Colours', label: 'WhatsApp button colour', type: 'color', default: '#1FA855' }
];

const BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f]));

function getSettings() {
  const out = {};
  for (const f of FIELDS) out[f.key] = structuredClone(f.default);
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    if (!BY_KEY[row.key]) continue;
    try { out[row.key] = JSON.parse(row.value); } catch { /* keep default */ }
  }
  return out;
}

const upsert = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

// values must already be validated (see lib/validate.js -> settingsSchema)
const saveSettings = db.transaction(values => {
  for (const [key, value] of Object.entries(values)) {
    if (BY_KEY[key]) upsert.run(key, JSON.stringify(value));
  }
});

module.exports = { FIELDS, BY_KEY, getSettings, saveSettings };

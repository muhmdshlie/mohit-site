// Input validation. Every request body is checked here before it touches the database.
const { z } = require('zod');
const { FIELDS } = require('./settings');

// Remove invisible control characters (keeps normal new lines and tabs).
const stripCtrl = s => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

const text = (max, min = 0) => z.string().overwrite(stripCtrl).trim()
  .min(min, min ? 'This field is required' : undefined)
  .max(max, `Must be ${max} characters or less`);

// Booleans arrive as true/false from the admin panel and as yes/no/1/0 from CSV files.
const bool = z.preprocess(v => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', ''].includes(s)) return false;
  return v;
}, z.boolean());

const price = z.preprocess(v => {
  if (typeof v === 'string') v = v.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  return v === '' || v == null ? undefined : Number(v);
}, z.number({ error: 'Must be a number' }).min(0, 'Cannot be negative').max(10_000_000, 'Too large'))
  .transform(n => Math.round(n * 100) / 100);

const httpUrl = z.string().trim().max(500).refine(s => {
  if (s === '') return true;
  try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; }
}, 'Must be a full link starting with https://');

// An uploaded image (/uploads/abc.webp), an https image link, or empty.
const imagePath = z.string().trim().max(500).refine(
  s => s === '' || /^\/uploads\/[a-z0-9-]+\.(webp|jpe?g|png)$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s),
  'Invalid image'
);

const order = z.coerce.number().int().min(0).max(100000).default(0);
const id = z.coerce.number().int().positive();

const product = z.object({
  name: text(150, 1),
  brand_id: id,
  category_id: id,
  model_code: text(60).default(''),
  mrp: price,
  nrp: price,
  description: text(5000).default(''),
  specs: text(5000).default(''),
  photo: imagePath.default(''),
  in_stock: bool.default(true),
  featured: bool.default(false)
}).refine(p => p.nrp <= p.mrp, { message: 'NRP (our price) cannot be more than MRP', path: ['nrp'] });

const brand = z.object({ name: text(60, 1), photo: imagePath.default(''), sort_order: order });
const category = brand;

const offer = z.object({
  title: text(120, 1), text: text(500).default(''), image: imagePath.default(''),
  active: bool.default(true), sort_order: order
});

const review = z.object({
  name: text(80, 1), place: text(80).default(''), text: text(1000, 1),
  stars: z.coerce.number().int().min(1).max(5), visible: bool.default(true), sort_order: order
});

const faq = z.object({ question: text(300, 1), answer: text(2000, 1), sort_order: order });

const phone = z.string().overwrite(stripCtrl).trim()
  .regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a valid phone number');

const enquiry = z.object({
  type: z.enum(['enquiry', 'quote']).default('enquiry'),
  name: text(80, 1),
  phone,
  message: text(2000).default(''),
  website: z.string().max(200).optional() // honeypot: real people never fill this hidden field
});

const enquiryStatus = z.object({ status: z.enum(['new', 'done']) });

const login = z.object({ username: text(60, 1), password: z.string().min(1).max(200) });

const changePassword = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(10, 'New password must be at least 10 characters').max(200)
});

// Settings schema is built from the field list in lib/settings.js.
function settingRule(f) {
  switch (f.type) {
    case 'text': case 'textarea': return text(f.max || 500);
    case 'url': return httpUrl;
    case 'phone': return z.string().trim().regex(/^[0-9+()\-\s]{0,30}$/, 'Only digits, spaces, + ( ) -');
    case 'whatsapp': return z.string().transform(s => s.replace(/[\s+\-()]/g, '')).pipe(z.string().regex(/^\d{10,15}$/, 'Digits only with country code, e.g. 919876543210'));
    case 'email': return z.union([z.literal(''), z.email('Invalid email')]);
    case 'color': return z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour');
    case 'image': return imagePath;
    case 'images': return z.array(imagePath.refine(s => s !== '')).max(f.max || 12);
    case 'pairs': return z.array(z.object({ title: text(80), text: text(300) })).max(f.max || 8)
      .transform(rows => rows.filter(r => r.title || r.text));
    default: throw new Error('Unknown setting type ' + f.type);
  }
}
const settings = z.object(Object.fromEntries(FIELDS.map(f => [f.key, settingRule(f).optional()]))).strict();

// Express helper: parse or answer 400 with readable messages.
function parse(schema, data, res) {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const errors = r.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
  res.status(400).json({ error: errors.map(e => (e.field ? `${e.field}: ` : '') + e.message).join('; '), errors });
  return null;
}

module.exports = {
  schemas: { product, brand, category, offer, review, faq, enquiry, enquiryStatus, login, changePassword, settings },
  parse, text, bool, price, imagePath, id
};

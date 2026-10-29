// Admin panel: login page, the admin app and its JSON API.
// Everything except the login page, login API and CSRF token needs a logged-in admin.
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const auth = require('../lib/auth');
const { schemas, parse, text } = require('../lib/validate');
const { FIELDS, getSettings, saveSettings } = require('../lib/settings');
const { listProducts, getProduct } = require('../lib/products');
const { uniqueProductSlug } = require('../lib/util');
const { imageUpload, sheetUpload, saveImage, removeImage, UploadError } = require('../lib/upload');
const sheet = require('../lib/sheet');

const router = express.Router();
const ADMIN_DIR = path.join(__dirname, '..', 'admin');

// Never cache admin pages or data.
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ---------- public part: login ----------

router.use('/assets', express.static(path.join(ADMIN_DIR, 'assets'), { index: false }));

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.sendFile(path.join(ADMIN_DIR, 'login.html'));
});

router.get('/api/csrf', (req, res) => res.json({ csrf: auth.csrfToken(req) }));

// 5 wrong passwords per 15 minutes per IP address. Successful logins do not count.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 5, skipSuccessfulRequests: true,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many failed logins. Please wait 15 minutes and try again.' }
});

router.post('/api/login', auth.verifyCsrf, loginLimiter, async (req, res, next) => {
  try {
    const body = parse(schemas.login, req.body, res);
    if (!body) return;
    const admin = await auth.checkLogin(body.username, body.password);
    if (!admin) return res.status(401).json({ error: 'Wrong username or password.' });
    // New session id after login (prevents session fixation).
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.adminId = admin.id;
      const csrf = auth.csrfToken(req);
      req.session.save(err2 => (err2 ? next(err2) : res.json({ ok: true, csrf })));
    });
  } catch (e) { next(e); }
});

router.post('/api/logout', auth.verifyCsrf, (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('mm.sid');
    res.json({ ok: true });
  });
});

// ---------- protected pages ----------

router.get('/', auth.requireAdminPage, (req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));
router.get('/app.js', auth.requireAdminPage, (req, res) => res.sendFile(path.join(ADMIN_DIR, 'app.js')));

// ---------- protected API ----------

const api = express.Router();
api.use(auth.requireAdminApi, auth.verifyCsrf);
router.use('/api', api);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const idParam = z.coerce.number().int().positive();
const getId = (req, res) => {
  const r = idParam.safeParse(req.params.id);
  if (!r.success) { res.status(400).json({ error: 'Invalid id' }); return null; }
  return r.data;
};
const listQuery = z.object({
  q: text(100).default(''),
  page: z.coerce.number().int().min(1).max(100000).catch(1)
}).passthrough();

// Turns SQLite constraint errors into friendly messages.
function dbError(e, res, what) {
  const code = String(e.code || '');
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: `${what} already exists.` });
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY constraint failed/.test(e.message)) return res.status(409).json({ error: `${what} is still used by products. Move or delete those products first.` });
  throw e;
}

api.get('/me', (req, res) => res.json({ username: req.admin.username, role: req.admin.role, csrf: auth.csrfToken(req) }));

api.post('/password', wrap(async (req, res) => {
  const body = parse(schemas.changePassword, req.body, res);
  if (!body) return;
  if (!(await auth.changePassword(req.admin.id, body.current, body.next))) {
    return res.status(400).json({ error: 'Current password is wrong.' });
  }
  db.prepare('DELETE FROM sessions WHERE sid != ?').run(req.sessionID); // log out other devices
  res.json({ ok: true });
}));

api.get('/dashboard', (req, res) => {
  const n = sql => db.prepare(sql).get().n;
  res.json({
    products: n('SELECT COUNT(*) AS n FROM products'),
    sampleProducts: n('SELECT COUNT(*) AS n FROM products WHERE is_sample = 1'),
    sampleReviews: n('SELECT COUNT(*) AS n FROM reviews WHERE is_sample = 1'),
    outOfStock: n('SELECT COUNT(*) AS n FROM products WHERE in_stock = 0'),
    enquiries: n('SELECT COUNT(*) AS n FROM enquiries'),
    newEnquiries: n("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'"),
    brands: n('SELECT COUNT(*) AS n FROM brands'),
    categories: n('SELECT COUNT(*) AS n FROM categories'),
    recent: db.prepare('SELECT id, type, name, phone, message, status, created_at FROM enquiries ORDER BY id DESC LIMIT 5').all()
  });
});

api.post('/samples/delete', (req, res) => {
  const photos = db.prepare('SELECT photo FROM products WHERE is_sample = 1').all();
  const r = db.transaction(() => ({
    products: db.prepare('DELETE FROM products WHERE is_sample = 1').run().changes,
    reviews: db.prepare('DELETE FROM reviews WHERE is_sample = 1').run().changes
  }))();
  photos.forEach(p => removeImage(p.photo));
  res.json(r);
});

// Image upload: returns the saved path, which the form then stores.
api.post('/upload', imageUpload, wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image first.' });
  try {
    const maxSize = req.query.kind === 'logo' ? 600 : 1200;
    res.json({ path: await saveImage(req.file.buffer, { maxSize }) });
  } catch (e) {
    if (e instanceof UploadError) return res.status(400).json({ error: e.message });
    throw e;
  }
}));

// ---------- simple tables (brands, categories, offers, reviews, faqs) ----------
// Table and column names come from this fixed list, never from the request.

const SIMPLE = {
  brands: { schema: schemas.brand, cols: ['name', 'photo', 'sort_order'], search: ['name'], image: 'photo', label: 'Brand',
    extra: ', (SELECT COUNT(*) FROM products WHERE brand_id = t.id) AS product_count' },
  categories: { schema: schemas.category, cols: ['name', 'photo', 'sort_order'], search: ['name'], image: 'photo', label: 'Category',
    extra: ', (SELECT COUNT(*) FROM products WHERE category_id = t.id) AS product_count' },
  offers: { schema: schemas.offer, cols: ['title', 'text', 'image', 'active', 'sort_order'], search: ['title', 'text'], image: 'image', label: 'Offer' },
  reviews: { schema: schemas.review, cols: ['name', 'place', 'text', 'stars', 'visible', 'sort_order'], search: ['name', 'place', 'text'], label: 'Review', sample: true },
  faqs: { schema: schemas.faq, cols: ['question', 'answer', 'sort_order'], search: ['question', 'answer'], label: 'FAQ' }
};

const toDb = v => (typeof v === 'boolean' ? (v ? 1 : 0) : v === '' ? null : v);
const likeEscape = s => s.replace(/[\\%_]/g, m => '\\' + m);

for (const [table, cfg] of Object.entries(SIMPLE)) {
  // empty text columns are NOT NULL in the schema; only image columns may be NULL
  const val = (col, v) => (col === cfg.image ? toDb(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v);

  api.get(`/${table}`, (req, res) => {
    const f = parse(listQuery, req.query, res);
    if (!f) return;
    const words = f.q.split(/\s+/).filter(Boolean).slice(0, 8);
    const where = words.map(() => '(' + cfg.search.map(c => `t.${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
    const params = words.flatMap(w => cfg.search.map(() => `%${likeEscape(w)}%`));
    const rows = db.prepare(`SELECT t.*${cfg.extra || ''} FROM ${table} t${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY t.sort_order, t.id`).all(...params);
    res.json({ items: rows });
  });

  api.post(`/${table}`, (req, res) => {
    const d = parse(cfg.schema, req.body, res);
    if (!d) return;
    try {
      const r = db.prepare(`INSERT INTO ${table} (${cfg.cols.join(', ')}) VALUES (${cfg.cols.map(() => '?').join(', ')})`)
        .run(...cfg.cols.map(c => val(c, d[c])));
      res.status(201).json({ id: r.lastInsertRowid });
    } catch (e) { dbError(e, res, cfg.label); }
  });

  api.put(`/${table}/:id`, (req, res) => {
    const id = getId(req, res);
    if (!id) return;
    const d = parse(cfg.schema, req.body, res);
    if (!d) return;
    const old = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!old) return res.status(404).json({ error: `${cfg.label} not found` });
    try {
      const sets = cfg.cols.map(c => `${c} = ?`).concat(cfg.sample ? ['is_sample = 0'] : []);
      db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...cfg.cols.map(c => val(c, d[c])), id);
      if (cfg.image && old[cfg.image] && old[cfg.image] !== d[cfg.image]) removeImage(old[cfg.image]);
      res.json({ ok: true });
    } catch (e) { dbError(e, res, cfg.label); }
  });

  api.delete(`/${table}/:id`, (req, res) => {
    const id = getId(req, res);
    if (!id) return;
    const old = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!old) return res.status(404).json({ error: `${cfg.label} not found` });
    try {
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      if (cfg.image) removeImage(old[cfg.image]);
      res.json({ ok: true });
    } catch (e) { dbError(e, res, cfg.label); }
  });
}

// ---------- products ----------

const productListQuery = z.object({
  q: text(100).default(''),
  brand: text(60).default(''),
  category: text(60).default(''),
  sort: z.enum(['new', 'name', 'lo', 'hi', 'off']).catch('new'),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  sample: z.enum(['1']).optional()
});

api.get('/products', (req, res) => {
  const f = parse(productListQuery, req.query, res);
  if (!f) return;
  res.json(listProducts({ q: f.q, brand: f.brand, category: f.category, sort: f.sort, page: f.page, perPage: 50, sample: f.sample === '1' ? true : undefined }));
});

// Export must come before "/products/:id".
api.get('/products/export', wrap(async (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  if (req.query.format === 'xlsx') {
    res.attachment(`products-${date}.xlsx`).type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(await sheet.exportXlsx());
  }
  res.attachment(`products-${date}.csv`).type('text/csv; charset=utf-8').send(sheet.exportCsv());
}));

api.post('/products/import', sheetUpload, wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV or Excel file first.' });
  try {
    const result = await sheet.importProducts(req.file.buffer, req.file.originalname, { dryRun: req.query.dry === '1' });
    res.json({ ...result, dryRun: req.query.dry === '1' });
  } catch (e) {
    if (e.code) throw e; // database errors -> 500
    res.status(400).json({ error: e.message });
  }
}));

api.get('/products/:id', (req, res) => {
  const id = getId(req, res);
  if (!id) return;
  const p = getProduct(id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

function productRow(d) {
  return {
    name: d.name, brand_id: d.brand_id, category_id: d.category_id, model_code: d.model_code || null,
    mrp: d.mrp, nrp: d.nrp, description: d.description, specs: d.specs, photo: d.photo || null,
    in_stock: d.in_stock ? 1 : 0, featured: d.featured ? 1 : 0
  };
}

api.post('/products', (req, res) => {
  const d = parse(schemas.product, req.body, res);
  if (!d) return;
  try {
    const row = { ...productRow(d), slug: uniqueProductSlug(d.name, d.model_code) };
    const r = db.prepare(`INSERT INTO products (name, slug, brand_id, category_id, model_code, mrp, nrp, description, specs, photo, in_stock, featured)
      VALUES (@name, @slug, @brand_id, @category_id, @model_code, @mrp, @nrp, @description, @specs, @photo, @in_stock, @featured)`).run(row);
    res.status(201).json({ id: r.lastInsertRowid, slug: row.slug });
  } catch (e) { dbError(e, res, 'A product with this model code'); }
});

api.put('/products/:id', (req, res) => {
  const id = getId(req, res);
  if (!id) return;
  const d = parse(schemas.product, req.body, res);
  if (!d) return;
  const old = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'Product not found' });
  try {
    const row = productRow(d);
    // Keep the web address unless the name or model code changed.
    row.slug = (old.name === row.name && (old.model_code || null) === row.model_code) ? old.slug : uniqueProductSlug(row.name, row.model_code, id);
    row.id = id;
    db.prepare(`UPDATE products SET name=@name, slug=@slug, brand_id=@brand_id, category_id=@category_id, model_code=@model_code,
      mrp=@mrp, nrp=@nrp, description=@description, specs=@specs, photo=@photo, in_stock=@in_stock, featured=@featured,
      is_sample=0, updated_at=datetime('now') WHERE id=@id`).run(row);
    if (old.photo && old.photo !== row.photo) removeImage(old.photo);
    res.json({ ok: true, slug: row.slug });
  } catch (e) { dbError(e, res, 'A product with this model code'); }
});

api.delete('/products/:id', (req, res) => {
  const id = getId(req, res);
  if (!id) return;
  const old = db.prepare('SELECT photo FROM products WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'Product not found' });
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  removeImage(old.photo);
  res.json({ ok: true });
});

// ---------- enquiries ----------

const enquiryQuery = z.object({
  q: text(100).default(''),
  status: z.enum(['new', 'done', '']).catch(''),
  page: z.coerce.number().int().min(1).max(100000).catch(1)
});

api.get('/enquiries', (req, res) => {
  const f = parse(enquiryQuery, req.query, res);
  if (!f) return;
  const where = [], params = [];
  if (f.status) { where.push('status = ?'); params.push(f.status); }
  for (const w of f.q.split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push("(name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')");
    const like = `%${likeEscape(w)}%`;
    params.push(like, like, like);
  }
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const perPage = 50;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM enquiries${w}`).get(...params).n;
  const items = db.prepare(`SELECT * FROM enquiries${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, perPage, (f.page - 1) * perPage);
  res.json({ total, page: f.page, perPage, items });
});

api.patch('/enquiries/:id', (req, res) => {
  const id = getId(req, res);
  if (!id) return;
  const d = parse(schemas.enquiryStatus, req.body, res);
  if (!d) return;
  const r = db.prepare('UPDATE enquiries SET status = ? WHERE id = ?').run(d.status, id);
  if (!r.changes) return res.status(404).json({ error: 'Enquiry not found' });
  res.json({ ok: true });
});

api.delete('/enquiries/:id', (req, res) => {
  const id = getId(req, res);
  if (!id) return;
  const r = db.prepare('DELETE FROM enquiries WHERE id = ?').run(id);
  if (!r.changes) return res.status(404).json({ error: 'Enquiry not found' });
  res.json({ ok: true });
});

// ---------- settings ----------

api.get('/settings', (req, res) => {
  res.json({
    values: getSettings(),
    fields: FIELDS.map(({ key, group, label, type, max, a, b }) => ({ key, group, label, type, max, a, b }))
  });
});

api.put('/settings', (req, res) => {
  const d = parse(schemas.settings, req.body, res);
  if (!d) return;
  const before = getSettings();
  saveSettings(d);
  // Clean up replaced images.
  if ('logo' in d && before.logo !== d.logo) removeImage(before.logo);
  if (d.showroom_photos) before.showroom_photos.filter(p => !d.showroom_photos.includes(p)).forEach(removeImage);
  res.json({ ok: true });
});

module.exports = router;

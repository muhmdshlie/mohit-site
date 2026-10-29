// Public website: pages and the read-only JSON API the pages load their content from.
const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { getSettings, FIELDS } = require('../lib/settings');
const { listProducts, offerProducts, getProductBySlug, relatedProducts, toPublic, SORTS } = require('../lib/products');
const { schemas, parse, text } = require('../lib/validate');
const { esc } = require('../lib/util');
const renderProductPage = require('../views/product');
const renderNotFound = require('../views/not-found');

const router = express.Router();
const INDEX_FILE = path.join(__dirname, '..', 'public', 'index.html');

function siteUrl(req) {
  return (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

// ---------- API ----------

router.get('/api/site', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({
    settings: getSettings(),
    brands: db.prepare('SELECT name, photo FROM brands ORDER BY sort_order, name').all(),
    categories: db.prepare('SELECT name, photo FROM categories ORDER BY sort_order, name').all(),
    offers: db.prepare('SELECT title, text, image FROM offers WHERE active = 1 ORDER BY sort_order, id').all(),
    reviews: db.prepare('SELECT name, place, text, stars FROM reviews WHERE visible = 1 ORDER BY sort_order, id').all(),
    faqs: db.prepare('SELECT question, answer FROM faqs ORDER BY sort_order, id').all(),
    offerProducts: offerProducts().map(toPublic)
  });
});

const productQuery = z.object({
  q: text(100).default(''),
  cat: text(60).default(''),
  brand: text(60).default(''),
  sort: z.enum(Object.keys(SORTS)).catch('off'),
  page: z.coerce.number().int().min(1).max(1000).catch(1)
});

router.get('/api/products', (req, res) => {
  const f = parse(productQuery, req.query, res);
  if (!f) return;
  const cat = f.cat === 'All' ? '' : f.cat, brand = f.brand === 'All' ? '' : f.brand;
  const r = listProducts({ q: f.q, category: cat, brand, sort: f.sort, page: f.page, perPage: 24 });
  res.set('Cache-Control', 'no-cache');
  res.json({ ...r, items: r.items.map(toPublic) });
});

// Stops one visitor from flooding the enquiries list.
const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many enquiries from this device. Please message us on WhatsApp instead.' }
});

router.post('/api/enquiries', enquiryLimiter, (req, res) => {
  const e = parse(schemas.enquiry, req.body, res);
  if (!e) return;
  if (e.website) return res.status(201).json({ ok: true }); // spam bot: pretend it worked, save nothing
  db.prepare('INSERT INTO enquiries (type, name, phone, message) VALUES (?, ?, ?, ?)')
    .run(e.type, e.name, e.phone, e.message);
  res.status(201).json({ ok: true });
});

// ---------- Pages ----------

// Colours from settings become CSS variables (light mode only).
router.get('/theme.css', (req, res) => {
  const s = getSettings();
  const vars = FIELDS.filter(f => f.type === 'color')
    .map(f => `--${f.key.replace('color_', '')}:${/^#[0-9a-fA-F]{6}$/.test(s[f.key]) ? s[f.key] : f.default}`)
    .join(';');
  // site.css dark-mode rules are more specific, so they still win in dark mode.
  res.type('text/css').set('Cache-Control', 'no-cache').send(`:root{${vars}}\n`);
});

router.get(['/', '/index.html'], (req, res) => {
  const s = getSettings();
  const html = fs.readFileSync(INDEX_FILE, 'utf8')
    .replaceAll('{{META_TITLE}}', esc(s.meta_title))
    .replaceAll('{{META_DESC}}', esc(s.meta_description))
    .replaceAll('{{SHOP_NAME}}', esc(s.shop_name))
    .replaceAll('{{CANONICAL}}', esc(siteUrl(req) + '/'));
  res.type('html').set('Cache-Control', 'no-cache').send(html);
});

router.get('/product/:slug', (req, res) => {
  const p = getProductBySlug(String(req.params.slug).slice(0, 120));
  const s = getSettings();
  if (!p) return res.status(404).type('html').send(renderNotFound(s));
  res.type('html').set('Cache-Control', 'no-cache')
    .send(renderProductPage({ p, s, related: relatedProducts(p), base: siteUrl(req) }));
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${siteUrl(req)}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (req, res) => {
  const base = siteUrl(req);
  const urls = [`<url><loc>${esc(base)}/</loc></url>`].concat(
    db.prepare('SELECT slug, updated_at FROM products ORDER BY id').all().map(p =>
      `<url><loc>${esc(`${base}/product/${p.slug}`)}</loc><lastmod>${esc(p.updated_at.slice(0, 10))}</lastmod></url>`)
  );
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
});

module.exports = router;

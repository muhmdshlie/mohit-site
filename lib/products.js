// Product queries shared by the public API, product pages and the admin panel.
const db = require('../db');
const { discountPct } = require('./util');

const SELECT = `
  SELECT p.id, p.name, p.slug, p.model_code, p.mrp, p.nrp, p.description, p.specs, p.photo,
         p.in_stock, p.featured, p.is_sample, p.brand_id, p.category_id, p.created_at, p.updated_at,
         b.name AS brand, c.name AS category
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  JOIN categories c ON c.id = p.category_id`;

// Rounded discount %, same rule as the original site, so sorting matches the badge.
const DISCOUNT_SQL = 'CASE WHEN p.mrp > 0 AND p.nrp < p.mrp THEN ROUND((p.mrp - p.nrp) * 100.0 / p.mrp) ELSE 0 END';

const SORTS = {
  off: `${DISCOUNT_SQL} DESC, p.id ASC`,
  lo: 'p.nrp ASC, p.id ASC',
  hi: 'p.nrp DESC, p.id ASC',
  new: 'p.id DESC',
  name: 'p.name COLLATE NOCASE ASC, p.id ASC'
};

const likeEscape = s => s.replace(/[\\%_]/g, m => '\\' + m);

// Builds WHERE clause from filters. Every value goes in as a ? parameter.
function buildWhere({ q = '', category = '', brand = '', sample, featured } = {}) {
  const where = [], params = [];
  for (const word of String(q).trim().split(/\s+/).filter(Boolean).slice(0, 8)) {
    const like = `%${likeEscape(word)}%`;
    where.push(`(p.name LIKE ? ESCAPE '\\' OR p.model_code LIKE ? ESCAPE '\\' OR b.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }
  if (category) { where.push('c.name = ?'); params.push(category); }
  if (brand) { where.push('b.name = ?'); params.push(brand); }
  if (sample === true) where.push('p.is_sample = 1');
  if (featured === true) where.push('p.featured = 1');
  return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', params };
}

function withDiscount(row) {
  return row && { ...row, discount: discountPct(row.mrp, row.nrp), in_stock: !!row.in_stock, featured: !!row.featured, is_sample: !!row.is_sample };
}

// Only the fields the public website needs.
function toPublic(p) {
  return {
    id: p.id, name: p.name, slug: p.slug, brand: p.brand, category: p.category, model_code: p.model_code || '',
    mrp: p.mrp, nrp: p.nrp, discount: p.discount, photo: p.photo || '', in_stock: p.in_stock, featured: p.featured
  };
}

function listProducts({ q, category, brand, sort = 'off', page = 1, perPage = 24, sample, featured } = {}) {
  const w = buildWhere({ q, category, brand, sample, featured });
  const order = SORTS[sort] || SORTS.off;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM products p JOIN brands b ON b.id = p.brand_id JOIN categories c ON c.id = p.category_id${w.sql}`).get(...w.params).n;
  const offset = (Math.max(1, page) - 1) * perPage;
  const rows = db.prepare(`${SELECT}${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...w.params, perPage, offset);
  return { total, page, perPage, items: rows.map(withDiscount) };
}

// Offers grid: featured products if any are marked, otherwise the biggest discounts.
function offerProducts(limit = 8) {
  const featured = db.prepare(`${SELECT} WHERE p.featured = 1 ORDER BY ${SORTS.off} LIMIT ?`).all(limit);
  const rows = featured.length ? featured : db.prepare(`${SELECT} ORDER BY ${SORTS.off} LIMIT 4`).all();
  return rows.map(withDiscount);
}

function getProduct(id) {
  return withDiscount(db.prepare(`${SELECT} WHERE p.id = ?`).get(id));
}

function getProductBySlug(slug) {
  return withDiscount(db.prepare(`${SELECT} WHERE p.slug = ?`).get(slug));
}

function relatedProducts(p, limit = 4) {
  return db.prepare(`${SELECT} WHERE p.category_id = ? AND p.id != ? ORDER BY ${SORTS.off} LIMIT ?`)
    .all(p.category_id, p.id, limit).map(withDiscount);
}

function allProducts() {
  return db.prepare(`${SELECT} ORDER BY b.sort_order, b.name, c.sort_order, p.name`).all().map(withDiscount);
}

module.exports = { SORTS, listProducts, offerProducts, getProduct, getProductBySlug, relatedProducts, allProducts, toPublic };

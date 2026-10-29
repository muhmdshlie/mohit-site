// Small shared helpers.
const db = require('../db');

// HTML-escape for anything the server writes into a page.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function slugify(text) {
  return String(text)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'product';
}

// Returns a slug that no other product uses (ignores the product with id = exceptId).
function uniqueProductSlug(name, modelCode, exceptId = 0) {
  const base = slugify(modelCode ? `${name} ${modelCode}` : name);
  const taken = db.prepare('SELECT 1 FROM products WHERE slug = ? AND id != ?');
  let slug = base;
  for (let n = 2; taken.get(slug, exceptId); n++) slug = `${base}-${n}`;
  return slug;
}

function discountPct(mrp, nrp) {
  return mrp > 0 && nrp < mrp ? Math.round(((mrp - nrp) / mrp) * 100) : 0;
}

function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

module.exports = { esc, slugify, uniqueProductSlug, discountPct, formatINR };

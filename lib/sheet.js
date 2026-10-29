// Bulk product import / export (CSV and Excel .xlsx).
//
// Import rules (also explained in README):
// - Row 1 must hold column names. Common names are understood ("Model No", "Item Code", "Our Price"...).
// - Rows are matched to existing products by Model Code. Match found -> update, otherwise -> new product.
// - When updating, empty cells mean "keep the current value". So a file with only
//   Model Code, MRP and NRP columns simply updates prices.
// - New products need Name, Brand, Category, MRP and NRP.
// - Brands and categories that do not exist yet are created automatically.
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const db = require('../db');
const { schemas } = require('./validate');
const { uniqueProductSlug } = require('./util');
const { allProducts } = require('./products');

const COLUMNS = [
  { key: 'name', header: 'Name', aliases: ['name', 'productname', 'product', 'itemname', 'item', 'productdescription'] },
  { key: 'brand', header: 'Brand', aliases: ['brand', 'brandname', 'make', 'company'] },
  { key: 'model_code', header: 'Model Code', aliases: ['modelcode', 'model', 'code', 'modelno', 'modelnumber', 'itemcode', 'sku', 'productcode', 'catno', 'catalogueno', 'cataloguenumber', 'articleno'] },
  { key: 'category', header: 'Category', aliases: ['category', 'categoryname', 'type', 'group', 'productgroup'] },
  { key: 'mrp', header: 'MRP', aliases: ['mrp', 'mrprs', 'mrpinr', 'listprice', 'maximumretailprice'] },
  { key: 'nrp', header: 'NRP', aliases: ['nrp', 'nrprs', 'nrpinr', 'ourprice', 'price', 'sellingprice', 'dealerprice', 'offerprice', 'netprice'] },
  { key: 'description', header: 'Description', aliases: ['description', 'desc', 'details'] },
  { key: 'specs', header: 'Specs', aliases: ['specs', 'specifications', 'specification', 'features'] },
  { key: 'photo', header: 'Photo', aliases: ['photo', 'image', 'imageurl', 'photourl', 'picture', 'imagelink'] },
  { key: 'in_stock', header: 'In Stock', aliases: ['instock', 'stock', 'available', 'availability'] },
  { key: 'featured', header: 'Featured', aliases: ['featured', 'feature', 'highlight'] }
];

const MAX_ROWS = 20000;
const norm = h => String(h ?? '').replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- reading files ----------

// Small RFC 4180 CSV parser (quotes, commas and new lines inside quotes).
function parseCsv(textIn) {
  const t = textIn.replace(/^﻿/, '');
  const firstLine = t.slice(0, t.indexOf('\n') >>> 0);
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function cellValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);                  // formula
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('text' in v) return cellValue(v.text);                      // hyperlink
    if ('error' in v) return '';
    return '';
  }
  return String(v);
}

async function readRows(buffer, filename) {
  if (/\.csv$/i.test(filename)) return parseCsv(buffer.toString('utf8'));
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw new Error('Could not read this Excel file. Save it as .xlsx and try again.'); }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, r => {
    const vals = [];
    for (let c = 1; c <= r.cellCount; c++) vals.push(cellValue(r.getCell(c).value));
    rows.push(vals);
  });
  return rows;
}

// ---------- import ----------

const unguard = s => s.replace(/^'(?=[=+\-@])/, ''); // undo the export guard below

async function importProducts(buffer, filename, { dryRun }) {
  const rows = (await readRows(buffer, filename)).filter(r => r.some(v => String(v).trim() !== ''));
  if (rows.length < 2) throw new Error('The file is empty or has no data rows.');
  if (rows.length - 1 > MAX_ROWS) throw new Error(`Too many rows. Maximum is ${MAX_ROWS} per file.`);

  // Map file columns to our fields.
  const colIndex = {};
  rows[0].forEach((h, i) => {
    const col = COLUMNS.find(c => c.aliases.includes(norm(h)));
    if (col && colIndex[col.key] === undefined) colIndex[col.key] = i;
  });
  const found = Object.keys(colIndex);
  if (!found.includes('model_code') && !found.includes('name')) {
    throw new Error('Could not find a "Model Code" or "Name" column in row 1. Download the export file to see the expected columns.');
  }

  const brands = new Map(db.prepare('SELECT id, name FROM brands').all().map(b => [b.name.toLowerCase(), b.id]));
  const cats = new Map(db.prepare('SELECT id, name FROM categories').all().map(c => [c.name.toLowerCase(), c.id]));
  const byCode = db.prepare('SELECT * FROM products WHERE model_code = ?');
  const newBrands = new Set(), newCats = new Set();
  const seenCodes = new Set();
  const result = { total: rows.length - 1, created: 0, updated: 0, errors: [], columns: found.map(k => COLUMNS.find(c => c.key === k).header) };
  const FAKE_ID = 2147483647; // stands in for not-yet-created brands/categories during preview

  const plan = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = k => colIndex[k] === undefined ? '' : unguard(String(r[colIndex[k]] ?? '').trim());
    const code = get('model_code');
    if (code) {
      if (seenCodes.has(code.toLowerCase())) return result.errors.push({ row: line, message: `Model code ${code} appears twice in the file` });
      seenCodes.add(code.toLowerCase());
    }
    const existing = code ? byCode.get(code) : null;

    const resolve = (map, set, name) => {
      if (!name) return null;
      const id = map.get(name.toLowerCase());
      if (id) return id;
      set.add(name);
      return FAKE_ID;
    };
    const brandName = get('brand'), catName = get('category');
    const brandId = resolve(brands, newBrands, brandName);
    const catId = resolve(cats, newCats, catName);

    const pick = (k, fallback) => { const v = get(k); return v !== '' ? v : fallback; };
    const merged = {
      name: pick('name', existing?.name ?? ''),
      brand_id: brandId ?? existing?.brand_id,
      category_id: catId ?? existing?.category_id,
      model_code: code || '',
      mrp: pick('mrp', existing?.mrp),
      nrp: pick('nrp', existing?.nrp),
      description: pick('description', existing?.description ?? ''),
      specs: pick('specs', existing?.specs ?? ''),
      photo: pick('photo', existing?.photo ?? ''),
      in_stock: pick('in_stock', existing ? !!existing.in_stock : true),
      featured: pick('featured', existing ? !!existing.featured : false)
    };
    const missing = [];
    if (!merged.name) missing.push('Name');
    if (!merged.brand_id) missing.push('Brand');
    if (!merged.category_id) missing.push('Category');
    if (merged.mrp === undefined) missing.push('MRP');
    if (merged.nrp === undefined) missing.push('NRP');
    if (missing.length) return result.errors.push({ row: line, message: `Missing ${missing.join(', ')}` });

    const v = schemas.product.safeParse(merged);
    if (!v.success) {
      return result.errors.push({ row: line, message: v.error.issues.map(x => `${x.path.join('.') || 'row'}: ${x.message}`).join('; ') });
    }
    plan.push({ data: v.data, existing, brandName, catName });
    existing ? result.updated++ : result.created++;
  });

  result.newBrands = [...newBrands];
  result.newCategories = [...newCats];
  if (result.errors.length > 200) {
    result.moreErrors = result.errors.length - 200;
    result.errors = result.errors.slice(0, 200);
  }
  if (dryRun) return result;

  // Write everything in one transaction: all good rows are saved, or nothing.
  db.transaction(() => {
    const maxOrder = t => db.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${t}`).get().m;
    let bo = maxOrder('brands'), co = maxOrder('categories');
    for (const name of newBrands) brands.set(name.toLowerCase(), db.prepare('INSERT INTO brands (name, sort_order) VALUES (?, ?)').run(name, ++bo).lastInsertRowid);
    for (const name of newCats) cats.set(name.toLowerCase(), db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(name, ++co).lastInsertRowid);

    const ins = db.prepare(`INSERT INTO products (name, slug, brand_id, category_id, model_code, mrp, nrp, description, specs, photo, in_stock, featured)
      VALUES (@name, @slug, @brand_id, @category_id, @model_code, @mrp, @nrp, @description, @specs, @photo, @in_stock, @featured)`);
    const upd = db.prepare(`UPDATE products SET name=@name, slug=@slug, brand_id=@brand_id, category_id=@category_id, mrp=@mrp, nrp=@nrp,
      description=@description, specs=@specs, photo=@photo, in_stock=@in_stock, featured=@featured, is_sample=0, updated_at=datetime('now') WHERE id=@id`);

    for (const { data, existing, brandName, catName } of plan) {
      const row = {
        ...data,
        brand_id: data.brand_id === FAKE_ID ? brands.get(brandName.toLowerCase()) : data.brand_id,
        category_id: data.category_id === FAKE_ID ? cats.get(catName.toLowerCase()) : data.category_id,
        model_code: data.model_code || null,
        photo: data.photo || null,
        in_stock: data.in_stock ? 1 : 0,
        featured: data.featured ? 1 : 0
      };
      if (existing) {
        row.id = existing.id;
        row.slug = existing.name === row.name ? existing.slug : uniqueProductSlug(row.name, row.model_code, existing.id);
        upd.run(row);
      } else {
        row.slug = uniqueProductSlug(row.name, row.model_code);
        ins.run(row);
      }
    }
  })();
  return result;
}

// ---------- export ----------

// Stops spreadsheet programs from running cell text as a formula (CSV injection).
const guard = v => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);

function exportRows() {
  return allProducts().map(p => ({
    name: p.name, brand: p.brand, model_code: p.model_code || '', category: p.category,
    mrp: p.mrp, nrp: p.nrp, description: p.description, specs: p.specs, photo: p.photo || '',
    in_stock: p.in_stock ? 'yes' : 'no', featured: p.featured ? 'yes' : 'no'
  }));
}

function exportCsv() {
  const q = v => {
    const s = String(guard(v ?? ''));
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.map(c => c.header).join(',')]
    .concat(exportRows().map(r => COLUMNS.map(c => q(r[c.key])).join(',')));
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8'); // BOM so Excel shows ₹ and other symbols
}

async function exportXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.columns = COLUMNS.map(c => ({ header: c.header, key: c.key, width: ['name', 'description', 'specs'].includes(c.key) ? 40 : 16 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.addRows(exportRows());
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { importProducts, exportCsv, exportXlsx, parseCsv, COLUMNS };

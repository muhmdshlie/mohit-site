// Product photos in bulk, matched by EXACT item code (model code). Nothing is guessed.
//
//   npm run images -- --audit                       report only: which products have a photo, which do not
//   npm run images -- <folder>                      photos named after their item code (ALI-CHR-85011B.jpg)
//   npm run images -- --map <mapping.csv|.json>     item code -> image file or http(s) link
//
// Without --apply nothing is changed (preview). Other options:
//   --apply          back up the database, then save the photos (only the products' photo field changes)
//   --batch <n>      process at most n new photos per run (default 500); run again to continue
//   --retry-failed   try items that failed in an earlier run again (they are skipped by default)
//   --replace        also replace photos products already have (default: keep them)
//   --allow-shared   allow the same image file for more than one item code (default: flagged and skipped,
//                    because different finishes/variants must not share a photo)
//
// Mapping file: CSV with the columns item_code, image and (optional) source, e.g.
//     item_code,image,source
//     ALI-CHR-85011B,photos/ALI-CHR-85011B.jpg,Jaquar dealer image pack 2026
//     KUP-SSF-35001PM,https://example.com/kup-ssf-35001pm.jpg,Distributor
// or JSON: [{ "item_code": "...", "image": "...", "source": "..." }] or { "ALI-CHR-85011B": "photos/a.jpg" }.
// Relative file paths are relative to the mapping file. "/" in a code can be written as "_" in file names.
//
// Every photo must really be a JPG, PNG or WEBP (checked from the content), at least 300 px on the short side.
// It is saved as uploads/p-<code>-<hash>.webp (max 1200 px) plus a 400 px copy for product cards.
// Progress is kept in data/image-import-state.json, so a stopped or failed run can simply be started again.
// A CSV report is written to data/ on every run. Products without a photo keep "Image coming soon".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('../db');
const { parseCsv } = require('../lib/sheet');

const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.dirname(db.name);
const STATE_FILE = path.join(DATA_DIR, 'image-import-state.json');
const EXT = /\.(jpe?g|png|webp)$/i;
const MIN_SIDE = 300;
const MAX_DOWNLOAD = 15 * 1024 * 1024;
const FLUSH_EVERY = 100;

function args() {
  const a = process.argv.slice(2);
  const opt = { folder: '', map: '', audit: false, apply: false, replace: false, retryFailed: false, allowShared: false, batch: 500 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--apply') opt.apply = true;
    else if (a[i] === '--audit') opt.audit = true;
    else if (a[i] === '--replace') opt.replace = true;
    else if (a[i] === '--retry-failed') opt.retryFailed = true;
    else if (a[i] === '--allow-shared') opt.allowShared = true;
    else if (a[i] === '--map') opt.map = a[++i] || '';
    else if (a[i] === '--batch') opt.batch = Math.max(1, parseInt(a[++i], 10) || 500);
    else if (!opt.folder) opt.folder = a[i];
  }
  return opt;
}

const keyOf = s => String(s).trim().toLowerCase().replace(/\//g, '_');
const fileSafe = code => code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const csvCell = v => (/[",\r\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isUrl = s => /^https?:\/\//i.test(s);

// ---------- inputs ----------

function entriesFromFolder(folder) {
  return fs.readdirSync(folder)
    .filter(f => EXT.test(f) && fs.statSync(path.join(folder, f)).isFile())
    .map(f => ({ code: f.replace(EXT, ''), image: path.join(folder, f), source: 'file name', label: f }));
}

function entriesFromMap(file) {
  const dir = path.dirname(path.resolve(file));
  const resolve = img => (isUrl(img) ? img : path.resolve(dir, img));
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (/\.json$/i.test(file)) {
    const j = JSON.parse(text);
    const list = Array.isArray(j) ? j : Object.entries(j).map(([item_code, image]) => ({ item_code, image }));
    return list.filter(x => x && x.item_code && x.image)
      .map(x => ({ code: String(x.item_code).trim(), image: resolve(String(x.image).trim()), source: String(x.source || '').trim(), label: String(x.image).trim() }));
  }
  const rows = parseCsv(text).filter(r => r.some(v => String(v).trim()));
  const head = (rows.shift() || []).map(h => String(h).trim().toLowerCase().replace(/[^a-z]/g, ''));
  const ci = head.findIndex(h => ['itemcode', 'modelcode', 'code', 'sku'].includes(h));
  const ii = head.findIndex(h => ['image', 'file', 'url', 'path', 'imageurl', 'photo'].includes(h));
  const si = head.findIndex(h => ['source', 'verifiedby', 'verifiedsource'].includes(h));
  if (ci < 0 || ii < 0) throw new Error('Mapping CSV needs the columns "item_code" and "image".');
  return rows.filter(r => r[ci] && r[ii])
    .map(r => ({ code: r[ci].trim(), image: resolve(r[ii].trim()), source: si >= 0 ? String(r[si] || '').trim() : '', label: r[ii].trim() }));
}

// Reads a local file or downloads a link (http/https only, size-limited, 2 retries).
async function loadImage(image) {
  if (!isUrl(image)) {
    if (!fs.existsSync(image) || !fs.statSync(image).isFile()) throw new Error('File not found');
    return fs.readFileSync(image);
  }
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(image, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'MohitMarketing-image-import/1.0' } });
      if (!res.ok) { lastErr = new Error(`Download failed: HTTP ${res.status}`); if (res.status < 500) break; continue; }
      if (Number(res.headers.get('content-length') || 0) > MAX_DOWNLOAD) throw new Error('Download too large (over 15 MB)');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_DOWNLOAD) throw new Error('Download too large (over 15 MB)');
      return buf;
    } catch (e) {
      lastErr = e.name === 'TimeoutError' ? new Error('Download timed out') : e;
      if (/too large/.test(lastErr.message)) break;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw lastErr;
}

async function checkImage(buf) {
  let meta;
  try { meta = await sharp(buf).metadata(); } catch { meta = null; }
  if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format)) return 'Not a readable JPG/PNG/WEBP image';
  if (meta.width * meta.height > 50_000_000) return 'Image is too large (pixels)';
  if (Math.min(meta.width, meta.height) < MIN_SIDE) return `Too small: ${meta.width}x${meta.height}px, need ${MIN_SIDE}px+`;
  return '';
}

// ---------- reports ----------

function writeReport(lines) {
  const file = path.join(DATA_DIR, `image-import-report-${stamp()}.csv`);
  fs.writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\n');
  return file;
}

function audit() {
  const rows = db.prepare(`SELECT p.model_code, p.name, b.name brand, c.name category, p.photo, p.is_sample
    FROM products p JOIN brands b ON b.id = p.brand_id JOIN categories c ON c.id = p.category_id ORDER BY p.model_code`).all();
  const has = r => !!(r.photo && r.photo.trim());
  const missingFile = rows.filter(r => has(r) && /^\/uploads\//.test(r.photo) && !fs.existsSync(path.join(UPLOAD_DIR, r.photo.slice(9))));
  const lines = ['item_code,product,brand,category,demo,photo,status'];
  for (const r of rows) {
    const status = !has(r) ? 'MISSING - shows "Image coming soon"' : missingFile.includes(r) ? 'BROKEN - file not found' : 'HAS PHOTO';
    lines.push([r.model_code, r.name, r.brand, r.category, r.is_sample ? 'yes' : '', r.photo || '', status].map(csvCell).join(','));
  }
  const by = key => {
    const m = {};
    for (const r of rows) { const k = r[key]; m[k] = m[k] || [0, 0]; m[k][has(r) ? 0 : 1]++; }
    return Object.entries(m).sort((a, b) => b[1][1] - a[1][1]).map(([k, [w, wo]]) => `    ${k}: ${w} with photo, ${wo} missing`).join('\n');
  };
  const file = writeReport(lines);
  console.log(`Image audit (nothing changed)
  Products: ${rows.length}
  With a photo: ${rows.filter(has).length}   Missing (placeholder): ${rows.filter(r => !has(r)).length}   Photo file missing on disk: ${missingFile.length}
  By brand:\n${by('brand')}
  By category:\n${by('category')}
  Report: ${file}`);
}

// ---------- import ----------

async function main() {
  const opt = args();
  if (opt.audit) return audit();
  if (!opt.map && (!opt.folder || !fs.existsSync(opt.folder) || !fs.statSync(opt.folder).isDirectory())) {
    console.error('Usage: npm run images -- --audit\n       npm run images -- <folder> [options]\n       npm run images -- --map <mapping.csv|.json> [options]\nOptions: --apply --batch <n> --retry-failed --replace --allow-shared');
    process.exit(1);
  }
  const entries = opt.map ? entriesFromMap(opt.map) : entriesFromFolder(opt.folder);

  const products = db.prepare('SELECT id, model_code, name, photo FROM products WHERE model_code IS NOT NULL').all();
  const byKey = new Map(products.map(p => [keyOf(p.model_code), p]));
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  const shaOwner = new Map(Object.entries(state).filter(([, s]) => s.status === 'added' && s.sha).map(([code, s]) => [s.sha, code]));

  const report = [];
  const seen = new Map();
  let todo = 0, budget = opt.batch, backedUp = false;
  const pendingUpdates = [];
  const upd = db.prepare("UPDATE products SET photo = @photo, updated_at = datetime('now') WHERE id = @id");
  const flush = () => {
    if (!pendingUpdates.length) return;
    db.transaction(() => { for (const u of pendingUpdates) upd.run(u); })();
    pendingUpdates.length = 0;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  };

  for (const e of entries) {
    const p = byKey.get(keyOf(e.code));
    const line = { item_code: p ? p.model_code : e.code, image: e.label, source: e.source, result: '', detail: '' };
    report.push(line);
    if (!p) { line.result = 'NO MATCH'; line.detail = 'No product has this exact item code'; continue; }
    if (seen.has(p.id)) { line.result = 'DUPLICATE CODE'; line.detail = `Item code already listed with ${seen.get(p.id)}`; continue; }
    seen.set(p.id, e.label);
    const prev = state[p.model_code];
    if (prev && prev.status === 'added' && prev.image === e.image && p.photo === prev.photo && !opt.replace) { line.result = 'DONE EARLIER'; line.detail = prev.photo; continue; }
    if (prev && prev.status === 'failed' && prev.image === e.image && !opt.retryFailed) { line.result = 'FAILED EARLIER'; line.detail = prev.reason + ' (use --retry-failed)'; continue; }
    if (p.photo && !opt.replace) { line.result = 'KEPT EXISTING'; line.detail = `Product already has ${p.photo} (use --replace)`; continue; }
    if (budget <= 0) { line.result = 'NEXT BATCH'; line.detail = 'Run again to continue'; continue; }

    // Preview: local files are fully checked; links are only checked when --apply downloads them.
    if (!opt.apply) {
      budget--; todo++;
      if (isUrl(e.image)) { line.result = 'WOULD DOWNLOAD'; continue; }
      let buf;
      try { buf = await loadImage(e.image); } catch (err) { line.result = 'FAILED'; line.detail = err.message; continue; }
      const bad = await checkImage(buf);
      if (bad) { line.result = 'INVALID'; line.detail = bad; continue; }
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      const owner = shaOwner.get(sha);
      if (owner && owner !== p.model_code && !opt.allowShared) { line.result = 'DUPLICATE IMAGE'; line.detail = `Same image as ${owner}`; continue; }
      shaOwner.set(sha, p.model_code);
      line.result = 'WOULD ADD';
      continue;
    }

    budget--; todo++;
    if (!backedUp) {
      fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
      const backupFile = path.join(DATA_DIR, 'backups', `mohit-before-images-${stamp()}.db`);
      await db.backup(backupFile);
      console.log(`Database backup: ${backupFile}`);
      backedUp = true;
    }
    const fail = (result, reason) => { line.result = result; line.detail = reason; state[p.model_code] = { status: 'failed', image: e.image, source: e.source, reason, at: new Date().toISOString() }; };
    let buf;
    try { buf = await loadImage(e.image); } catch (err) { fail('FAILED', err.message); continue; }
    if (isUrl(e.image)) await sleep(250); // be polite to the image server
    const bad = await checkImage(buf);
    if (bad) { fail('INVALID', bad); continue; }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const owner = shaOwner.get(sha);
    if (owner && owner !== p.model_code && !opt.allowShared) { fail('DUPLICATE IMAGE', `Same image as ${owner}`); continue; }

    const base = `p-${fileSafe(p.model_code)}-${crypto.createHash('sha256').update(p.model_code + '\0').update(buf).digest('hex').slice(0, 10)}`;
    const img = sharp(buf).rotate();
    await img.clone().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(UPLOAD_DIR, base + '.webp'));
    await img.clone().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(UPLOAD_DIR, base + '-400.webp'));
    const photo = `/uploads/${base}.webp`;
    pendingUpdates.push({ id: p.id, photo });
    shaOwner.set(sha, p.model_code);
    state[p.model_code] = { status: 'added', image: e.image, source: e.source, sha, photo, at: new Date().toISOString() };
    line.result = 'ADDED'; line.detail = photo;
    if (pendingUpdates.length >= FLUSH_EVERY) flush();
  }
  if (opt.apply) { flush(); if (todo) fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); }

  // Report: every input line, then every product still without a photo.
  const withPhoto = new Set(db.prepare("SELECT id FROM products WHERE photo IS NOT NULL AND photo <> ''").all().map(r => r.id));
  const willAdd = new Set(opt.apply ? [] : report.filter(r => r.result === 'WOULD ADD' || r.result === 'WOULD DOWNLOAD').map(r => keyOf(r.item_code)));
  const lines = ['item_code,image,source,result,detail', ...report.map(r => [r.item_code, r.image, r.source, r.result, r.detail].map(csvCell).join(','))];
  lines.push('', 'item_code,product,status');
  for (const p of products) if (!withPhoto.has(p.id) && !willAdd.has(keyOf(p.model_code))) lines.push([p.model_code, p.name, 'Image coming soon (no verified photo)'].map(csvCell).join(','));
  const reportFile = writeReport(lines);

  const count = k => report.filter(r => r.result === k).length;
  const total = db.prepare('SELECT COUNT(*) n FROM products').get().n;
  const nowWith = withPhoto.size + willAdd.size;
  console.log(`${opt.apply ? 'Applied' : 'Preview (nothing changed; add --apply to save)'}
  Lines in input: ${entries.length}
  ${opt.apply ? `Added: ${count('ADDED')}` : `Would add: ${count('WOULD ADD')}   Would download and check: ${count('WOULD DOWNLOAD')}`}
  Failed: ${count('FAILED')}   Invalid: ${count('INVALID')}   Duplicate image: ${count('DUPLICATE IMAGE')}   No matching item code: ${count('NO MATCH')}   Duplicate code: ${count('DUPLICATE CODE')}
  Kept existing: ${count('KEPT EXISTING')}   Done earlier: ${count('DONE EARLIER')}   Failed earlier: ${count('FAILED EARLIER')}   Left for next batch: ${count('NEXT BATCH')}
  Products with a photo${opt.apply ? '' : ' after --apply'}: ${nowWith} of ${total}   Placeholder: ${total - nowWith}
  Report: ${reportFile}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

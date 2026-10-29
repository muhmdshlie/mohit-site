// Image uploads: jpg / png / webp only, max 5 MB, resized and saved as .webp.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp']; // checked from the file content, not the name

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new UploadError('Only JPG, PNG or WEBP images are allowed.'));
  }
}).single('image');

// Spreadsheet uploads for bulk import (kept in memory, never saved to disk).
const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/\.(csv|xlsx)$/i.test(file.originalname)) cb(null, true);
    else cb(new UploadError('Please upload a .csv or .xlsx file.'));
  }
}).single('file');

class UploadError extends Error {}

// Resizes to max 1200px (or 400px for logos), strips metadata, saves as webp.
async function saveImage(buffer, { maxSize = 1200 } = {}) {
  let meta;
  try { meta = await sharp(buffer).metadata(); } catch { throw new UploadError('This file is not a valid image.'); }
  if (!ALLOWED_FORMATS.includes(meta.format)) throw new UploadError('Only JPG, PNG or WEBP images are allowed.');
  if (meta.width * meta.height > 50_000_000) throw new UploadError('Image is too large (pixels).');

  const name = crypto.randomBytes(12).toString('hex') + '.webp';
  await sharp(buffer)
    .rotate() // respect phone camera orientation
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(UPLOAD_DIR, name));
  return '/uploads/' + name;
}

// True if any product, brand, category, offer or setting (logo, showroom photos) still uses this image.
function imageInUse(p) {
  return !!db.prepare(`
    SELECT 1 FROM products WHERE photo = @p UNION ALL SELECT 1 FROM brands WHERE photo = @p
    UNION ALL SELECT 1 FROM categories WHERE photo = @p UNION ALL SELECT 1 FROM offers WHERE image = @p
    UNION ALL SELECT 1 FROM settings WHERE instr(value, @p) > 0 LIMIT 1`).get({ p });
}

// Deletes an old uploaded file once nothing uses it any more.
// Only touches files inside /uploads with our own naming.
function removeImage(p) {
  if (typeof p !== 'string') return;
  const m = p.match(/^\/uploads\/([a-z0-9-]+\.(webp|jpe?g|png))$/);
  if (!m || imageInUse(p)) return;
  fs.unlink(path.join(UPLOAD_DIR, m[1]), () => {});
  // Photos added by "npm run images" (p-<code>-<hash>.webp) have a 400px card copy next to them.
  if (/^p-[a-z0-9-]+\.webp$/.test(m[1]) && !m[1].endsWith('-400.webp')) fs.unlink(path.join(UPLOAD_DIR, m[1].replace(/\.webp$/, '-400.webp')), () => {});
}

// Express wrapper so multer errors become friendly 400 responses.
function runUpload(mw) {
  return (req, res, next) => mw(req, res, err => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too big. Images: max 5 MB. Spreadsheets: max 10 MB.' });
    }
    if (err instanceof UploadError || err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    next(err);
  });
}

module.exports = {
  UPLOAD_DIR, UploadError, saveImage, removeImage,
  imageUpload: runUpload(imageUpload), sheetUpload: runUpload(sheetUpload)
};

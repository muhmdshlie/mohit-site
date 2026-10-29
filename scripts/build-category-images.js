// Builds the representative category images shown on products that have no photo of their own.
//   npm run category-images
// Source: public/images/categories/<category-slug>.png|jpg|webp (e.g. faucets.png, plumbing-and-drainage.png;
// slug = category name in lower case, "&" -> "and", other symbols -> "-"). Not served to visitors.
// Output: public/img/category/<slug>-800.webp and <slug>-400.webp, cropped to 4:3 like the product cards.
// The site labels these images "Representative image"; they are never stored as a product's own photo.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'public', 'images', 'categories');
const OUT = path.join(__dirname, '..', 'public', 'img', 'category');

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`No source folder: ${SRC}`);
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(SRC).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
  if (!files.length) throw new Error('No images found in public/images/categories');
  for (const f of files) {
    const slug = f.replace(/\.[^.]+$/, '').toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) { console.log(`skipped ${f}: name must be the category slug`); continue; }
    const meta = await sharp(path.join(SRC, f)).metadata();
    if (meta.width < 800 || meta.height < 600) { console.log(`skipped ${f}: ${meta.width}x${meta.height}px, need at least 800x600`); continue; }
    const sizes = [];
    for (const w of [800, 400]) {
      const out = path.join(OUT, `${slug}-${w}.webp`);
      await sharp(path.join(SRC, f)).rotate().resize({ width: w, height: w * 3 / 4, fit: 'cover' }).webp({ quality: w === 800 ? 80 : 78 }).toFile(out);
      sizes.push(`${w}px ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
    }
    console.log(`${slug.padEnd(28)} ${sizes.join(', ')}`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });

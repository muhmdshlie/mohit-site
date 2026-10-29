// Builds the homepage hero image set in public/img/hero from one source photo.
//   npm run hero -- <photo.jpg|png|webp> [focus]
// focus = horizontal point to keep in the phone crop, 0 (left) to 1 (right). Default 0.7.
// Output: wide 16:9 versions (960/1280/1536 px) and a 3:4 phone crop (480/640 px), each as AVIF and WebP,
// plus one JPEG fallback. public/index.html already points at these file names.
// The photo must be at least 1536 x 864 px.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'public', 'img', 'hero');

async function main() {
  const [src, focusArg] = process.argv.slice(2);
  if (!src || !fs.existsSync(src)) {
    console.error('Usage: npm run hero -- <photo> [focus 0-1]');
    process.exit(1);
  }
  const focus = Math.min(1, Math.max(0, Number(focusArg ?? 0.7)));
  const meta = await sharp(src).metadata();
  if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw new Error('Use a JPG, PNG or WEBP photo.');
  if (meta.width < 1536 || meta.height < 864) throw new Error(`Photo is ${meta.width}x${meta.height}px; use at least 1536x864px.`);
  fs.mkdirSync(OUT, { recursive: true });

  // Wide 16:9 versions (centre crop), never enlarged beyond the source.
  const wide = sharp(src).rotate().resize({ width: meta.width, height: Math.round(meta.width * 9 / 16), fit: 'cover', position: 'centre' });
  const wideBuf = await wide.toBuffer();
  const written = [];
  for (const w of [960, 1280, 1536]) {
    const img = sharp(wideBuf).resize({ width: w });
    await img.clone().avif({ quality: 55, effort: 6 }).toFile(path.join(OUT, `hero-${w}.avif`));
    await img.clone().webp({ quality: 78 }).toFile(path.join(OUT, `hero-${w}.webp`));
    written.push(`hero-${w}.avif`, `hero-${w}.webp`);
  }
  await sharp(wideBuf).resize({ width: 1280 }).jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(path.join(OUT, 'hero-1280.jpg'));
  written.push('hero-1280.jpg');

  // Phone 3:4 crop around the focus point.
  const h = meta.height, cw = Math.min(meta.width, Math.round(h * 3 / 4));
  const left = Math.round(Math.min(meta.width - cw, Math.max(0, focus * meta.width - cw / 2)));
  const phone = await sharp(src).rotate().extract({ left, top: 0, width: cw, height: h }).toBuffer();
  for (const w of [480, 640]) {
    const img = sharp(phone).resize({ width: w });
    await img.clone().avif({ quality: 55, effort: 6 }).toFile(path.join(OUT, `hero-m-${w}.avif`));
    await img.clone().webp({ quality: 78 }).toFile(path.join(OUT, `hero-m-${w}.webp`));
    written.push(`hero-m-${w}.avif`, `hero-m-${w}.webp`);
  }

  for (const f of written) console.log(`${f.padEnd(18)} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0).padStart(5)} KB`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

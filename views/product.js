// Product detail page, rendered on the server so search engines see the real title, description and price.
const { esc, formatINR } = require('../lib/util');
const { layout, safeUrl } = require('./layout');
const { toPublic } = require('../lib/products');

// Same rules as MM.photo() in public/js/common.js: 400px copy for cards when "npm run images" made one,
// placeholder when there is no photo (a broken image is swapped for it by common.js).
function thumbOf(url) {
  const m = /^\/uploads\/(p-[a-z0-9-]+)\.webp$/.exec(url);
  return m && !/-400$/.test(m[1]) ? `/uploads/${m[1]}-400.webp` : '';
}

// Same category icons as placeholderIcon() in public/js/common.js.
const CATEGORY_ICONS = ['faucets', 'showers', 'basins', 'wcs', 'accessories', 'heaters', 'kitchen', 'shower-enclosures',
  'plumbing-and-drainage', 'concealed-kits-and-valves', 'bathtubs-and-wellness'];
const categorySlug = c => String(c || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function placeholderIcon(category) {
  const slug = categorySlug(category);
  return CATEGORY_ICONS.includes(slug) ? `/img/placeholders/${slug}.svg` : '/img/placeholder.svg';
}

// Same as representative() in public/js/common.js: AI-generated category image, always labelled.
function representativeHtml(p, main) {
  const slug = categorySlug(p.category);
  if (!slug) return '';
  const base = `/img/category/${slug}`;
  const label = main ? 'Representative image – the actual product may look different' : 'Representative image';
  return `<span class="rep"><img src="${base}-${main ? 800 : 400}.webp" srcset="${base}-400.webp 400w, ${base}-800.webp 800w" sizes="${main ? '(max-width: 640px) 92vw, 540px' : '(max-width: 560px) 92vw, 300px'}" alt="Representative image of ${esc(p.category)} (not the exact product)" width="${main ? 800 : 400}" height="${main ? 600 : 300}"${main ? '' : ' loading="lazy"'} decoding="async"><span class="rep-tag">${label}</span></span>`;
}

function photoHtml(p, { main = false } = {}) {
  const src = safeUrl(p.photo);
  if (!src) return representativeHtml(p, main) || `<span class="noimg"><img src="${placeholderIcon(p.category)}" alt="" width="42" height="42">Image coming soon</span>`;
  const thumb = thumbOf(src);
  if (main) return `<img src="${esc(src)}" alt="${esc(p.name)}" width="1200" height="1200" fetchpriority="high" decoding="async">`;
  return `<img src="${esc(thumb || src)}"${thumb ? ` srcset="${esc(thumb)} 400w, ${esc(src)} 1200w" sizes="(max-width: 560px) 92vw, 300px"` : ''} alt="${esc(p.name)}" width="400" height="300" loading="lazy" decoding="async">`;
}

function waHref(s, text) {
  return `https://wa.me/${String(s.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

// Same markup as MM.card() in public/js/common.js.
function cardHtml(p, s) {
  const href = `/product/${encodeURIComponent(p.slug)}`;
  const save = p.mrp > p.nrp;
  const waText = `Hi, I am interested in ${p.name} (${p.brand}${p.model_code ? ', ' + p.model_code : ''}) at ${formatINR(p.nrp)}`;
  return `<div class="card"><a class="ph" href="${href}" aria-label="${esc(p.name)}" data-cat="${esc(p.category)}">${photoHtml(p)}${p.discount > 0 ? `<span class="badge">${p.discount}% OFF</span>` : ''}${p.in_stock ? '' : '<span class="oos">Out of stock</span>'}</a>
<div class="cb"><span class="meta">${esc(p.brand.toUpperCase())}${p.model_code ? ' · ' + esc(p.model_code) : ''}</span><a class="nm" href="${href}">${esc(p.name)}</a>
${save ? `<span class="mrp">${formatINR(p.mrp)}</span>` : ''}<span class="nrp">${formatINR(p.nrp)}</span>${save ? `<span class="save">You save ${formatINR(p.mrp - p.nrp)}</span>` : ''}
<div class="acts"><a class="btn wa" target="_blank" rel="noopener" href="${esc(waHref(s, waText))}">WhatsApp</a><button class="btn out" type="button" data-add="${esc(JSON.stringify(toPublic(p)))}">Add to list</button></div></div></div>`;
}

function specsHtml(specs) {
  const rows = String(specs || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const i = line.indexOf(':');
    return i > 0
      ? `<tr><th scope="row">${esc(line.slice(0, i).trim())}</th><td>${esc(line.slice(i + 1).trim())}</td></tr>`
      : `<tr><td colspan="2">${esc(line)}</td></tr>`;
  });
  return rows.length ? `<h2>Specifications</h2><table class="specs"><tbody>${rows.join('')}</tbody></table>` : '';
}

function metaDescription(p, s) {
  const base = p.description && !p.is_sample ? p.description.replace(/\s+/g, ' ') : '';
  const price = `${p.brand} ${p.name}${p.model_code ? ` (${p.model_code})` : ''} at ${formatINR(p.nrp)}${p.discount ? `, ${p.discount}% off MRP ${formatINR(p.mrp)}` : ''}. ${s.tagline}.`;
  const text = base ? `${base} ${price}` : `Buy ${price} Enquire on WhatsApp.`;
  return text.length > 160 ? text.slice(0, 157).replace(/\s+\S*$/, '') + '…' : text;
}

module.exports = function renderProductPage({ p, s, related, base }) {
  const url = `${base}/product/${p.slug}`;
  const title = `${p.name}${p.model_code ? ' ' + p.model_code : ''} – ${p.brand} | ${s.shop_name}`;
  const description = metaDescription(p, s);
  const img = safeUrl(p.photo);
  const absImg = img ? (img.startsWith('/') ? base + img : img) : '';
  const waText = `Hi, I am interested in ${p.name} (${p.brand}${p.model_code ? ', ' + p.model_code : ''}) at ${formatINR(p.nrp)}\n${url}`;

  // Structured data for Google (Product with price). "<" is escaped so it cannot close the script tag.
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, sku: p.model_code || undefined, brand: { '@type': 'Brand', name: p.brand },
    category: p.category, description, image: absImg || undefined, url,
    offers: {
      '@type': 'Offer', priceCurrency: 'INR', price: p.nrp, url,
      availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: s.shop_name }
    }
  }).replace(/</g, '\\u003c');

  const head = `<meta property="og:type" content="product">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${esc(s.shop_name)}">
${absImg ? `<meta property="og:image" content="${esc(absImg)}">` : ''}
<script type="application/ld+json">${ld}</script>`;

  const save = p.mrp > p.nrp;
  const body = `<section><div class="wrap">
<p class="crumbs"><a href="/">Home</a> › <a href="/#shop">${esc(p.category)}</a> › ${esc(p.name)}</p>
<div class="pd">
  <div class="ph" data-cat="${esc(p.category)}">${photoHtml(p, { main: true })}${p.discount > 0 ? `<span class="badge">${p.discount}% OFF</span>` : ''}</div>
  <div class="cb">
    <span class="meta">${esc(p.brand.toUpperCase())}${p.model_code ? ' · ' + esc(p.model_code) : ''} · ${esc(p.category)}</span>
    <h1>${esc(p.name)}</h1>
    ${save ? `<span class="mrp">MRP ${formatINR(p.mrp)}</span>` : ''}
    <span class="nrp">${formatINR(p.nrp)}</span>
    ${save ? `<span class="save">You save ${formatINR(p.mrp - p.nrp)} (${p.discount}% off)</span>` : ''}
    <span class="stock ${p.in_stock ? 'in' : 'out'}">${p.in_stock ? 'In stock' : 'Out of stock – ask us for availability'}</span>
    <div class="acts">
      <a class="btn wa" target="_blank" rel="noopener" href="${esc(waHref(s, waText))}">Ask on WhatsApp</a>
      <button class="btn out" type="button" data-add="${esc(JSON.stringify(toPublic(p)))}">Add to list</button>
    </div>
    ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
    ${specsHtml(p.specs)}
    <p class="note">${esc(s.price_note)}</p>
  </div>
</div>
</div></section>
${related.length ? `<section class="alt"><div class="wrap"><h2>More in ${esc(p.category)}</h2><p class="sub">Similar products you may like.</p>
<div class="grid">${related.map(r => cardHtml(r, s)).join('\n')}</div></div></section>` : ''}`;

  return layout({ s, title, description, canonical: url, head, body, scripts: ['/js/product.js'] });
};

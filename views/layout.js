// Shared page frame (top bar, header, footer) for server-rendered pages.
// Every value from the database goes through esc() before it is written into HTML.
const { esc } = require('../lib/util');

const safeUrl = u => (/^(https?:\/\/|\/(?!\/))/i.test(String(u || '')) ? String(u) : '');
const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');

function layout({ s, title, description, canonical, head = '', body, scripts = [] }) {
  const logo = safeUrl(s.logo)
    ? `<img src="${esc(s.logo)}" alt="${esc(s.shop_name)}">`
    : esc(String(s.shop_name).toUpperCase());
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="/theme.css">
${head}
</head>
<body data-wa="${esc(s.whatsapp)}">
<div class="top"><div class="wrap"><span>📞 <a href="${esc(telHref(s.phone))}">${esc(s.phone)}</a> · WhatsApp</span><span>${esc(s.hours)}</span></div></div>
<header><div class="wrap"><a class="logo" href="/">${logo}</a>
<nav><a href="/#shop">Shop</a><a href="/#brands">Brands</a><a href="/#offers">Offers</a><a href="/#about">About</a><a href="/#builders">Builders</a><a href="/#faq">FAQ</a><a href="/#contact">Contact</a></nav></div></header>
<main>
${body}
</main>
<footer><div class="wrap">${esc(s.footer_text)}</div></footer>
<div class="enqbar" id="enqbar" hidden><button class="enq" id="enq" type="button"></button><button class="clr" id="enqClear" type="button" aria-label="Clear enquiry list">×</button></div>
<a class="fab" id="fab" href="#" target="_blank" rel="noopener">WhatsApp us</a>
<script src="/js/common.js"></script>
${scripts.map(src => `<script src="${esc(src)}"></script>`).join('\n')}
</body>
</html>`;
}

module.exports = { layout, safeUrl };

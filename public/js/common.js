// Shared helpers for the public pages.
// Content from the database is always inserted as text (never as raw HTML) to prevent XSS.
(function () {
  'use strict';

  // Build an element: h('a', { href: '/x', class: 'btn' }, 'text', childEl)
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) {
        if (x !== null && x !== undefined && x !== false) el.appendChild(typeof x === 'string' || typeof x === 'number' ? document.createTextNode(String(x)) : x);
      });
    }
    return el;
  }

  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

  // Only allow normal web links and our own uploaded images.
  function safeUrl(u) { return /^(https?:\/\/|\/(?!\/))/i.test(String(u || '')) ? String(u) : ''; }

  var WA = document.body.getAttribute('data-wa') || '';
  function setWhatsApp(num) { WA = String(num || '').replace(/\D/g, ''); }
  function wa(text) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(text); }

  // ---------- Product images ----------
  // Images added by "npm run images" (uploads/p-<code>-<hash>.webp) also have a 400px copy (-400.webp),
  // so cards download the small one and the product page the full 1200px one.
  function thumbOf(url) {
    var m = /^\/uploads\/(p-[a-z0-9-]+)\.webp$/.exec(url);
    return m && !/-400$/.test(m[1]) ? '/uploads/' + m[1] + '-400.webp' : '';
  }

  // Category icon for the "Image coming soon" placeholder (public/img/placeholders). It is an icon, never a
  // product photo. Categories without an icon (e.g. new ones added in admin) use the generic placeholder.
  var CATEGORY_ICONS = ['faucets', 'showers', 'basins', 'wcs', 'accessories', 'heaters', 'kitchen', 'shower-enclosures',
    'plumbing-and-drainage', 'concealed-kits-and-valves', 'bathtubs-and-wellness'];
  function categorySlug(category) {
    return String(category || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function placeholderIcon(category) {
    var slug = categorySlug(category);
    return CATEGORY_ICONS.indexOf(slug) >= 0 ? '/img/placeholders/' + slug + '.svg' : '/img/placeholder.svg';
  }

  function placeholder(category) {
    return h('span', { class: 'noimg' }, h('img', { src: placeholderIcon(category), alt: '', width: 42, height: 42 }), 'Image coming soon');
  }

  // Products without their own photo show an AI-generated image of their category (public/img/category,
  // built by "npm run category-images"), always labelled "Representative image" so it is never mistaken for
  // the exact product. If that file is missing, the fallback below swaps in the category icon.
  function representative(category) {
    var slug = categorySlug(category);
    if (!slug) return null;
    var base = '/img/category/' + slug;
    return h('span', { class: 'rep' },
      h('img', { src: base + '-400.webp', srcset: base + '-400.webp 400w, ' + base + '-800.webp 800w', sizes: '(max-width: 560px) 92vw, 300px',
        alt: 'Representative image of ' + category + ' (not the exact product)', width: 400, height: 300, loading: 'lazy', decoding: 'async' }),
      h('span', { class: 'rep-tag' }, 'Representative image'));
  }

  // Product photo for cards: fixed 4:3 box (CSS), lazy loaded, representative image / placeholder when missing.
  function photo(src, alt, category) {
    var url = safeUrl(src);
    if (!url) return representative(category) || placeholder(category);
    var thumb = thumbOf(url);
    return h('img', {
      src: thumb || url, srcset: thumb ? thumb + ' 400w, ' + url + ' 1200w' : null, sizes: thumb ? '(max-width: 560px) 92vw, 300px' : null,
      alt: alt || '', width: 400, height: 300, loading: 'lazy', decoding: 'async'
    });
  }

  // A product image that fails to load (missing file, bad link) is swapped for the placeholder.
  // Inline onerror handlers are blocked by the security policy, so one capturing listener covers every page.
  function fallback(img) {
    if (!img || img.tagName !== 'IMG' || img.closest('.noimg')) return;
    var ph = img.closest('.ph');
    if (!ph) return;
    var cat = ph.getAttribute('data-cat');
    var rep = img.closest('.rep');
    // A broken product photo falls back to the representative image; a broken representative image to the icon.
    (rep || img).replaceWith(rep ? placeholder(cat) : (representative(cat) || placeholder(cat)));
  }
  document.addEventListener('error', function (e) { fallback(e.target); }, true);
  // Server-rendered images may have failed before this script ran.
  Array.prototype.forEach.call(document.querySelectorAll('.ph img'), function (img) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fallback(img);
  });

  function waText(p) { return 'Hi, I am interested in ' + p.name + ' (' + p.brand + (p.model_code ? ', ' + p.model_code : '') + ') at ' + inr(p.nrp); }

  // Product card (same layout as the original site).
  function card(p) {
    var href = '/product/' + encodeURIComponent(p.slug);
    return h('div', { class: 'card' },
      h('a', { class: 'ph', href: href, 'aria-label': p.name, 'data-cat': p.category },
        photo(p.photo, p.name, p.category),
        p.discount > 0 ? h('span', { class: 'badge' }, p.discount + '% OFF') : null,
        p.in_stock ? null : h('span', { class: 'oos' }, 'Out of stock')),
      h('div', { class: 'cb' },
        h('span', { class: 'meta' }, p.brand.toUpperCase() + (p.model_code ? ' · ' + p.model_code : '')),
        h('a', { class: 'nm', href: href }, p.name),
        p.mrp > p.nrp ? h('span', { class: 'mrp' }, inr(p.mrp)) : null,
        h('span', { class: 'nrp' }, inr(p.nrp)),
        p.mrp > p.nrp ? h('span', { class: 'save' }, 'You save ' + inr(p.mrp - p.nrp)) : null,
        h('div', { class: 'acts' },
          h('a', { class: 'btn wa', target: '_blank', rel: 'noopener', href: wa(waText(p)) }, 'WhatsApp'),
          h('button', { class: 'btn out', type: 'button', onclick: function () { List.add(p); } }, 'Add to list'))));
  }

  // ---------- Enquiry list (kept in this browser so it survives page changes) ----------
  var KEY = 'mm_enquiry_list';
  var List = {
    items: [],
    load: function () {
      try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); this.items = Array.isArray(v) ? v.slice(0, 100) : []; } catch (e) { this.items = []; }
      this.render();
    },
    save: function () { try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch (e) { /* private mode */ } },
    add: function (p) {
      if (!this.items.some(function (i) { return i.id === p.id; })) {
        this.items.push({ id: p.id, name: String(p.name), brand: String(p.brand), model_code: String(p.model_code || ''), nrp: Number(p.nrp) });
        this.save();
      }
      this.render();
      toast('Added to your enquiry list');
    },
    clear: function () { this.items = []; this.save(); this.render(); },
    render: function () {
      var bar = document.getElementById('enqbar');
      if (!bar) return;
      bar.hidden = this.items.length === 0;
      document.getElementById('enq').textContent = 'Send enquiry list (' + this.items.length + ')';
    },
    send: function () {
      var t = 'Hi, I would like a quote for:\n' + this.items.map(function (i) {
        return '• ' + i.name + ' (' + i.brand + (i.model_code ? ', ' + i.model_code : '') + ') ' + inr(i.nrp);
      }).join('\n');
      window.open(wa(t), '_blank');
    }
  };

  var toastTimer;
  function toast(msg, isError) {
    var el = document.getElementById('toast');
    if (!el) { el = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' err' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3500);
  }

  // Enquiry / quote forms: save to the database, then open WhatsApp with the same details.
  function wireForm(form) {
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var type = form.getAttribute('data-type');
      var data = {
        type: type,
        name: form.elements.name.value.trim(),
        phone: form.elements.phone.value.trim(),
        message: form.elements.message.value.trim(),
        website: form.elements.website.value
      };
      var title = type === 'quote' ? 'Project quote request' : 'Enquiry';
      fetch('/api/enquiries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true
      }).then(function (r) {
        if (r.ok) { toast('Thank you! We have received your details.'); form.reset(); }
        else return r.json().then(function (j) { toast(j.error || 'Could not save your enquiry.', true); });
      }).catch(function () { /* WhatsApp message still goes through */ });
      // Opened straight away (not after the save) so phones do not block the pop-up.
      window.open(wa(title + '\nName: ' + data.name + '\nPhone: ' + data.phone + '\n' + data.message), '_blank');
    });
  }

  function initCommon() {
    List.load();
    var enq = document.getElementById('enq');
    if (enq) enq.addEventListener('click', function () { List.send(); });
    var clr = document.getElementById('enqClear');
    if (clr) clr.addEventListener('click', function () { if (confirm('Clear your enquiry list?')) List.clear(); });
    var fab = document.getElementById('fab');
    if (fab) fab.href = wa('Hi, I have an enquiry about your products.');
  }

  window.MM = { h: h, inr: inr, safeUrl: safeUrl, wa: wa, setWhatsApp: setWhatsApp, photo: photo, card: card, waText: waText, List: List, toast: toast, wireForm: wireForm, initCommon: initCommon };
})();

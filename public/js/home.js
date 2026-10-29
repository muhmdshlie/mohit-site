// Home page: loads all content from /api/site and products from /api/products.
(function () {
  'use strict';
  var h = MM.h, $ = function (id) { return document.getElementById(id); };
  var state = { cat: 'All', brand: 'All', page: 1, total: 0, loaded: 0 };
  var site = null, ctrl = null;

  function fill(el, nodes) { el.textContent = ''; nodes.forEach(function (n) { el.appendChild(n); }); }
  function telHref(p) { return 'tel:' + String(p || '').replace(/[^\d+]/g, ''); }

  function renderSettings(s) {
    document.querySelectorAll('[data-s]').forEach(function (el) {
      var v = s[el.getAttribute('data-s')];
      el.textContent = v == null ? '' : String(v);
    });
    MM.setWhatsApp(s.whatsapp);

    // Header logo
    var logo = $('logo');
    if (MM.safeUrl(s.logo)) fill(logo, [h('img', { src: s.logo, alt: s.shop_name })]);
    else logo.textContent = String(s.shop_name || '').toUpperCase();

    ['topPhone', 'contactPhone'].forEach(function (id) { $(id).textContent = s.phone; $(id).href = telHref(s.phone); });
    if (s.phone2) { $('phone2').textContent = s.phone2; $('phone2').href = telHref(s.phone2); $('phone2Line').hidden = false; }
    if (s.email) { $('email').textContent = s.email; $('email').href = 'mailto:' + s.email; $('emailLine').hidden = false; }
    if (MM.safeUrl(s.maps_link)) { $('mapLink').href = s.maps_link; $('mapWrap').hidden = false; }

    var socials = [['Instagram', s.instagram], ['Facebook', s.facebook], ['YouTube', s.youtube]]
      .filter(function (x) { return MM.safeUrl(x[1]); });
    if (socials.length) {
      var nodes = ['Follow us: '];
      socials.forEach(function (x, i) {
        if (i) nodes.push(' · ');
        nodes.push(h('a', { href: x[1], target: '_blank', rel: 'noopener' }, x[0]));
      });
      fill($('social'), nodes.map(function (n) { return typeof n === 'string' ? document.createTextNode(n) : n; }));
      $('social').hidden = false;
    }

    fill($('stats'), (s.stats || []).map(function (x) { return h('div', null, h('b', null, x.title), h('span', null, x.text)); }));
    fill($('why'), (s.why || []).map(function (x) { return h('div', null, h('b', null, x.title), h('br'), x.text); }));
    fill($('steps'), (s.steps || []).map(function (x) { return h('div', null, h('b', null, x.title), h('br'), x.text); }));

    fill($('aboutText'), String(s.about_text || '').split(/\n\s*\n/).filter(Boolean).map(function (p) { return h('p', { class: 'desc' }, p.trim()); }));
    var photos = (s.showroom_photos || []).filter(MM.safeUrl);
    if (photos.length === 1) fill($('showroom'), [h('div', { class: 'ph showroom' }, h('img', { src: photos[0], alt: s.shop_name + ' showroom' }))]);
    else if (photos.length > 1) fill($('showroom'), [h('div', { class: 'gallery' }, photos.map(function (p, i) { return h('img', { src: p, alt: s.shop_name + ' showroom photo ' + (i + 1), loading: 'lazy' }); }))]);
  }

  function chipRow(el, list, current, onPick) {
    fill(el, list.map(function (c) {
      return h('button', { class: 'chip' + (c === current ? ' on' : ''), type: 'button', onclick: function () { onPick(c); } }, c);
    }));
  }

  function renderChips() {
    chipRow($('cats'), ['All'].concat(site.categories.map(function (c) { return c.name; })), state.cat, setCat);
    chipRow($('brandChips'), ['All'].concat(site.brands.map(function (b) { return b.name; })), state.brand, setBrand);
  }

  function setCat(c) { state.cat = c; loadProducts(false); }
  function setBrand(b) { state.brand = b; loadProducts(false); $('shop').scrollIntoView(); }

  function renderStatic() {
    var s = site.settings;
    renderSettings(s);

    fill($('tiles'), site.categories.map(function (c) {
      return h('button', { class: 'tile', type: 'button', onclick: function () { setCat(c.name); $('shop').scrollIntoView(); } },
        MM.safeUrl(c.photo) ? h('img', { src: c.photo, alt: '', loading: 'lazy' }) : null, c.name);
    }));

    fill($('brandList'), site.brands.map(function (b) {
      return h('button', { class: 'chip', type: 'button', onclick: function () { setBrand(b.name); } },
        MM.safeUrl(b.photo) ? h('img', { src: b.photo, alt: '' }) : null, b.name);
    }));

    $('banners').hidden = site.offers.length === 0;
    fill($('banners'), site.offers.map(function (o) {
      return h('div', { class: 'banner' },
        MM.safeUrl(o.image) ? h('img', { src: o.image, alt: o.title, loading: 'lazy' }) : null,
        h('div', null, h('b', null, o.title), o.text ? h('p', null, o.text) : null));
    }));
    fill($('offerGrid'), site.offerProducts.map(MM.card));

    $('reviews').hidden = site.reviews.length === 0;
    fill($('reviewList'), site.reviews.map(function (r) {
      var stars = '★★★★★'.slice(0, r.stars) + '☆☆☆☆☆'.slice(0, 5 - r.stars);
      return h('div', { class: 'rev' }, h('span', { 'aria-label': r.stars + ' out of 5 stars' }, stars), h('br'), r.text, h('br'),
        h('small', null, r.name + (r.place ? ', ' + r.place : '')));
    }));

    $('faq').hidden = site.faqs.length === 0;
    fill($('faqList'), site.faqs.map(function (f) { return h('details', null, h('summary', null, f.question), h('p', { class: 'desc' }, f.answer)); }));

    renderChips();
  }

  // Products are searched and sorted on the server, 24 at a time.
  function loadProducts(append) {
    renderChips();
    state.page = append ? state.page + 1 : 1;
    var params = new URLSearchParams({ q: $('q').value.trim(), sort: $('sort').value, cat: state.cat, brand: state.brand, page: state.page });
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    fetch('/api/products?' + params, { signal: ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        var grid = $('grid');
        if (!append) grid.textContent = '';
        d.items.forEach(function (p) { grid.appendChild(MM.card(p)); });
        state.total = d.total;
        state.loaded = (append ? state.loaded : 0) + d.items.length;
        if (!d.total) grid.appendChild(h('p', null, 'No products match. Try another brand or search.'));
        $('count').textContent = d.total ? 'Showing ' + state.loaded + ' of ' + d.total + ' products' : '';
        $('more').hidden = state.loaded >= state.total;
      })
      .catch(function (e) { if (e.name !== 'AbortError') MM.toast('Could not load products. Please refresh the page.', true); });
  }

  var timer;
  $('q').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { loadProducts(false); }, 250); });
  $('sort').addEventListener('change', function () { loadProducts(false); });
  $('more').addEventListener('click', function () { loadProducts(true); });
  MM.wireForm($('quoteForm'));
  MM.wireForm($('enquiryForm'));

  fetch('/api/site')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      site = d;
      renderStatic();
      MM.initCommon();
      loadProducts(false);
    })
    .catch(function () { MM.toast('Could not load the page. Please refresh.', true); });
})();

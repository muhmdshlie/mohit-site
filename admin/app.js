// Admin panel app. Plain JavaScript, no framework.
// All text from the database is inserted with textContent (via h()), never as raw HTML.
(function () {
  'use strict';

  let CSRF = '';
  let SHOP = 'our shop';
  const $ = id => document.getElementById(id);
  const main = $('main');

  // ---------- helpers ----------

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }

  // Like el.append(), but skips null/false so optional parts never show up as the text "null".
  const put = (el, ...kids) => el.append(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false));

  async function api(method, url, body, isForm) {
    const opts = { method, credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF } };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    const r = await fetch('/admin/api' + url, opts);
    if (r.status === 401) { location.href = '/admin/login'; throw new Error('Please log in again.'); }
    let d = {};
    try { d = await r.json(); } catch { /* empty body */ }
    if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
    return d;
  }

  let toastTimer;
  function toast(msg, isError) {
    let el = $('toast');
    if (!el) { el = h('div', { id: 'toast', role: 'status' }); document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' err' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
  }

  const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const pct = (mrp, nrp) => (mrp > 0 && nrp < mrp ? Math.round(((mrp - nrp) / mrp) * 100) : 0);
  const safeImg = u => (/^(\/uploads\/|https:\/\/)/.test(String(u || '')) ? u : '');
  const fmtDate = s => {
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    return isNaN(d) ? s : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  const td = (label, ...kids) => h('td', { 'data-label': label }, ...kids);
  const qs = obj => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null)).toString();

  // WhatsApp needs the number with country code. 10-digit Indian numbers get 91 added.
  function waNumber(phone) {
    let d = String(phone).replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    if (d.length === 10) d = '91' + d;
    return d;
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function pager(total, page, perPage, go) {
    const pages = Math.max(1, Math.ceil(total / perPage));
    if (pages <= 1) return null;
    return h('div', { class: 'pager' },
      h('button', { class: 'btn ghost sm', type: 'button', disabled: page <= 1, onclick: () => go(page - 1) }, '‹ Prev'),
      h('span', { class: 'small muted' }, `Page ${page} of ${pages}`),
      h('button', { class: 'btn ghost sm', type: 'button', disabled: page >= pages, onclick: () => go(page + 1) }, 'Next ›'));
  }

  function table(headers, rows, emptyText) {
    if (!rows.length) return h('div', { class: 'panel empty' }, emptyText || 'Nothing here yet.');
    return h('table', { class: 'table' },
      h('thead', null, h('tr', null, headers.map(t => h('th', { class: /MRP|NRP|Off/.test(t) ? 'num' : null }, t)))),
      h('tbody', null, rows));
  }

  // ---------- image picker (upload straight away, keep the returned path) ----------

  function imagePicker(value, kind) {
    let current = value || '';
    const preview = h('div');
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    const status = h('span', { class: 'small muted' });
    const removeBtn = h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { current = ''; draw(); } }, 'Remove');
    const pickBtn = h('button', { type: 'button', class: 'btn out sm', onclick: () => file.click() }, 'Upload photo');

    function draw() {
      preview.textContent = '';
      preview.appendChild(safeImg(current) ? h('img', { src: current, alt: 'Preview' }) : h('div', { class: 'ph' }, 'No photo'));
      removeBtn.hidden = !current;
    }

    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return toast('Only JPG, PNG or WEBP images.', true);
      if (f.size > 5 * 1024 * 1024) return toast('Image is bigger than 5 MB.', true);
      status.textContent = 'Uploading…';
      pickBtn.disabled = true;
      try {
        const fd = new FormData();
        fd.append('image', f);
        current = (await api('POST', '/upload' + (kind ? '?kind=' + kind : ''), fd, true)).path;
        draw();
        status.textContent = '';
      } catch (e) { status.textContent = ''; toast(e.message, true); }
      pickBtn.disabled = false;
    });

    draw();
    return { el: h('div', { class: 'imgpick' }, preview, h('div', null, pickBtn, ' ', removeBtn, h('div', null, status)), file), get: () => current };
  }

  function imageList(values, max) {
    let list = (values || []).slice();
    const wrap = h('div', { class: 'imglist' });
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    const addBtn = h('button', { type: 'button', class: 'btn out sm', onclick: () => file.click() }, '+ Add photos');
    function draw() {
      wrap.textContent = '';
      list.forEach((p, i) => wrap.appendChild(h('figure', null, h('img', { src: p, alt: 'Photo ' + (i + 1) }),
        h('button', { type: 'button', 'aria-label': 'Remove photo', onclick: () => { list.splice(i, 1); draw(); } }, '×'))));
      addBtn.hidden = list.length >= max;
    }
    file.addEventListener('change', async () => {
      const files = [...file.files].slice(0, max - list.length);
      file.value = '';
      for (const f of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024) { toast(`${f.name}: only JPG/PNG/WEBP up to 5 MB.`, true); continue; }
        try {
          const fd = new FormData();
          fd.append('image', f);
          list.push((await api('POST', '/upload', fd, true)).path);
          draw();
        } catch (e) { toast(e.message, true); }
      }
    });
    draw();
    return { el: h('div', null, wrap, h('div', { class: 'small muted' }, `Up to ${max} photos.`), addBtn, file), get: () => list.slice() };
  }

  function pairsEditor(values, max, aLabel, bLabel) {
    const box = h('div', { class: 'pairs' });
    const addBtn = h('button', { type: 'button', class: 'btn out sm', onclick: () => { addRow({ title: '', text: '' }); } }, '+ Add row');
    function addRow(v) {
      const row = h('div', { class: 'pair' },
        h('input', { placeholder: aLabel, value: v.title, maxlength: 80, 'aria-label': aLabel }),
        h('input', { placeholder: bLabel, value: v.text, maxlength: 300, 'aria-label': bLabel }),
        h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': 'Remove row', onclick: () => { row.remove(); addBtn.hidden = false; } }, '×'));
      box.appendChild(row);
      addBtn.hidden = box.children.length >= max;
    }
    (values || []).forEach(addRow);
    return {
      el: h('div', null, box, addBtn),
      get: () => [...box.children].map(r => ({ title: r.children[0].value, text: r.children[1].value }))
    };
  }

  // ---------- form dialog ----------
  // fields: { name, label, type: text|textarea|number|select|checkbox|image|hint, required, options, max, hint, step }
  function openForm({ title, fields, values = {}, submitText = 'Save', onSave, afterRender }) {
    const dlg = $('dlg');
    const err = h('div', { class: 'error', role: 'alert', hidden: true });
    const getters = {};
    const body = h('div', { class: 'db' }, err);

    for (const f of fields) {
      const v = values[f.name];
      const id = 'f_' + f.name;
      if (f.type === 'hint') { body.appendChild(h('p', { class: 'small muted' }, f.text)); continue; }
      if (f.type === 'checkbox') {
        const input = h('input', { type: 'checkbox', id, checked: v === undefined ? f.default : v });
        getters[f.name] = () => input.checked;
        body.appendChild(h('label', { class: 'check', for: id }, input, f.label));
        continue;
      }
      let input;
      if (f.type === 'image') {
        const pick = imagePicker(v, f.kind);
        getters[f.name] = pick.get;
        input = pick.el;
      } else if (f.type === 'textarea') {
        input = h('textarea', { id, name: f.name, rows: f.rows || 4, maxlength: f.max, required: f.required, value: v ?? '' });
      } else if (f.type === 'select') {
        input = h('select', { id, name: f.name, required: f.required },
          f.placeholder ? h('option', { value: '' }, f.placeholder) : null,
          f.options.map(o => h('option', { value: String(o.value), selected: String(o.value) === String(v ?? f.default ?? '') }, o.label)));
      } else {
        input = h('input', {
          id, name: f.name, type: f.type || 'text', maxlength: f.max, required: f.required,
          min: f.type === 'number' ? (f.min ?? 0) : null, step: f.step, inputmode: f.type === 'number' ? 'decimal' : null,
          value: v ?? f.default ?? ''
        });
      }
      if (!getters[f.name]) getters[f.name] = () => (f.type === 'number' ? input.value : input.value.trim());
      body.appendChild(h('div', { class: 'field' },
        h('label', { for: f.type === 'image' ? null : id }, f.label + (f.required ? ' *' : '')), input,
        f.hint ? h('div', { class: 'hint' }, f.hint) : null));
    }

    const saveBtn = h('button', { class: 'btn', type: 'submit' }, submitText);
    const form = h('form', { method: 'dialog', novalidate: false },
      h('div', { class: 'dh' }, h('h2', null, title), h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
      body,
      h('div', { class: 'df' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Cancel'), saveBtn));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = {};
      for (const [k, g] of Object.entries(getters)) data[k] = g();
      err.hidden = true;
      saveBtn.disabled = true;
      try {
        await onSave(data);
        dlg.close();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        body.scrollTop = 0;
      }
      saveBtn.disabled = false;
    });

    dlg.textContent = '';
    dlg.appendChild(form);
    if (afterRender) afterRender(form);
    dlg.showModal();
    const first = form.querySelector('input:not([type=checkbox]):not([type=file]), textarea, select');
    if (first) first.focus();
  }

  function confirmDelete(what) { return confirm(`Delete ${what}? This cannot be undone.`); }

  // ---------- pages ----------

  async function refreshNewCount(n) {
    if (n === undefined) { try { n = (await api('GET', '/dashboard')).newEnquiries; } catch { return; } }
    $('newCount').textContent = n;
    $('newCount').hidden = !n;
  }

  // Dashboard
  async function pageDashboard() {
    const d = await api('GET', '/dashboard');
    refreshNewCount(d.newEnquiries);
    const stat = (n, label, href, hot) => h('a', { class: 'stat' + (hot && n ? ' hot' : ''), href }, h('b', null, n), label);
    put(main,
      h('div', { class: 'head' }, h('div', null, h('h1', null, 'Dashboard'), h('p', { class: 'muted' }, 'Welcome back. Here is a quick look at your website.'))),
      (d.sampleProducts || d.sampleReviews) ? h('div', { class: 'notice' },
        h('div', null, h('b', null, 'Demo data is still on your website. '),
          `${d.sampleProducts} sample products and ${d.sampleReviews} sample reviews. Delete them when your real data is in.`),
        h('button', { class: 'btn danger sm', type: 'button', onclick: async () => {
          if (!confirm('Delete ALL sample products and sample reviews?')) return;
          try { const r = await api('POST', '/samples/delete'); toast(`Deleted ${r.products} products and ${r.reviews} reviews.`); route(); } catch (e) { toast(e.message, true); }
        } }, 'Delete all sample data')) : null,
      h('div', { class: 'stats' },
        stat(d.newEnquiries, 'New enquiries', '#/enquiries', true),
        stat(d.enquiries, 'All enquiries', '#/enquiries'),
        stat(d.products, 'Products', '#/products'),
        stat(d.outOfStock, 'Out of stock', '#/products'),
        stat(d.brands, 'Brands', '#/brands'),
        stat(d.categories, 'Categories', '#/categories')),
      h('div', { class: 'panel' }, h('h2', null, 'Latest enquiries'),
        d.recent.length ? h('div', null, d.recent.map(e => h('p', null,
          h('span', { class: 'tag ' + e.status }, e.status), ' ', h('b', null, e.name), ' · ', e.phone, ' · ',
          h('span', { class: 'muted small' }, fmtDate(e.created_at)), h('br'), h('span', { class: 'small' }, cut(e.message || '(no message)', 140)))),
          h('a', { href: '#/enquiries' }, 'See all enquiries →'))
          : h('p', { class: 'muted' }, 'No enquiries yet.')));
  }

  // Enquiries
  const enqState = { status: '', q: '', page: 1 };
  async function pageEnquiries() {
    const list = h('div');
    const tabs = h('div', { class: 'tabs' }, [['', 'All'], ['new', 'New'], ['done', 'Done']].map(([v, l]) =>
      h('button', { type: 'button', class: enqState.status === v ? 'on' : '', onclick: () => { enqState.status = v; enqState.page = 1; route(); } }, l)));
    const search = h('input', { type: 'search', placeholder: 'Search name, phone or message', value: enqState.q, 'aria-label': 'Search enquiries',
      oninput: debounce(() => { enqState.q = search.value; enqState.page = 1; load(); }, 300) });
    main.append(h('div', { class: 'head' }, h('h1', null, 'Enquiries')), h('div', { class: 'tools' }, tabs, search), list);

    async function load() {
      const d = await api('GET', '/enquiries?' + qs(enqState));
      list.textContent = '';
      const rows = d.items.map(e => {
        const reply = `Hi ${e.name}, thank you for your ${e.type === 'quote' ? 'project quote request' : 'enquiry'} at ${SHOP}. `;
        return h('tr', null,
          td('Date', h('span', { class: 'small' }, fmtDate(e.created_at))),
          td('Type', h('span', { class: 'tag' }, e.type === 'quote' ? 'Builder quote' : 'Enquiry')),
          td('Name', h('b', null, e.name)),
          td('Phone', h('a', { href: 'tel:' + e.phone.replace(/[^\d+]/g, '') }, e.phone)),
          td('Message', h('div', { class: 'msg small' }, e.message || '—')),
          td('Status', h('span', { class: 'tag ' + e.status }, e.status)),
          h('td', { class: 'acts' },
            h('a', { class: 'btn wa sm', target: '_blank', rel: 'noopener', href: `https://wa.me/${waNumber(e.phone)}?text=${encodeURIComponent(reply)}` }, 'Reply on WhatsApp'),
            h('button', { class: 'btn out sm', type: 'button', onclick: async () => {
              try { await api('PATCH', '/enquiries/' + e.id, { status: e.status === 'new' ? 'done' : 'new' }); refreshNewCount(); load(); } catch (ex) { toast(ex.message, true); }
            } }, e.status === 'new' ? 'Mark done' : 'Mark new'),
            h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Delete enquiry', onclick: async () => {
              if (!confirmDelete('this enquiry')) return;
              try { await api('DELETE', '/enquiries/' + e.id); refreshNewCount(); load(); } catch (ex) { toast(ex.message, true); }
            } }, 'Delete')));
      });
      put(list,
        h('p', { class: 'small muted' }, `${d.total} enquir${d.total === 1 ? 'y' : 'ies'}`),
        table(['Date', 'Type', 'Name', 'Phone', 'Message', 'Status', ''], rows, 'No enquiries found.'),
        pager(d.total, d.page, d.perPage, p => { enqState.page = p; load(); }));
    }
    await load();
  }

  // Products
  const prodState = { q: '', brand: '', category: '', sample: '', page: 1 };
  async function pageProducts() {
    const [brands, cats] = await Promise.all([api('GET', '/brands'), api('GET', '/categories')]);
    const list = h('div');
    const search = h('input', { type: 'search', placeholder: 'Search name or model code', value: prodState.q, 'aria-label': 'Search products',
      oninput: debounce(() => { prodState.q = search.value; prodState.page = 1; load(); }, 300) });
    const filter = (key, items, label) => h('select', { 'aria-label': label, onchange: e => { prodState[key] = e.target.value; prodState.page = 1; load(); } },
      h('option', { value: '' }, label), items.map(i => h('option', { value: i.name, selected: prodState[key] === i.name }, i.name)));
    const sampleSel = h('select', { 'aria-label': 'Show', onchange: e => { prodState.sample = e.target.value; prodState.page = 1; load(); } },
      h('option', { value: '' }, 'All products'), h('option', { value: '1', selected: prodState.sample === '1' }, 'Samples only'));

    main.append(
      h('div', { class: 'head' }, h('h1', null, 'Products'),
        h('div', { class: 'tools' },
          h('button', { class: 'btn', type: 'button', onclick: () => editProduct(null) }, '+ Add product'),
          h('button', { class: 'btn out', type: 'button', onclick: importDialog }, 'Import CSV / Excel'),
          h('a', { class: 'btn ghost', href: '/admin/api/products/export?format=xlsx' }, 'Export Excel'),
          h('a', { class: 'btn ghost', href: '/admin/api/products/export?format=csv' }, 'Export CSV'))),
      h('div', { class: 'tools' }, search, filter('brand', brands.items, 'All brands'), filter('category', cats.items, 'All categories'), sampleSel),
      list);

    async function load() {
      const d = await api('GET', '/products?' + qs(prodState));
      list.textContent = '';
      const rows = d.items.map(p => h('tr', null,
        td('Photo', safeImg(p.photo) ? h('img', { class: 'thumb', src: p.photo, alt: '' }) : h('span', { class: 'thumb' })),
        td('Product', h('div', null, h('b', null, p.name), p.is_sample ? [' ', h('span', { class: 'tag sample' }, 'SAMPLE')] : null,
          h('div', { class: 'small muted' }, p.model_code || 'no model code'))),
        td('Brand', p.brand),
        td('Category', p.category),
        h('td', { class: 'num', 'data-label': 'MRP' }, inr(p.mrp)),
        h('td', { class: 'num', 'data-label': 'NRP' }, h('b', null, inr(p.nrp))),
        h('td', { class: 'num', 'data-label': 'Off' }, p.discount ? h('span', { class: 'tag off' }, p.discount + '%') : '—'),
        td('Status', h('span', { class: 'tag' + (p.in_stock ? ' done' : ' new') }, p.in_stock ? 'In stock' : 'Out of stock'),
          p.featured ? [' ', h('span', { class: 'tag' }, '★ Featured')] : null),
        h('td', { class: 'acts' },
          h('button', { class: 'btn sm', type: 'button', onclick: () => editProduct(p.id) }, 'Edit'),
          h('a', { class: 'btn ghost sm', href: '/product/' + encodeURIComponent(p.slug), target: '_blank', rel: 'noopener' }, 'View'),
          h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => {
            if (!confirmDelete(`"${p.name}"`)) return;
            try { await api('DELETE', '/products/' + p.id); toast('Product deleted'); load(); } catch (e) { toast(e.message, true); }
          } }, 'Delete'))));
      put(list,
        h('p', { class: 'small muted' }, `${d.total} product${d.total === 1 ? '' : 's'}`),
        table(['Photo', 'Product', 'Brand', 'Category', 'MRP', 'NRP', 'Off', 'Status', ''], rows, 'No products found.'),
        pager(d.total, d.page, d.perPage, p => { prodState.page = p; load(); window.scrollTo(0, 0); }));
    }

    async function editProduct(id) {
      if (!brands.items.length || !cats.items.length) return toast('Add at least one brand and one category first.', true);
      const p = id ? await api('GET', '/products/' + id) : {};
      openForm({
        title: id ? 'Edit product' : 'Add product',
        values: p,
        fields: [
          { name: 'name', label: 'Product name', required: true, max: 150 },
          { name: 'model_code', label: 'Model code', max: 60, hint: 'Used to match products when you import a price list.' },
          { name: 'brand_id', label: 'Brand', type: 'select', required: true, placeholder: 'Choose brand', options: brands.items.map(b => ({ value: b.id, label: b.name })) },
          { name: 'category_id', label: 'Category', type: 'select', required: true, placeholder: 'Choose category', options: cats.items.map(c => ({ value: c.id, label: c.name })) },
          { name: 'mrp', label: 'MRP (₹)', type: 'number', required: true, step: '0.01' },
          { name: 'nrp', label: 'NRP – our price (₹)', type: 'number', required: true, step: '0.01', hint: ' ' },
          { name: 'description', label: 'Description', type: 'textarea', max: 5000 },
          { name: 'specs', label: 'Specifications', type: 'textarea', max: 5000, hint: 'One per line, like  Finish: Chrome' },
          { name: 'photo', label: 'Photo', type: 'image' },
          { name: 'in_stock', label: 'In stock', type: 'checkbox', default: true },
          { name: 'featured', label: 'Featured (show in Offers & deals)', type: 'checkbox', default: false }
        ],
        afterRender(form) {
          // Show the discount live while typing.
          const mrp = form.querySelector('[name=mrp]'), nrp = form.querySelector('[name=nrp]');
          const hint = nrp.parentElement.querySelector('.hint');
          hint.classList.add('disc');
          const upd = () => {
            const m = parseFloat(mrp.value), n = parseFloat(nrp.value);
            hint.textContent = m > 0 && n >= 0 ? (n > m ? 'NRP is more than MRP' : `Discount: ${pct(m, n)}% · customer saves ${inr(m - n)}`) : ' ';
          };
          mrp.addEventListener('input', upd); nrp.addEventListener('input', upd); upd();
        },
        async onSave(data) {
          if (id) await api('PUT', '/products/' + id, data); else await api('POST', '/products', data);
          toast(id ? 'Product saved' : 'Product added');
          load();
        }
      });
    }

    function importDialog() {
      const dlg = $('dlg');
      const file = h('input', { type: 'file', accept: '.csv,.xlsx', required: true });
      const out = h('div');
      const checkBtn = h('button', { class: 'btn out', type: 'button' }, '1. Check file');
      const importBtn = h('button', { class: 'btn', type: 'button', disabled: true }, '2. Import now');
      let changed = false;

      async function send(dry) {
        const f = file.files[0];
        if (!f) return toast('Choose a file first.', true);
        const fd = new FormData();
        fd.append('file', f);
        checkBtn.disabled = importBtn.disabled = true;
        out.textContent = dry ? 'Checking…' : 'Importing…';
        try {
          const r = await api('POST', '/products/import' + (dry ? '?dry=1' : ''), fd, true);
          out.textContent = '';
          out.append(h('div', { class: 'result' },
            h('b', null, dry ? 'Check result (nothing saved yet)' : 'Import finished'),
            h('div', null, `Rows in file: ${r.total}. ${dry ? 'Will add' : 'Added'}: ${r.created}. ${dry ? 'Will update' : 'Updated'}: ${r.updated}. Rows with problems (skipped): ${r.errors.length + (r.moreErrors || 0)}.`),
            h('div', { class: 'small muted' }, 'Columns found: ' + r.columns.join(', ')),
            r.newBrands.length ? h('div', { class: 'small' }, `New brands ${dry ? 'to be created' : 'created'}: ${r.newBrands.join(', ')}`) : null,
            r.newCategories.length ? h('div', { class: 'small' }, `New categories ${dry ? 'to be created' : 'created'}: ${r.newCategories.join(', ')}`) : null,
            r.errors.length ? h('ul', { class: 'small' }, r.errors.map(e => h('li', null, `Row ${e.row}: ${e.message}`)),
              r.moreErrors ? h('li', null, `…and ${r.moreErrors} more`) : null) : null));
          if (!dry) { changed = true; toast('Import finished'); }
          importBtn.disabled = !dry || r.created + r.updated === 0;
        } catch (e) { out.textContent = ''; out.append(h('div', { class: 'error' }, e.message)); }
        checkBtn.disabled = false;
      }
      checkBtn.addEventListener('click', () => send(true));
      importBtn.addEventListener('click', () => send(false));
      file.addEventListener('change', () => { importBtn.disabled = true; out.textContent = ''; });

      dlg.textContent = '';
      dlg.append(h('form', { method: 'dialog' },
        h('div', { class: 'dh' }, h('h2', null, 'Import products'), h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
        h('div', { class: 'db' },
          h('p', { class: 'small' }, 'Upload a .csv or .xlsx file (max 10 MB). Row 1 must have column names: ',
            h('b', null, 'Name, Brand, Model Code, Category, MRP, NRP'), ', and optionally Description, Specs, Photo, In Stock, Featured.'),
          h('p', { class: 'small muted' }, 'Products are matched by Model Code: a match is updated, otherwise a new product is added. Empty cells keep the current value, so a file with only Model Code, MRP and NRP just updates prices. Tip: click "Export Excel" first to get a ready-made template.'),
          h('div', { class: 'field' }, file), out),
        h('div', { class: 'df' }, checkBtn, importBtn)));
      dlg.addEventListener('close', () => { if (changed) load(); }, { once: true });
      dlg.showModal();
    }

    await load();
  }

  // Simple tables: brands, categories, offers, reviews, faqs
  const SIMPLE = {
    brands: {
      title: 'Brands', one: 'brand', empty: 'No brands yet.',
      headers: ['Logo', 'Name', 'Products', 'Order'],
      row: b => [td('Logo', safeImg(b.photo) ? h('img', { class: 'thumb', src: b.photo, alt: '' }) : h('span', { class: 'thumb' })),
        td('Name', h('b', null, b.name)), td('Products', String(b.product_count)), td('Order', String(b.sort_order))],
      fields: [{ name: 'name', label: 'Brand name', required: true, max: 60 }, { name: 'photo', label: 'Logo', type: 'image', kind: 'logo' },
        { name: 'sort_order', label: 'Order (lower shows first)', type: 'number', default: 0 }],
      label: b => b.name
    },
    categories: {
      title: 'Categories', one: 'category', empty: 'No categories yet.',
      headers: ['Photo', 'Name', 'Products', 'Order'],
      row: c => [td('Photo', safeImg(c.photo) ? h('img', { class: 'thumb', src: c.photo, alt: '' }) : h('span', { class: 'thumb' })),
        td('Name', h('b', null, c.name)), td('Products', String(c.product_count)), td('Order', String(c.sort_order))],
      fields: [{ name: 'name', label: 'Category name', required: true, max: 60 }, { name: 'photo', label: 'Photo or icon', type: 'image', kind: 'logo' },
        { name: 'sort_order', label: 'Order (lower shows first)', type: 'number', default: 0 }],
      label: c => c.name
    },
    offers: {
      title: 'Offers & banners', one: 'offer', empty: 'No offers yet. Active offers show at the top of the "Offers & deals" section.',
      headers: ['Image', 'Title', 'Text', 'Status', 'Order'],
      row: o => [td('Image', safeImg(o.image) ? h('img', { class: 'thumb', src: o.image, alt: '' }) : h('span', { class: 'thumb' })),
        td('Title', h('b', null, o.title)), td('Text', h('span', { class: 'small' }, cut(o.text, 90))),
        td('Status', h('span', { class: 'tag' + (o.active ? ' done' : '') }, o.active ? 'Active' : 'Hidden')), td('Order', String(o.sort_order))],
      fields: [{ name: 'title', label: 'Title', required: true, max: 120 }, { name: 'text', label: 'Text', type: 'textarea', max: 500 },
        { name: 'image', label: 'Banner image', type: 'image' }, { name: 'active', label: 'Active (show on website)', type: 'checkbox', default: true },
        { name: 'sort_order', label: 'Order (lower shows first)', type: 'number', default: 0 }],
      label: o => o.title
    },
    reviews: {
      title: 'Reviews', one: 'review', empty: 'No reviews yet.',
      headers: ['Name', 'Stars', 'Review', 'Status', 'Order'],
      row: r => [td('Name', h('b', null, r.name), r.place ? h('div', { class: 'small muted' }, r.place) : null),
        td('Stars', '★'.repeat(r.stars)), td('Review', h('span', { class: 'small' }, cut(r.text, 110))),
        td('Status', h('span', { class: 'tag' + (r.visible ? ' done' : '') }, r.visible ? 'Shown' : 'Hidden'), r.is_sample ? [' ', h('span', { class: 'tag sample' }, 'SAMPLE')] : null),
        td('Order', String(r.sort_order))],
      fields: [{ name: 'name', label: 'Customer name', required: true, max: 80 }, { name: 'place', label: 'Area / place', max: 80 },
        { name: 'text', label: 'Review', type: 'textarea', required: true, max: 1000 },
        { name: 'stars', label: 'Stars', type: 'select', default: 5, options: [5, 4, 3, 2, 1].map(n => ({ value: n, label: '★'.repeat(n) + ` (${n})` })) },
        { name: 'visible', label: 'Show on website', type: 'checkbox', default: true },
        { name: 'sort_order', label: 'Order (lower shows first)', type: 'number', default: 0 }],
      label: r => `the review by ${r.name}`
    },
    faqs: {
      title: 'FAQs', one: 'FAQ', empty: 'No questions yet.',
      headers: ['Question', 'Answer', 'Order'],
      row: f => [td('Question', h('b', null, f.question)), td('Answer', h('span', { class: 'small' }, cut(f.answer, 120))), td('Order', String(f.sort_order))],
      fields: [{ name: 'question', label: 'Question', required: true, max: 300 }, { name: 'answer', label: 'Answer', type: 'textarea', required: true, max: 2000 },
        { name: 'sort_order', label: 'Order (lower shows first)', type: 'number', default: 0 }],
      label: f => 'this question'
    }
  };

  function simplePage(key) {
    return async function () {
      const cfg = SIMPLE[key];
      let q = '';
      const list = h('div');
      const edit = item => openForm({
        title: (item ? 'Edit ' : 'Add ') + cfg.one,
        values: item || {},
        fields: cfg.fields,
        async onSave(data) {
          if (item) await api('PUT', `/${key}/${item.id}`, data); else await api('POST', `/${key}`, data);
          toast('Saved');
          load();
        }
      });
      const search = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search ' + cfg.title, oninput: debounce(() => { q = search.value; load(); }, 300) });
      main.append(
        h('div', { class: 'head' }, h('h1', null, cfg.title), h('button', { class: 'btn', type: 'button', onclick: () => edit(null) }, '+ Add ' + cfg.one)),
        h('div', { class: 'tools' }, search), list);

      async function load() {
        const d = await api('GET', `/${key}?` + qs({ q }));
        list.textContent = '';
        list.append(table(cfg.headers.concat(''), d.items.map(item => h('tr', null, cfg.row(item),
          h('td', { class: 'acts' },
            h('button', { class: 'btn sm', type: 'button', onclick: () => edit(item) }, 'Edit'),
            h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => {
              if (!confirmDelete(cfg.label(item))) return;
              try { await api('DELETE', `/${key}/${item.id}`); toast('Deleted'); load(); } catch (e) { toast(e.message, true); }
            } }, 'Delete')))), cfg.empty));
      }
      await load();
    };
  }

  // Site settings
  async function pageSettings() {
    const { values, fields } = await api('GET', '/settings');
    const getters = {};
    const groups = {};
    const err = h('div', { class: 'error', role: 'alert', hidden: true });

    for (const f of fields) {
      const v = values[f.key];
      const id = 's_' + f.key;
      let input, get;
      switch (f.type) {
        case 'textarea': input = h('textarea', { id, rows: f.max > 500 ? 7 : 3, maxlength: f.max, value: v }); break;
        case 'color': input = h('input', { id, type: 'color', value: v }); break;
        case 'url': input = h('input', { id, type: 'url', placeholder: 'https://', value: v, maxlength: 500 }); break;
        case 'email': input = h('input', { id, type: 'email', value: v, maxlength: 200 }); break;
        case 'phone': case 'whatsapp': input = h('input', { id, type: 'tel', value: v, maxlength: 30 }); break;
        case 'image': { const p = imagePicker(v, f.key === 'logo' ? 'logo' : ''); input = p.el; get = p.get; break; }
        case 'images': { const p = imageList(v, f.max); input = p.el; get = p.get; break; }
        case 'pairs': { const p = pairsEditor(v, f.max, f.a, f.b); input = p.el; get = p.get; break; }
        default: input = h('input', { id, value: v, maxlength: f.max });
      }
      getters[f.key] = get || (() => input.value.trim());
      (groups[f.group] = groups[f.group] || []).push(h('div', { class: 'field' },
        h('label', { for: ['image', 'images', 'pairs'].includes(f.type) ? null : id }, f.label), input));
    }

    const saveBtn = h('button', { class: 'btn', type: 'submit' }, 'Save all settings');
    const form = h('form', null, err,
      Object.entries(groups).map(([g, items]) => h('fieldset', null, h('legend', null, g), items)),
      h('div', { class: 'savebar' }, saveBtn, h('span', { class: 'small muted' }, 'Changes show on the website straight away.')));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = {};
      for (const [k, g] of Object.entries(getters)) data[k] = g();
      saveBtn.disabled = true;
      err.hidden = true;
      try {
        await api('PUT', '/settings', data);
        SHOP = data.shop_name || SHOP;
        toast('Settings saved');
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        window.scrollTo(0, 0);
        toast('Not saved – please fix the error shown at the top.', true);
      }
      saveBtn.disabled = false;
    });
    main.append(h('div', { class: 'head' }, h('div', null, h('h1', null, 'Site settings'),
      h('p', { class: 'muted' }, 'Every text, contact detail, photo and colour on the website.'))), form);
  }

  // Change password
  async function pageAccount() {
    const err = h('div', { class: 'error', role: 'alert', hidden: true });
    const cur = h('input', { id: 'pw_cur', type: 'password', autocomplete: 'current-password', required: true });
    const next = h('input', { id: 'pw_new', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 });
    const again = h('input', { id: 'pw_again', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 });
    const form = h('form', { class: 'panel' }, err,
      h('div', { class: 'field' }, h('label', { for: 'pw_cur' }, 'Current password'), cur),
      h('div', { class: 'field' }, h('label', { for: 'pw_new' }, 'New password (at least 10 characters)'), next),
      h('div', { class: 'field' }, h('label', { for: 'pw_again' }, 'New password again'), again),
      h('button', { class: 'btn', type: 'submit' }, 'Change password'));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      if (next.value !== again.value) { err.textContent = 'The new passwords do not match.'; err.hidden = false; return; }
      try {
        await api('POST', '/password', { current: cur.value, next: next.value });
        form.reset();
        toast('Password changed');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
    main.append(h('div', { class: 'head' }, h('h1', null, 'Change password')), form);
  }

  // ---------- router ----------

  const PAGES = {
    dashboard: ['Dashboard', pageDashboard],
    enquiries: ['Enquiries', pageEnquiries],
    products: ['Products', pageProducts],
    brands: ['Brands', simplePage('brands')],
    categories: ['Categories', simplePage('categories')],
    offers: ['Offers & banners', simplePage('offers')],
    reviews: ['Reviews', simplePage('reviews')],
    faqs: ['FAQs', simplePage('faqs')],
    settings: ['Site settings', pageSettings],
    account: ['Change password', pageAccount]
  };

  async function route() {
    const key = (location.hash.match(/^#\/(\w+)/) || [])[1];
    const page = PAGES[key] ? key : 'dashboard';
    document.querySelectorAll('.side a[data-page]').forEach(a => a.classList.toggle('on', a.dataset.page === page));
    $('topTitle').textContent = PAGES[page][0];
    document.title = PAGES[page][0] + ' – Admin';
    $('side').classList.remove('open');
    if ($('dlg').open) $('dlg').close();
    main.textContent = '';
    try { await PAGES[page][1](); } catch (e) { main.append(h('div', { class: 'error' }, e.message)); }
  }

  // ---------- start ----------

  $('menuBtn').addEventListener('click', e => { e.stopPropagation(); $('side').classList.toggle('open'); });
  document.addEventListener('click', e => { if ($('side').classList.contains('open') && !$('side').contains(e.target)) $('side').classList.remove('open'); });
  $('logout').addEventListener('click', async e => {
    e.preventDefault();
    try { await api('POST', '/logout'); } catch { /* ignore */ }
    location.href = '/admin/login';
  });
  window.addEventListener('hashchange', route);

  (async function start() {
    try {
      const me = await api('GET', '/me');
      CSRF = me.csrf;
      $('who').textContent = 'Logged in as ' + me.username;
      api('GET', '/settings').then(s => { SHOP = s.values.shop_name || SHOP; }).catch(() => {});
      refreshNewCount();
      route();
    } catch (e) { main.append(h('div', { class: 'error' }, e.message)); }
  })();
})();

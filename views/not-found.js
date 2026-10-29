// "Page not found" page.
const { layout } = require('./layout');

module.exports = function renderNotFound(s) {
  return layout({
    s,
    title: `Page not found | ${s.shop_name}`,
    description: 'This page does not exist.',
    head: '<meta name="robots" content="noindex">',
    body: `<section><div class="wrap"><h2>Page not found</h2>
<p class="sub">This product or page may have been removed.</p>
<a class="btn wa" href="/#shop">Browse all products</a></div></section>`,
    scripts: ['/js/product.js']
  });
};

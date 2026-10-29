// Product page: "Add to list" buttons and the shared enquiry list / WhatsApp button.
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-add]');
    if (!btn) return;
    try { MM.List.add(JSON.parse(btn.getAttribute('data-add'))); } catch (err) { /* ignore bad data */ }
  });
  MM.initCommon();
})();

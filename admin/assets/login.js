// Admin login form.
(function () {
  'use strict';
  var form = document.getElementById('loginForm');
  var err = document.getElementById('err');
  var btn = document.getElementById('btn');
  var csrf = '';

  function showError(msg) { err.textContent = msg; err.hidden = false; }

  fetch('/admin/api/csrf', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) { csrf = d.csrf; })
    .catch(function () { showError('Cannot reach the server.'); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true;
    fetch('/admin/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ username: form.username.value, password: form.password.value })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok) { location.href = '/admin'; return; }
        showError(res.d.error || 'Login failed.');
        form.password.value = '';
        form.password.focus();
      })
      .catch(function () { showError('Cannot reach the server.'); })
      .finally(function () { btn.disabled = false; });
  });
})();

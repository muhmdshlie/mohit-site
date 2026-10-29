// Admin login, route protection and CSRF protection.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const BCRYPT_ROUNDS = 12;

// Creates the first admin from .env if the admins table is empty.
function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count > 0) {
    // Changing ADMIN_PASSWORD later does nothing, which surprises people. Say so.
    if (process.env.ADMIN_PASSWORD) {
      console.log('Note: an admin account already exists, so ADMIN_PASSWORD in .env is not used any more.');
      console.log('      Remove it from .env. To change the password use the admin panel or "npm run reset-password".');
    }
    return;
  }
  const username = (process.env.ADMIN_USERNAME || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!username || password.length < 10) {
    console.error('\nNo admin account yet. Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 10 characters) in .env, then start again.\n');
    process.exit(1);
  }
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
    .run(username, bcrypt.hashSync(password, BCRYPT_ROUNDS));
  console.log(`Admin account "${username}" created. Log in at /admin with this username and the ADMIN_PASSWORD from .env.`);
  console.log('Then remove ADMIN_PASSWORD from .env (it is only used this first time).');
}

// A real hash to compare against when the username does not exist,
// so a wrong username takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

async function checkLogin(username, password) {
  const admin = db.prepare('SELECT id, username, password_hash, role FROM admins WHERE username = ?').get(username);
  const ok = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !ok) return null;
  db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);
  return { id: admin.id, username: admin.username, role: admin.role };
}

async function changePassword(adminId, current, next) {
  const admin = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(adminId);
  if (!admin || !(await bcrypt.compare(current, admin.password_hash))) return false;
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(next, BCRYPT_ROUNDS), adminId);
  return true;
}

function setPassword(username, password) {
  return db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?')
    .run(bcrypt.hashSync(password, BCRYPT_ROUNDS), username).changes > 0;
}

// Checks the logged-in admin still exists (e.g. not deleted after login).
function currentAdmin(req) {
  const id = req.session?.adminId;
  if (!id) return null;
  return db.prepare('SELECT id, username, role FROM admins WHERE id = ?').get(id) || null;
}

// For admin JSON API routes: answer 401 instead of redirecting.
function requireAdminApi(req, res, next) {
  const admin = currentAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Please log in again.' });
  req.admin = admin;
  next();
}

// For admin pages: send to the login page.
function requireAdminPage(req, res, next) {
  const admin = currentAdmin(req);
  if (!admin) return res.redirect('/admin/login');
  req.admin = admin;
  next();
}

// CSRF: each session gets a random token. The admin page sends it back in the
// X-CSRF-Token header on every request that changes something.
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = String(req.get('X-CSRF-Token') || '');
  const expected = req.session?.csrf || '';
  const ok = sent.length === expected.length && expected.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).json({ error: 'Security check failed. Please reload the page.' });
  next();
}

module.exports = { ensureAdmin, checkLogin, changePassword, setPassword, requireAdminApi, requireAdminPage, csrfToken, verifyCsrf };

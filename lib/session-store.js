// Keeps login sessions in the SQLite database so you stay logged in after a restart.
const session = require('express-session');
const db = require('../db');

class SqliteStore extends session.Store {
  constructor() {
    super();
    this.q = {
      get: db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expires > ?'),
      set: db.prepare('INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires'),
      touch: db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
      destroy: db.prepare('DELETE FROM sessions WHERE sid = ?'),
      clean: db.prepare('DELETE FROM sessions WHERE expires <= ?')
    };
    this.q.clean.run(Date.now());
    setInterval(() => this.q.clean.run(Date.now()), 60 * 60 * 1000).unref();
  }

  expiry(sess) {
    return sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 8 * 3600 * 1000;
  }

  get(sid, cb) {
    try {
      const row = this.q.get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try { this.q.set.run(sid, JSON.stringify(sess), this.expiry(sess)); cb?.(null); } catch (e) { cb?.(e); }
  }

  touch(sid, sess, cb) {
    try { this.q.touch.run(this.expiry(sess), sid); cb?.(null); } catch (e) { cb?.(e); }
  }

  destroy(sid, cb) {
    try { this.q.destroy.run(sid); cb?.(null); } catch (e) { cb?.(e); }
  }
}

module.exports = SqliteStore;

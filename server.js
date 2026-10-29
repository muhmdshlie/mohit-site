// Mohit Marketing website + admin panel.
// Start with:  npm start   (then open http://localhost:3000 and http://localhost:3000/admin)
const path = require('path');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env file: use real environment variables */ }

const SECRET = process.env.SESSION_SECRET || '';
if (SECRET.length < 32) {
  console.error('\nSESSION_SECRET in .env is missing or too short (needs 32+ characters).');
  console.error('Make one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
  process.exit(1);
}

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const SqliteStore = require('./lib/session-store');
const { ensureAdmin } = require('./lib/auth');
const { getSettings } = require('./lib/settings');
const seed = require('./db/seed');
const renderNotFound = require('./views/not-found');

const isProd = process.env.NODE_ENV === 'production';
const app = express();

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// Security headers. Scripts and styles may only come from this site (no inline code).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'object-src': ["'none'"],
      'upgrade-insecure-requests': isProd ? [] : null
    }
  },
  strictTransportSecurity: isProd,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '200kb' }));

app.use(session({
  name: 'mm.sid',
  secret: SECRET,
  store: new SqliteStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,              // HTTPS-only cookies when live
    maxAge: 8 * 60 * 60 * 1000   // logged out after 8 hours without activity
  }
}));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { index: false, dotfiles: 'ignore', maxAge: '30d', immutable: true }));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { index: false }));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { index: false }));
app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { index: false }));

// Routes
app.use('/admin', require('./routes/admin'));
app.use(require('./routes/public'));

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).type('html').send(renderNotFound(getSettings()));
});

// Errors: log the details, show the visitor a plain message.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

ensureAdmin();
const added = seed();
if (added.length) console.log(`Added demo data: ${added.join(', ')}.`);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\nWebsite:     http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin\n`);
});

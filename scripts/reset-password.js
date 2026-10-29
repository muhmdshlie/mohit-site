// Reset the admin password from the command line (if you forget it).
// Usage:  npm run reset-password
const readline = require('readline/promises');
const db = require('../db');
const { setPassword } = require('../lib/auth');

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const admins = db.prepare('SELECT username FROM admins ORDER BY id').all().map(a => a.username);
  if (!admins.length) {
    console.log('No admin account yet. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env and run "npm start".');
    process.exit(1);
  }
  console.log('Admin accounts: ' + admins.join(', '));
  const username = (await rl.question(`Username [${admins[0]}]: `)).trim() || admins[0];
  const password = await rl.question('New password (at least 10 characters): ');
  rl.close();
  if (password.length < 10) { console.log('Password too short. Nothing changed.'); process.exit(1); }
  if (!setPassword(username, password)) { console.log(`No admin called "${username}". Nothing changed.`); process.exit(1); }
  db.prepare('DELETE FROM sessions').run(); // log out everywhere
  console.log(`Password for "${username}" changed. All devices have been logged out.`);
  console.log('Tip: clear your terminal history if you typed the password where others can see it.');
})();

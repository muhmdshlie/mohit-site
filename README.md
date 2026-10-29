# Mohit Marketing – website + admin panel

Website for Mohit Marketing (authorised Jaquar dealer, Bangalore) with an admin panel,
so every product, price, text and photo can be changed without touching code.

- **Stack:** Node.js + Express, SQLite (better-sqlite3), plain HTML/CSS/JS. No framework, no build step.
- **Public site:** `http://localhost:3000`
- **Admin panel:** `http://localhost:3000/admin`

---

## 1. First-time setup (Windows)

You need **Node.js 20.12 or newer** (check with `node -v`).

```powershell
cd "C:\Users\SAHAL\Downloads\mohit site"
npm install
copy .env.example .env      # skip if .env already exists
notepad .env
```

In `.env`, fill in:

| Setting | What to put |
|---|---|
| `SESSION_SECRET` | Long random text. Make one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_USERNAME` | Your admin login name |
| `ADMIN_PASSWORD` | Your admin password (10+ characters). Only used on the very first start. |

Then start the site:

```powershell
npm start
```

On the first start the server:
1. creates the database file `data/mohit.db`,
2. creates your admin account (password stored as a bcrypt hash),
3. adds the demo data from the old `showroom.html`.

**Your first login:** open `http://localhost:3000/admin` and log in with the `ADMIN_USERNAME` and
`ADMIN_PASSWORD` from `.env`.

After that first start you can **delete the `ADMIN_PASSWORD` line from `.env`**. It is only read once, when no
admin exists yet. Changing it later does **not** change your password (the server prints a reminder if it is
still there). Change your password any time in the admin panel → *Change password*, or with `npm run reset-password`.

`npm run dev` does the same as `npm start` but restarts automatically when you edit code.

## 2. Using the admin panel

| Page | What you can do |
|---|---|
| Dashboard | Counts of products and enquiries, latest enquiries, and a button to delete all demo data |
| Enquiries | Every enquiry and builder quote from the website. Filter new/done, search, **Reply on WhatsApp**, call, mark done |
| Products | Add / edit / delete, photo upload, search and filters, **Import CSV/Excel**, **Export Excel/CSV** |
| Brands, Categories | Name, logo/photo, display order |
| Offers & banners | Title, text, image, active yes/no. Active offers show at the top of "Offers & deals" |
| Reviews | Name, place, text, stars, show/hide |
| FAQs | Question, answer, order |
| Site settings | Shop name, logo, phone, WhatsApp, address, Google Maps link, hours, social links, SEO title/description, hero text, stats, every section heading, About text, showroom photos and colours |

**Discount %** is never typed in. It is always calculated from MRP and NRP.

**Featured products:** if you tick "Featured" on any product, the *Offers & deals* section shows your featured
products. If none are featured, it shows the 4 biggest discounts automatically.

**Demo data:** the 23 sample products and 3 sample reviews are marked **SAMPLE**. When your real data is in,
press *Dashboard → Delete all sample data*. Editing a sample product turns it into a normal product.
Demo data is only added once: once deleted it does not come back when the server restarts
(`npm run seed` adds it again to any empty tables, if you ever want it back).

### Importing your NRP price list

1. *Products → Export Excel* to get a file with the right columns (it doubles as a template).
2. Fill in or paste your price list. Column names in row 1:
   `Name, Brand, Model Code, Category, MRP, NRP, Description, Specs, Photo, In Stock, Featured`
   (common alternatives like *Model No*, *Item Code*, *Our Price*, *Price* are also understood).
3. *Products → Import CSV / Excel* → **1. Check file**. Nothing is saved yet. You see how many products
   will be added or updated, any new brands or categories, and every row with a problem.
4. Press **2. Import now**.

Rules:
- Products are matched by **Model Code**. Match → update; no match → new product.
- **Empty cells keep the current value.** A file with only `Model Code, MRP, NRP` just updates prices.
- New products need Name, Brand, Category, MRP and NRP. Unknown brands/categories are created automatically.
- Prices like `₹4,500` or `4500.00` are fine. In Stock / Featured accept yes/no, 1/0, true/false.
- Rows with problems (missing price, NRP above MRP, the same model code twice) are skipped and listed.
- Max 20,000 rows and 10 MB per file. Rows without a model code are always added as new products.

### Photos

JPG, PNG or WEBP, max 5 MB. Photos are checked, resized (max 1200 px) and saved as WEBP in `uploads/`.
When you replace or delete a photo, the old file is removed, unless another product, brand, offer or setting still uses it.
Products without a photo show a clean "Photo coming soon" placeholder.

### Product photos in bulk (by item code)

Photos are only ever matched by **exact item code**, never guessed, so every finish/variant (e.g. `ALI-CHR-…`
chrome vs `ALI-BLM-…` black matt) only gets its own photo. Use official photos you are allowed to use (for example
the dealer image pack from Jaquar or your distributor).

- **Audit** (changes nothing): `npm run images -- --audit` – counts and a CSV of every product with/without a photo.
- **Folder of photos** named after their item code (`ALI-CHR-85011B.jpg`; JPG, PNG or WEBP, at least 300 px;
  write `/` in a code as `_`): `npm run images -- "C:\path\to\photos"`
- **Mapping file** (CSV or JSON) from item code to a photo file or an `http(s)` link:
  `npm run images -- --map "C:\path\to\mapping.csv"`. CSV columns: `item_code,image,source` (other columns are
  ignored, so the pre-filled `NRP-product-image-mapping.csv` can be used directly). Relative file paths are relative
  to the mapping file. JSON: `[{"item_code": "...", "image": "...", "source": "..."}]`.

Without `--apply` this is only a preview. With `--apply` the database is first backed up to `data\backups\`, then each
photo is checked (real image, at least 300 px), saved as a 1200 px WEBP plus a 400 px copy for product cards, and only
the product's photo is updated. Large jobs: `--batch 500` (default) handles that many per run; run the same command
again to continue. Progress is kept in `data\image-import-state.json`, so finished items are never redone and failed
downloads are skipped unless you add `--retry-failed`. Other options: `--replace` (replace existing photos) and
`--allow-shared` (allow the same image for several item codes; normally flagged, because finishes must not share a
photo). Every run writes a CSV report to `data\`.

Products without their own photo show a **representative image of their category**, always labelled
"Representative image" (on the product page: "the actual product may look different"). These are original
AI-generated images (Figma AI), one per category; they are not stored in the products' photo field, so a real photo
added later always takes priority. Masters: `public/images/categories/<category-slug>.png` (not served); web versions:
`public/img/category/` (rebuild with `npm run category-images`). A category with no image (e.g. a new one added in
admin) shows "Image coming soon" with an icon (`public/img/placeholders/`) instead.

### Homepage hero photo

The hero photo is in `public/img/hero` (AVIF + WEBP in several sizes, a phone crop and a JPEG fallback). The current photo
is an original AI-generated image (Figma AI, file "Mohit Marketing – hero image"); it shows no real brand's products.
The full-resolution master is `public/images/hero.png` (1536 × 864; not served to visitors, only the optimised files are).
To change it, use a photo of at least 1536 × 864 px: `npm run hero -- "C:\path\to\photo.jpg"` (an optional second value
0–1 picks which part stays in the phone crop, default 0.7). Hero texts and button labels are in Admin → Site settings.

## 3. Folder structure

```
server.js              Express app: security headers, sessions, routes, error handling
db/schema.sql          Database tables
db/index.js            Opens the SQLite database
db/seed.js             Demo data (added once, on the first start). Run manually: npm run seed
lib/settings.js        List of every editable site setting (add a line here to add a new one)
lib/validate.js        Input validation for every form and API call (zod)
lib/auth.js            Login, bcrypt, route protection, CSRF tokens
lib/products.js        Product search / filter / sort queries
lib/sheet.js           CSV + Excel import / export
lib/upload.js          Image upload checks and resizing (sharp)
lib/session-store.js   Keeps login sessions in SQLite
routes/public.js       Public pages + JSON API (/api/site, /api/products, /api/enquiries), sitemap
routes/admin.js        Admin pages + protected admin API
views/                 Server-rendered product page and 404 page (for SEO)
public/                Website HTML, CSS, JS, images
admin/                 Admin panel HTML, CSS, JS
scripts/reset-password.js
scripts/import-product-images.js   Bulk product photos matched by item code (npm run images)
scripts/build-hero-image.js        Homepage hero image sizes (npm run hero)
data/                  Database file (not in git)
uploads/               Uploaded photos (not in git)
```

`showroom.html` is the original single-page design. It is no longer used and kept only for reference.

## 4. Security

- Secrets live in `.env` and are never in the code. `.env`, the database and `uploads/` are in `.gitignore`.
- Admin password is hashed with bcrypt (12 rounds). Login is limited to 5 failed tries per 15 minutes per IP address.
- Sessions are stored server-side, with httpOnly + SameSite=Strict cookies (Secure on HTTPS) and an 8-hour idle timeout.
  A new session id is issued on login. Changing the password logs out other devices.
- Every admin page and admin API route is checked **on the server**. Without a login you get a redirect or a 401.
- CSRF token required on every admin request that changes data.
- All input is validated (zod) and every SQL query uses `?` parameters.
- Output escaping: the server escapes all HTML. The browser inserts content with `textContent` only.
  A strict Content-Security-Policy (helmet) blocks inline and third-party scripts.
- Links entered in admin must start with `http(s)://` (blocks `javascript:` links).
- Uploads are checked by file content, not just the extension. CSV export guards against spreadsheet formula injection.
- The public enquiry form has a hidden spam trap and is limited to 10 enquiries per hour per IP address.

> **Antivirus note:** some antivirus programs (e.g. Kaspersky) inject a script into every web page.
> The security policy blocks it, so you may see a harmless "Content Security Policy" message in the browser console.

### Forgot the admin password?

```powershell
npm run reset-password
```

## 5. Going live

1. Host on any service that runs Node.js (a VPS, Render, Railway, etc.) behind **HTTPS**.
2. In `.env` on the server set:
   ```
   NODE_ENV=production
   SITE_URL=https://www.your-domain.in
   TRUST_PROXY=1        # if the host puts a proxy / load balancer in front (most do)
   ```
3. The database must live on persistent storage (not a temporary disk).
4. Submit `https://www.your-domain.in/sitemap.xml` in Google Search Console.

## 6. Backups

Everything is in two places. Copy both regularly:
- `data/mohit.db` (stop the server first, or copy `mohit.db`, `mohit.db-wal` and `mohit.db-shm` together)
- `uploads/`

## 7. Adding staff accounts later

The `admins` table already has a `role` column (`admin` now). To add staff you would add an
"Users" page in `routes/admin.js` and `admin/app.js`, then check `req.admin.role` in the routes
that only the owner should use.
#   m o h i t - s i t e  
 
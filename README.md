# arKive

A private, encrypted archive and writing space — running 100% on the **Cloudflare Free Tier** (Cloudflare Pages + Pages Functions + D1).

## Features

- Rich text (TipTap) and Markdown writing modes with drafts and pinning
- Spaces for organizing entries and selective sharing by username + invite link
- Client-side passphrase locking (PBKDF2 + AES-GCM) for sensitive posts
- Color-coded tags and yearly calendar view
- Image uploads (stored in Cloudflare D1 automatically, or R2 if enabled)
- Full JSON export and import
- Keyboard shortcuts (`Ctrl+K` to create, `/` to search, `g h` home, `g c` calendar)

---

## Deploy to Cloudflare (Free Tier, No Credit Card Needed)

### 1. Install dependencies & log in to Cloudflare
```bash
npm install
npx wrangler login
```

### 2. Create your free Cloudflare D1 database
```bash
npx wrangler d1 create arkive-db
```
Copy the `database_id` printed in the terminal and paste it into `wrangler.toml`:
```toml
database_id = "YOUR_COPIED_DATABASE_ID"
```

### 3. Apply the database schema
```bash
npm run db:migrate:remote
```

### 4. Set your JWT secret & deploy
```bash
npm run deploy
npx wrangler pages secret put JWT_SECRET
npm run deploy
```
> Cloudflare Pages applies secrets only to **new deployments**, so always run `npm run deploy` again after adding or updating `JWT_SECRET`. When prompted, paste any long random string (e.g. 32+ random characters). Do **not** commit this secret to git.

After deploying, open your `*.pages.dev` URL!

### 5. (Optional) Enable Google Sign-In
In Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID** (Web application):
- **Authorized redirect URI:** `https://YOUR-SITE.pages.dev/api/auth/google/callback`

Then add your Google secrets server-side (never in client code or git) and redeploy:
```bash
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
npm run deploy
```

---

## Migrating Existing Data from Supabase

1. In Supabase Dashboard, go to **Project Settings → API** and copy your **Project URL** and **`service_role` (secret)** key.
2. Export every table, user, and uploaded image locally:
   ```powershell
   $env:SUPABASE_URL="https://your-project.supabase.co"
   $env:SUPABASE_SERVICE_KEY="your-service-role-key"
   node scripts/export-supabase.mjs
   ```
3. Generate the Cloudflare D1 import SQL (choose a temporary password so you can sign in right away):
   ```powershell
   $env:MIGRATION_PASSWORD="TempPassword123"
   node scripts/import-to-d1.mjs
   ```
4. Apply the data to your D1 database:
   ```bash
   npx wrangler d1 execute arkive-db --remote --file=migration-import.sql
   ```
5. Sign in with your email + `TempPassword123`, then update your password under **Profile** settings.

---

## Local Development

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run build
npm run dev:cf
```

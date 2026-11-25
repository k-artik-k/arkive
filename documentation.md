# arKive Documentation

Technical reference for **arKive** — architecture, database schema, REST API endpoints, security model, deployment, and maintenance.

---

## 1. Architecture Overview

arKive runs entirely on the **Cloudflare Free Tier**:

- **Frontend (`src/`):** React 19 + Vite SPA with route-level code splitting (`React.lazy`), TipTap rich-text editor, DOMPurify HTML sanitization, and client-side Web Crypto encryption for locked posts.
- **Backend (`functions/api/[[route]].js`):** Cloudflare Pages Functions running Hono (`/api/*`) on the same origin as the frontend.
- **Database & Media (`migrations/`):** Cloudflare D1 (SQLite) stores users, profiles, posts, spaces, tags, memberships, rate limits, and uploaded images (automatically chunked in `media_chunks` when > 200 KB, with optional R2 support if `IMAGES` bucket is bound).

---

## 2. Project Structure

```text
.
├── functions/
│   └── api/
│       └── [[route]].js       # Hono REST API (auth, OAuth, posts, spaces, tags, media, export/import)
├── migrations/
│   ├── 0001_schema.sql        # Full initial D1 schema & indexes
│   ├── 0002_media_chunks.sql  # Chunked D1 media storage table
│   └── 0003_rate_limits.sql   # Auth rate limiting table
├── public/
│   ├── _headers               # CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy
│   └── logoooo1.png           # App favicon & brand icon
├── scripts/
│   ├── export-supabase.mjs    # Zero-dep Supabase exporter (tables + auth.users + storage images)
│   ├── import-to-d1.mjs       # Converts export JSON + images into chunked D1 SQL
│   └── reset-password.mjs     # CLI helper to set/reset any user's password in D1
├── src/
│   ├── api.js                 # Fetch client (credentials: 'same-origin')
│   ├── App.jsx                # Code-split router + ProtectedRoute / PublicRoute + ErrorBoundary
│   ├── components/            # Header, Sidebar, RichTextEditor, PostCard, CalendarGrid, managers, dialogs
│   ├── contexts/
│   │   └── AuthContext.jsx    # Session state via /api/profile
│   ├── hooks/
│   │   └── useKeyboardShortcuts.js
│   ├── pages/                 # Home, CreatePost, ReadPost, Calendar, SpacePage, SharedSpacePage, Settings*, ErrorPage
│   └── utils/                 # postCrypto, sanitize, dateHelpers, appLinks, exportImport, peopleDirectory, postActions
├── .dev.vars.example          # Local dev secret template
├── .env.example               # Public app URL example
├── index.html                 # Entry HTML & metadata
├── vite.config.js             # Vite build + local /api proxy to wrangler dev
└── wrangler.toml              # Cloudflare Pages & D1 configuration
```

---

## 3. Database Schema (Cloudflare D1)

Defined in `migrations/0001_schema.sql`:

| Table | Purpose |
|---|---|
| `users` | Account ID, unique case-insensitive `email`, PBKDF2 `password_hash` (or `GOOGLE_OAUTH:` / `MIGRATION_LOCKED:` marker) |
| `profiles` | 1:1 with `users`; unique case-insensitive `username`, `display_name`, `avatar_url` |
| `tags` | Per-user color-coded tags (`name <= 20` chars, `pill_color`, `text_color`) |
| `spaces` | Per-user collections with `icon`, optional linked `tag_id`, `show_in_menu`, and unique `share_link` |
| `space_members` | Maps `space_id` to `member_username` (updated automatically if a member renames their username) |
| `posts` | Entries with `title`, `body`, `is_draft`, `is_pinned`, `passphrase_hash`, `encrypted_body`, `date_tag`, `space_id` |
| `post_tags` | Many-to-many join between `posts` and `tags` |
| `media` | Uploaded image metadata and inline BLOB (`<= 200 KB`) or empty marker when chunked |
| `media_chunks` | `200 KB` (live upload) or `30 KB` (SQL import) BLOB chunks cascading from `media(key)` |
| `auth_rate_limits` | Tracks login/register attempts per IP + action (`10` attempts / `15` min window) |

---

## 4. API Reference (`/api`)

All protected routes require a valid `arkive_session` `HttpOnly` cookie (or `Authorization: Bearer <jwt>`).

### Authentication & Account
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account + profile, sets `arkive_session` cookie (rate-limited) |
| `POST` | `/api/auth/login` | Verify email/password, sets `arkive_session` cookie (rate-limited) |
| `POST` | `/api/auth/logout` | Clears `arkive_session` cookie |
| `GET` | `/api/auth/google` | Starts Google OAuth 2.0 PKCE flow (`S256` + signed `HttpOnly` state cookie) |
| `GET` | `/api/auth/google/callback` | Exchanges code server-side, creates/matches user by email, sets `arkive_session` cookie |
| `PUT` | `/api/auth/password` | Update password for current user |
| `DELETE` | `/api/auth/account` | Delete user, owned R2/D1 media, space memberships, and clear session cookie |

### Profile
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/profile` | Returns `{ user, profile }` for current session |
| `PUT` | `/api/profile` | Update `username`, `display_name`, `avatar_url`; cascades username changes to `space_members` |

### Posts
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/posts` | Paginated own posts (`?page=0&search=&tag=&drafts=1`); searches title, subtitle, and unlocked body |
| `GET` | `/api/posts/pinned` | Pinned own posts (supports `search`, `tag`, `drafts`) |
| `GET` | `/api/posts/ids` | Ordered list of own post IDs for keyboard navigation |
| `GET` | `/api/posts/calendar` | Dated own posts for a given year (`?year=YYYY`) |
| `GET` | `/api/posts/:id` | Single post (owner or space member for non-draft space posts) |
| `POST` | `/api/posts` | Create post + attach `tag_ids` |
| `PUT` | `/api/posts/:id` | Owner-only update (fields, lock/unlock, space, and tag sync) |
| `DELETE` | `/api/posts/:id` | Owner-only delete + removes unreferenced `/api/images/serve/*` media |

### Spaces, Members & Sharing
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/spaces` | Returns `{ owned, shared }` spaces |
| `POST` | `/api/spaces` | Create space |
| `GET` | `/api/spaces/:id` | Get space details (owner or member) |
| `PUT` | `/api/spaces/:id` | Owner-only space update |
| `DELETE` | `/api/spaces/:id` | Owner-only space delete |
| `GET` | `/api/spaces/:id/posts` | Paginated space posts + pinned posts (`?page=0&tag=`; hides other users' drafts) |
| `GET` | `/api/spaces/:id/members` | Owner-only member list |
| `POST` | `/api/spaces/:id/members` | Owner-only add member by existing username |
| `DELETE` | `/api/spaces/:id/members/:username` | Owner-only remove member |
| `GET` | `/api/shared/:shareLink` | Resolve share link to space ID (requires owner or membership) |
| `GET` | `/api/shared/:shareLink/post/:postId` | Verify post belongs to accessible shared space |

### Tags, People, Media & Data
| Method | Path | Description |
|---|---|---|
| `GET` / `POST` / `PUT` / `DELETE` | `/api/tags`, `/api/tags/:id` | Manage user-owned tags |
| `GET` | `/api/people`, `/api/people/:username` | Directory of members across owned spaces |
| `POST` | `/api/images` | Upload PNG/JPEG/WebP/GIF/AVIF (`<= 2 MB` D1 chunked, or `<= 5 MB` R2) |
| `GET` | `/api/images/serve/*` | Publicly serve image by unguessable UUID key (`nosniff` + immutable cache) |
| `DELETE` | `/api/images/*` | Owner-only image deletion |
| `GET` / `POST` | `/api/data/export`, `/api/data/import` | Export/import user data as JSON preserving tags, spaces, and relationships |

---

## 5. Security Model

- **Session Cookies:** JWTs (HMAC-SHA256, 30-day expiry) are stored in `HttpOnly; SameSite=Lax` cookies (`Secure` on HTTPS). No token is stored in `localStorage` or URL fragments.
- **Password Hashing:** PBKDF2-SHA256 (`100,000` iterations, 16-byte random salt) with constant-time comparison.
- **Client-Side Locked Posts (`src/utils/postCrypto.js`):**
  - **v2 format:** Generates separate 16-byte salts and domain prefixes (`arkive-auth:` for `passphrase_hash`, `arkive-enc:` for the AES-256-GCM key) with 100,000 PBKDF2 iterations. Inspecting `passphrase_hash` never reveals the decryption key.
  - **v1 compatibility:** Legacy SHA-256 locked posts migrated from Supabase still decrypt and automatically upgrade to `v2` when edited and saved.
- **XSS & Headers:** All rich-text HTML is sanitized through DOMPurify (`ALLOW_DATA_ATTR: false`), SVG image uploads are blocked, and `public/_headers` enforces `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`.
- **Authorization:** Every endpoint verifies record ownership (`user_id`) or `space_members` membership server-side.

---

## 6. Deployment & Maintenance

### Secrets (Cloudflare Pages)
Set via Wrangler (never commit secrets to `wrangler.toml` or git):

```powershell
npx wrangler pages secret put JWT_SECRET
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
```

> Cloudflare Pages applies secret changes only to **new deployments**, so run `npm run deploy` after adding or updating secrets.

### Deploy & Database Migrations

```powershell
# Apply remote D1 migrations
npx wrangler d1 execute arkive-db --remote --file=migrations/0001_schema.sql
npx wrangler d1 execute arkive-db --remote --file=migrations/0002_media_chunks.sql
npx wrangler d1 execute arkive-db --remote --file=migrations/0003_rate_limits.sql

# Build and deploy to Cloudflare Pages
npm run deploy
```

### Emergency Password Reset (CLI)

```powershell
node scripts/reset-password.mjs user@example.com NewPassword123 --remote
```

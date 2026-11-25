<div align="center">

<img src="public/logoooo1.png" alt="arKive" width="64" />

# arKive

*a quiet, private corner for your thoughts, drafts, and shared memories.*

[![Live App](https://img.shields.io/badge/live-arkive--3jb.pages.dev-b94d3f?style=flat-square)](https://arkive-3jb.pages.dev)
[![Cloudflare](https://img.shields.io/badge/cloudflare-pages%20%2B%20d1-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://arkive-3jb.pages.dev)
[![React](https://img.shields.io/badge/react-19-131619?style=flat-square&logo=react)](https://react.dev)

[**Open arKive ->**](https://arkive-3jb.pages.dev)

</div>

---

Replace messy notes, scattered tabs, and noisy social writing apps with a space that actually feels personal.

**arKive** is built around one soft rule: your writing stays calm, structured, and private unless you choose to share it.

---

## Glimpse

![login](screenshots/login.png)

![home](screenshots/home.png)

![people](screenshots/people.png)

![profile update](screenshots/profile_update.png)

![profile menu](screenshots/profile_menu.png)

---

## How to use arKive

### 1. Sign in
- Create an account with **email & password**, or click **Continue with Google** for one-click sign-in.
- Your session is stored in a secure `HttpOnly` cookie so no tokens are exposed in the browser.

### 2. Write & format entries
- Click **Create** (or press `Ctrl + K` / `Cmd + K`) to open the rich-text editor.
- Format with **Bold**, *Italic*, ~~Strikethrough~~, Underline, **H1–H3**, bullet lists, blockquotes, and inline image uploads.
- Save unfinished thoughts as a **Draft** or publish right away as a **Post**.
- Filter your feed anytime between **All** and **Drafts** at the top of Home.

### 3. Lock sensitive posts
- Click **Lock** while creating or editing any post to encrypt its body right inside your browser (PBKDF2 + AES-GCM) with a passphrase you choose.
- Locked posts stay encrypted everywhere in the database and even inside shared spaces — only someone with the passphrase can unlock or edit them.
- You can add, replace, or remove a post's passphrase anytime while editing.

### 4. Organize with Spaces & Tags
- **Spaces** act like private collections or shared rooms: create them from the **+** button in the sidebar or **Profile -> Spaces**.
- Link a default tag to a space so new posts in that space pick it up automatically, or hide spaces from the sidebar anytime.
- **Tags** can be customized with any hex color in **Profile -> Tags**. Click any tag pill on a post card to filter your Home or Space feed by that tag.
- **Pin** important entries from the `···` post menu to keep them in the **Pinned** shortcut rail at the top without disturbing your main feed.

### 5. Share privately with People
- Every space is private to you by default.
- To share a space, go to **Profile -> People**, pick the space, and add your friend's exact **username**, then click **Copy link** (or copy a post's link from `··· -> Copy link`).
- Only users whose usernames are added can open that space or link — drafts inside shared spaces always remain private to the author.
- Added friends appear under **People** in your sidebar so you can see every space you share with them.

### 6. Calendar view
- Pick a **Date** when creating a post, or write a dated title like `"1st January 2026"` / `"23rd March 2026"` and arKive automatically links it to that date.
- Open **Calendar** from the sidebar to see every day you wrote across the year.
- Hover over any highlighted date to see the entry **title(s)**, and click to jump straight in (if you have multiple entries on the same day, a picker lets you choose which one to open).

### 7. Search, Shortcuts & Backups
- **Search** matches titles and unlocked entry text in real time.
- **Keyboard shortcuts:**
  - `Ctrl + K` / `Cmd + K` — New post
  - `/` — Focus search
  - `g` then `h` — Go Home
  - `g` then `c` — Go to Calendar
  - `ArrowLeft` / `ArrowRight` (while reading) — Previous / next post
- **Backups & account control:** Export everything (`posts`, `spaces`, `tags`, `profile`) as a single JSON file or import a backup anytime under **Profile -> Data**, or permanently delete your account under **Profile -> Danger**.

---

## Tech

- **Frontend:** React 19 + Vite (code-split routes) + TipTap
- **Backend & Storage:** Cloudflare Pages Functions (Hono) + Cloudflare D1 (SQLite + chunked media storage)
- **Auth & Security:** `HttpOnly` JWT cookies, PBKDF2 passwords, server-side Google OAuth (PKCE), D1 rate limiting, strict CSP headers, and client-side AES-GCM post locking

For architecture, database schema, API endpoints, and deployment commands, see [documentation.md](documentation.md).

---

## Live

**[https://arkive-3jb.pages.dev](https://arkive-3jb.pages.dev)**

---

## Author

Kartikeya...

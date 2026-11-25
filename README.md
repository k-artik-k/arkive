<div align="center">

<img src="public/logoooo1.png" alt="arKive" width="64" />

# arKive

*a quiet, private corner for your thoughts, drafts, and shared memories.* 🕯️✨

[![Live App](https://img.shields.io/badge/live-arkive--3jb.pages.dev-b94d3f?style=flat-square)](https://arkive-3jb.pages.dev)
[![Hosted on Cloudflare](https://img.shields.io/badge/cloudflare-pages%20%2B%20d1-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://arkive-3jb.pages.dev)
[![React](https://img.shields.io/badge/react-19-131619?style=flat-square&logo=react)](https://react.dev)

[**Open arKive →**](https://arkive-3jb.pages.dev)

</div>

---

Replace messy notes, scattered tabs, and noisy social writing apps with a space that actually feels personal.

**arKive** is built around one soft rule: your writing stays calm, structured, and private unless you choose to share it. 🌙

---

## ✨ Glimpse

![login](screenshots/login.png)

![home](screenshots/home.png)

![people](screenshots/people.png)

![profile update](screenshots/profile_update.png)

![profile menu](screenshots/profile_menu.png)

---

## 🌿 What lives inside

- **Write your way** — switch between rich text and markdown, save half-formed thoughts as drafts, and drop images right into entries.
- **Passphrase lock** — lock sensitive posts client-side (PBKDF2 + AES-GCM) so even a shared database stays unreadable without your passphrase. 🔐
- **Spaces & gentle sharing** — group entries into private collections, invite specific usernames, or share a space link without making anything public.
- **Tags & calendar view** — color-coded pills and a yearly calendar grid that automatically links dated diary titles. 📅
- **Pinned rail** — keep favorite or important notes pinned at the top without cluttering your main feed.
- **No social noise** — zero likes, zero "who viewed your post", zero algorithms.
- **Yours to keep** — full JSON export & import anytime.

---

## ⚡ Core experience

The app stays out of your way.

Navigation is minimal and keyboard-friendly (`Ctrl+K` to write, `/` to search, `g h` for home, `g c` for calendar). Everything revolves around ownership, calm typography, and quiet focus.

---

## 🛠️ Tech

- **Frontend:** React 19 + Vite + TipTap
- **Backend & Storage:** Cloudflare Pages Functions (Hono) + Cloudflare D1 (SQLite + media storage)
- **Auth:** Email/password (PBKDF2 + JWT) & server-side Google OAuth (PKCE)

---

## 🔗 Live

**[https://arkive-3jb.pages.dev](https://arkive-3jb.pages.dev)**

---

## 💭 Why this exists

Most writing apps either get bloated or push everything toward being public.

**arKive** started as a personal full-stack project to keep writing minimal as entries grow, while still handling real-life needs like private collections, encryption, and selective sharing.

---

## ✍️ Author

Kartikeya...

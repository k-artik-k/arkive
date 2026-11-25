# arKive

*A private space for writing, organizing, and preserving thoughts.*

[![Live App](https://img.shields.io/badge/Live-arkive--3jb.pages.dev-b94d3f?style=flat-square)](https://arkive-3jb.pages.dev)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages%20%2B%20D1-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://www.cloudflare.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)

**[Open arKive](https://arkive-3jb.pages.dev)**

---

## Overview

arKive is a private writing and journaling application designed to keep personal thoughts, drafts, and memories organized in one place.

It combines a distraction-free writing experience with privacy-focused features, flexible organization, and selective sharing. 

## Screenshots

![Login](screenshots/login.png)

![Home](screenshots/home.png)

![People](screenshots/people.png)

![Profile Update](screenshots/profile_update.png)

![Profile Menu](screenshots/profile_menu.png)

## Features

- **Rich Text and Markdown:** Write using TipTap rich text editing or Markdown, with support for drafts and embedded images.
- **Private Entries:** Protect sensitive entries using client-side PBKDF2 key derivation and AES-GCM encryption.
- **Spaces:** Organize entries into separate collections.
- **Selective Sharing:** Share spaces with specific users or through invitation links.
- **Tags:** Categorize entries using customizable, color-coded tags.
- **Calendar View:** Browse entries through a yearly calendar.
- **Pinned Entries:** Keep important notes easily accessible.
- **Search:** Quickly find entries across your archive.
- **Keyboard Shortcuts:** Navigate and create entries without relying entirely on the mouse.
- **Data Portability:** Export and import your archive through JSON.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Rich Text Editor | TipTap |
| Backend | Cloudflare Pages Functions, Hono |
| Database | Cloudflare D1 (SQLite) |
| Authentication | PBKDF2, JWT |
| OAuth | Google OAuth 2.0 (PKCE) |
| Encryption | Web Crypto API (AES-GCM) |
| Hosting | Cloudflare Pages |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + K` | Create a new entry |
| `/` | Search |
| `g` then `h` | Go to Home |
| `g` then `c` | Open Calendar |

## Privacy

Privacy is a central design consideration in arKive.

- Sensitive entries can be encrypted client-side before storage.
- Selective sharing keeps access under the user's control.
- Authentication is handled by the application's backend.
- Data can be exported at any time.

## Infrastructure

arKive runs on Cloudflare Pages, Pages Functions, and D1, using the Cloudflare Free Tier without requiring external database hosting or paid storage services.

## Author

**Kartikeya**

[GitHub](https://github.com/k-artik-k)

---

*Built to keep personal writing personal.*
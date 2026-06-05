# Frago Vanguard Group

> **Built to grow together.** — A global innovation ecosystem.

Premium institutional corporate website for **Frago Vanguard Group**,
a multi-business-unit holding based in San José, Costa Rica.

[![License](https://img.shields.io/badge/license-Proprietary-blue)](#)
[![Stack](https://img.shields.io/badge/stack-Vanilla%20HTML%2FCSS%2FJS-black)](#)
[![Status](https://img.shields.io/badge/status-Live-22c55e)](#)

---

## ✨ Highlights

- **Zero-build vanilla stack** — single `index.html`, single `main.css`,
  single ES-module `main.js`. No bundler, no framework, no node_modules.
- **Three.js ambient backdrop** — particles + nebula shader + dynamic
  constellation lines, all loaded via `esm.sh` after first paint.
- **Char-level hero reveal** (Apple Vision Pro style), magnetic cursor,
  magnetic buttons, scroll-driven 3D logo.
- **Sticky pinned manifesto** (4 stages × 100vh, rotating 3D V mark).
- **Cinema horizontal scrollytelling** (3 cinematic panels).
- **Velocity-driven marquee** that accelerates with your scroll speed.
- **Stripe-style odometer counters** for stats.
- **Full EN ⇄ ES locale switching** — 130+ translations, brand vocabulary
  preserved in both languages.
- **Three business unit modal** (Nexus Intelligence · Momentum Digital ·
  Frago Football Group) with brand-color ambient that morphs on hover.
- **PWA-ready** — manifest + service worker (stale-while-revalidate).
- **Print stylesheet** — clean editorial reduction for paper.
- **Custom 404** page with brand voice.

---

## 🚀 Run locally

The site is static. Any HTTP server works:

```powershell
# Python
python -m http.server 8000

# Node (if you have it)
npx serve .
```

Then open `http://localhost:8000`.

> Service worker only registers on HTTPS — local dev keeps the cache clean.

---

## ▲ Deploy on Vercel (recommended)

The repo ships with a `vercel.json` that configures clean URLs,
per-asset cache policies, service-worker headers, security headers
(HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) and the
correct MIME types for `manifest.webmanifest` and `sw.js`.

**One-click deploy:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FFrago10%2FFrago-Vanguard-Group)

**Manual deploy:**

1. Visit [vercel.com/new](https://vercel.com/new) and import this repo
2. Framework preset: **Other** (auto-detected — no build step)
3. Click **Deploy**
4. Site goes live at `https://<your-project>.vercel.app/`

Every `git push` to `main` triggers an automatic redeploy.

## 🌐 Deploy on GitHub Pages (alternative)

1. Push to `main`
2. Settings → Pages → Source: `Deploy from a branch` → `main` / `(root)`
3. Visit `https://<user>.github.io/Frago-Vanguard-Group/`

> Note: GitHub Pages doesn't apply `vercel.json` headers. The service
> worker still works, but cache policies will be defaults.

---

## 🗂 Structure

```
.
├── index.html              Main page — all sections + i18n attributes
├── 404.html                Custom 404 page
├── styles/main.css         Design system + all component styles
├── scripts/main.js         Interaction layer + translation dictionary
├── manifest.webmanifest    PWA manifest
├── sw.js                   Service worker
├── assets/
│   ├── favicon.svg         SEAL logo favicon
│   ├── og.svg              OpenGraph share card
│   └── logos/              Logo proposals + preview.html
└── CONTEXT.txt             Project memory snapshot (read on restart)
```

---

## 🎨 Brand

- **Canvas:** `#0A0A0A` (deep black)
- **Brand accent:** `#2563EB` (Vanguard blue) — used sparingly
- **Type:** General Sans / Satoshi (display) · Inter (body) · JetBrains Mono
- **Logo:** SEAL — hairline horizon ring + brand-blue arc at upper-right rim
  + clean V inscribed inside
- **Origin:** San José, Costa Rica · `9.9281° N · 84.0907° W`

### Business units

| # | Brand | Color | Notes |
|---|---|---|---|
| 01 | **Nexus Intelligence** | `#A6FF00` neon green | AI strategy + applied research |
| 02 | **Momentum Digital** | `#ff2d8d` magenta | Creative agency for cultural compounding |
| 03 | **Frago Football Group** | `#d4af37` gold | Football as institutional category |

---

## 📜 License

Proprietary © Frago Vanguard Group. All rights reserved.

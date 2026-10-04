# My Supermart

A web-based retail management system for a supermarket: point of sale, inventory, customers, suppliers, accounting and reports in one installable app. Prices are in Ghana cedis (₵) and VAT is calculated at 12.5%.

**Live demo (test mode):** https://retail-ecosystem-my-supermart.vercel.app

> **Status:** early-stage, in test mode. There is no login yet, so do not use it with real business data until authentication and access rules are added (see [Security notes](#security-notes)).

## Features

| Module | What it does |
| --- | --- |
| **Dashboard** | Sales, stock and customer overview with charts |
| **Point of Sale** | Search or filter products, build a cart, apply a discount, choose a payment method, attach a customer and charge. Stock, loyalty points and receipts update in one database transaction |
| **Inventory** | Add, edit and remove products (cost and selling price, quantity, reorder level, expiry date, supplier). Removing a product requires a reason (returned to supplier, expired, damaged, etc.) and is saved in a **Removal Log** |
| **Customers** | Customer records with total spent, visits, loyalty points and tiers (Bronze, Silver, Gold, Platinum) |
| **Suppliers** | Supplier contacts, ratings and amounts payable |
| **Accounting** | Log and review expenses alongside sales |
| **Reports** | Revenue trends, top products and sales by category |

It is also a **PWA**: it can be installed on a phone or desktop from the browser and opens full-screen with its own icon.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Recharts
- **Backend:** [Supabase](https://supabase.com) (Postgres database, accessed from the browser with `@supabase/supabase-js`)
- **Hosting:** Vercel (auto-deploys on every push to `main`)

## Project structure

```
├── index.html                  # App shell, PWA and icon metadata
├── public/                     # Favicon, app icons, manifest, service worker
├── src/
│   ├── App.tsx                 # All screens (Dashboard, POS, Inventory, ...)
│   ├── lib/api.ts              # Supabase client and checkout call
│   └── main.tsx
├── supabase/
│   ├── schema.sql              # Tables, indexes and access rules
│   ├── checkout.sql            # ms_checkout(): atomic sale function
│   ├── product_removal.sql     # Removal log and ms_remove_product()
│   └── functions/server/       # Original edge function (no longer used by checkout)
└── utils/supabase/info.tsx     # Supabase project URL and public (anon) key
```

## Getting started

### Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io)
- A free Supabase project

### 1. Install and run

```bash
pnpm install
pnpm dev
```

### 2. Connect your own Supabase project

Edit `utils/supabase/info.tsx` with your project ID and **anon (public)** key, found in Supabase under **Project Settings → API**. Never put the `service_role` key in this repository.

### 3. Create the database

In the Supabase **SQL Editor**, run these files **in this order**:

1. `supabase/schema.sql`
2. `supabase/checkout.sql`
3. `supabase/product_removal.sql`

The tables start empty. Add products, customers, suppliers and expenses from inside the app.

### 4. Build for production

```bash
pnpm build
```

Deploy to Vercel by importing the repository and keeping the default Vite settings.

## How a sale works

The POS calls the database function `ms_checkout`. In a single transaction it records the sale, saves each line item, reduces stock (never below zero) and, if a customer is attached, adds loyalty points (1 point per ₵1) and updates their tier by lifetime spend. If anything fails, nothing is saved.

## Security notes

- The anon key in `utils/supabase/info.tsx` is designed to be public, but **the current Row Level Security policies allow anyone with the site link to read and write every table**. This is intentional for testing only.
- Before real use: add Supabase Auth (login), replace the `test_mode_all` policies with role-based ones (admin, manager, cashier) and restrict who can edit prices or remove products.

## Roadmap

- [ ] Login and user roles
- [ ] Block sales when stock is insufficient (optional setting)
- [ ] Edit and delete for customers and suppliers
- [ ] Count expired or damaged stock as an expense in Accounting
- [ ] Offline sales

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.

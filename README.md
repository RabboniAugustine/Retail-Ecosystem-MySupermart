# My Supermart

A web-based retail management system for a supermarket: point of sale, inventory, customers, suppliers, accounting and reports in one installable app. Prices are in Ghana cedis (₵) and VAT is calculated at 12.5%.

**Live demo (test mode):** https://retail-ecosystem-my-supermart.vercel.app

> **Status:** test mode. Logins and role-based access are now in place; run the database migrations below before use.

## Three screens

| Screen | Who | What they can do |
| --- | --- | --- |
| **Owner dashboard** | Shop owner(s) | Everything: today's sales and profit, sales per salesperson, POS, Sales & Refunds, Inventory (with Stock log and Removal log), Accounting (purchases, expenses, account balances, money in / out), Reports (Sales, Purchases, Profit & Loss, Stock Summary, Bank Statement, Expenses), Utilities (import, bulk update and export items), Customers, Suppliers, Staff and Settings |
| **Salesperson dashboard** | Till staff | My Shift, Point of Sale, Stock, Accounting (add purchases and expenses; no account balances), Customers. No reports or utilities. Discount is capped by the owner's limit |
| **Customer display** | Shoppers | A second screen facing the customer. Shows each item as it is scanned, the total, change due and loyalty points, then a thank-you screen |

### Setting up the customer display (two screens, one computer)

1. Connect the customer monitor and set Windows to **Extend these displays** (Windows key + P → Extend).
2. Use **Chrome or Edge**. Sign in on the till and open **Point of Sale**.
3. Click **Customer screen**. The first time, the browser asks to **manage windows on all your displays**: click **Allow**. If it says a pop-up was blocked, allow pop-ups for the site and click again.
4. The display opens on the second monitor, filling it, and goes full screen. If the browser holds back full screen, the first tap or click on that screen switches it on.

The two windows talk to each other directly inside the browser, so the display updates instantly and works even if the internet drops. Keep both windows in the same browser.

### Roles and logins

- The **first account created becomes the Owner** ("Create owner account" only shows until an owner exists).
- The owner creates each salesperson's **username and password** in **Staff → Add staff** and gives them the details. Staff cannot create their own accounts.
- The owner can **reset a password** or **disable** a salesperson at any time; a disabled account loses access immediately.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Recharts
- **Backend:** [Supabase](https://supabase.com) (Postgres database, accessed from the browser with `@supabase/supabase-js`)
- **Hosting:** Vercel (auto-deploys on every push to `main`)

## Project structure

```
├── index.html                  # App shell, PWA and icon metadata
├── public/                     # Favicon, app icons, manifest, service worker
├── src/
│   ├── App.tsx                 # Login gate and the Owner / Salesperson layouts
│   ├── pages/                  # Dashboard, POS, Inventory, SalesHistory, Staff, Settings,
│   │                           # SalesHome (My Shift), CustomerDisplay, ...
│   ├── components/             # Shared UI, sidebar shell, receipt, sale detail
│   ├── lib/                    # Supabase client + database calls, auth, display link, types
│   └── main.tsx
├── supabase/
│   ├── migrations/             # Run these in order in the Supabase SQL Editor
│   └── functions/server/       # Original edge function (not used)
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

### 3. Create / upgrade the database

In the Supabase **SQL Editor**, open each file, paste it and click **Run**, **in this order**:

1. `supabase/migrations/001_base_schema.sql` — tables (creates them, or adds missing columns to existing ones)
2. `supabase/migrations/002_roles_and_security.sql` — logins, roles, settings and access rules
3. `supabase/migrations/003_pos_functions.sql` — checkout, refunds, stock changes
4. `supabase/migrations/004_owner_creates_staff.sql` — owner creates staff logins
5. `supabase/migrations/005_accounting_reports_utilities.sql` — purchases, money accounts, reports, import / bulk update
6. `supabase/migrations/006_delete_sales.sql` — owner can delete sales (kept in a deleted-sales log)

All six are safe to run again. `supabase/000_all_migrations_in_one.sql` contains all of them in order. Existing products, customers and sales are kept.

Then in Supabase **Authentication**:

- **URL Configuration → Site URL**: set it to your live address (e.g. `https://retail-ecosystem-my-supermart.vercel.app`) so confirmation emails link back to the app.
- After the owner account exists, turn off **Allow new users to sign up** (Authentication → Sign In / Providers). Staff logins made by the owner keep working.

Finally, open the app and **create the owner account first**.

### 4. Build for production

```bash
pnpm build
```

Deploy to Vercel by importing the repository and keeping the default Vite settings.

## How a sale works

The POS calls the database function `ms_checkout`. Prices, discount, VAT and the total are calculated **in the database** from the product prices, so they cannot be changed from the browser. In one transaction it records the sale and the salesperson, saves each line (with the cost at the time, for profit reports), reduces stock, blocks the sale if stock is short (optional setting), checks the salesperson's discount limit and, if a customer is attached, adds loyalty points (1 point per ₵1) and updates their tier. If anything fails, nothing is saved.

Every other stock change (deliveries, stock counts, refunds, removals) goes through `ms_adjust_stock`, `ms_refund` or `ms_remove_product` and is written to the **Stock log** with who did it and why.

## Accounting

- **Money accounts:** Cash, Bank and Mobile Money. Cash sales go to Cash, card sales to Bank and MoMo sales to Mobile Money; refunds take the money back out of the same account.
- **Add purchase:** stock bought from a supplier. Stock goes up, the item's cost price becomes the new cost, and you can set a new selling price. Pay in full, in part or on credit; anything unpaid is added to the supplier's balance and can be paid later from the purchase. The owner can void a purchase entered by mistake.
- **Add expense:** rent, transport, utilities and so on, paid from one of the accounts. Salespeople can add; only the owner can delete.
- **Money in / out (owner):** transfers between accounts (e.g. depositing cash in the bank), opening balances, and owner withdrawals. These are what make the Bank Statement match your real bank.

## Security

- Logged-out visitors cannot read or change anything.
- Salespeople only see their own sales and cannot see expenses, supplier balances, the stock and removal logs or other staff.
- Only the owner can refund or delete sales (every deleted sale is kept in Sales & Refunds → Deleted sales), remove products, change settings and manage staff.
- The anon key in `utils/supabase/info.tsx` is designed to be public. Never put the `service_role` key in this repository.

## Roadmap

- [ ] Redeem loyalty points at the till
- [ ] Offline sales
- [ ] Purchase orders to suppliers
- [ ] Count expired or damaged stock as an expense in Accounting

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.

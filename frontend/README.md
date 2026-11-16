# Mavos Nexus: Frontend (React + Tailwind CSS)

React 18, Vite, React Router and Tailwind CSS v4. It talks to the Laravel API only.

## Run it
```bash
cd frontend
cp .env.example .env        # VITE_API_URL=/api (uses the Vite proxy below)
npm install
npm run dev                 # http://localhost:5173; accessible on your LAN
```
Keep `php artisan serve` running in `backend/`. The Vite `/api` proxy forwards requests to `http://127.0.0.1:8000`, so the same setup works when opening the frontend from another device on your LAN. Sign in as `admin` with the temporary password from the seeder.

## Screens
| Screen | Who | What it does |
|---|---|---|
| Point of sale | everyone | Search or scan, cart styled as a receipt, price within allowed range, cash or GCash, customer loyalty, printable receipt |
| Sales history | everyone (scoped) | Filters, CSV export, void, exchange, re-enter a corrected sale |
| Stock | everyone (actions for Staff/Admin) | On hand by batch, low stock, expiring, movements, receive stock, adjust with PIN |
| Transfers | Admin, Staff | Send from main, receiver confirms quantities |
| Dashboard | Admin, Staff | Sales, puhunan, expenses, tubo by day/week/month/year, top branches and sellers, alerts (refreshes every 15 s) |
| Products | Admin | Categories decide expiry and variants; size/color variants, prices, floor price |
| Expenses, Users, Setup, Audit log | Admin (Expenses also Staff) | As named. Setup holds branches, categories, suppliers, alert and loyalty settings |
| My account | everyone | Change password, set approval PIN (Staff/Admin) |

## Offline selling
If the internet drops, the POS keeps working from the last loaded product list. Sales are saved on the device
(`localStorage`) and sent to `/sales/sync` automatically when the connection returns. The top bar shows
Online/Offline and how many sales are waiting. Each sale carries its own ID, so sending twice is safe.

## Not included yet
- GCash reference by camera scan (typing works; add a barcode/OCR library later).
- Live push updates (Laravel Reverb). The dashboard polls every 15 seconds instead.
- Thermal-printer receipts. "Print receipt" uses the browser print dialog at 80 mm width.
- Installable app / full offline shell (PWA service worker).
- Tests.

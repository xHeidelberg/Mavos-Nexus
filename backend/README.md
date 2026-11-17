# Mavos Nexus: Backend (Laravel 11/12 + MySQL 8)

This folder holds only Mavos-specific files. Merge it into a fresh Laravel app:

```bash
# from the mavos-nexus/ folder
composer create-project laravel/laravel laravel-tmp
cp -rn laravel-tmp/. backend/        # -n keeps our files (bootstrap/app.php, users migration, ...)
rm -rf laravel-tmp
cd backend

php artisan install:api              # installs Sanctum (API tokens) + personal_access_tokens table
# merge backend/.env.additions into .env, create the MySQL database "mavos_nexus", then:
php artisan migrate --seed           # seed prints the temporary admin password
php artisan serve                    # http://localhost:8000/api
```

Requirements: PHP 8.2+, MySQL 8.0.16+ (CHECK constraints, generated columns), Composer.

Optional live dashboard: `php artisan install:broadcasting --reverb`, set `BROADCAST_CONNECTION=reverb`,
then run `php artisan reverb:start`. Without it the app works normally, events are just logged.
Send `Accept: application/json` and `Authorization: Bearer <token>` from the React app.

## How products are identified
- **Category** (`/api/categories`) is the identity of an item: Vape, Apparel, Accessories, or any you add.
  A category says whether items **track expiry** (+ default shelf life) and whether they have **variants** (+ which options, e.g. size and color).
- A **product** follows its category, and can override `tracks_expiry` / `shelf_life_months` if one item is an exception.
- A **variant** is the actual SKU that is stocked and sold (barcode, size/color, own cost / base / list price). A simple item has one variant.
- Stock, batches, transfers and sales all work on variants. Expiry/FEFO only applies to items that track expiry; apparel is simply sold oldest-received first.

## Roles
| Role  | Access |
|-------|--------|
| admin | everything, including users, products and categories, transfers, analytics, audit log |
| staff | own branch: stock, POS, receive transfers, approve with own PIN, export, sees own + supervised Sales users |
| sales | POS only; own sales for the last 1 month; can export own history |

## Endpoints (prefix `/api`)
- Auth: `POST auth/login`, `auth/change-password`, `auth/pin`, `auth/logout`, `GET auth/me`
- Users (admin): `GET/POST users`, `PATCH users/{id}`, `POST users/{id}/reset-password`
- Catalog: `branches`, `categories`, `products` (with variants), `suppliers`, `customers`
- Stock: `GET stock`, `stock/low`, `stock/expiring`, `stock/movements`; `POST stock/receive`, `stock/adjustments`
- Transfers: `POST stock/transfers` (admin), `POST stock/transfers/{id}/receive`, `.../cancel`
- Sales: `POST sales`, `POST sales/sync` (offline queue), `GET sales`, `GET sales/export`, `POST sales/{id}/void`, `POST sales/{id}/exchange`
- Reports: `GET reports/eod?period=daily|weekly|monthly|yearly&date=YYYY-MM-DD`, `reports/eod/series`, `reports/performance`
- Other: `expenses`, `audit` (admin), `settings`

### Example: create an apparel product with variants
```json
POST /api/products
{ "category_id": 2, "name": "Mavos Logo Tee", "brand": "Mavos",
  "variants": [
    { "sku": "TEE-M-BLK", "attributes": {"size":"M","color":"Black"}, "cost_price": 150, "base_price": 280, "selling_price": 350 },
    { "sku": "TEE-L-BLK", "attributes": {"size":"L","color":"Black"}, "cost_price": 150, "base_price": 280, "selling_price": 350 } ] }
```
### Example: sale
```json
POST /api/sales
{ "payment_method": "gcash", "gcash_ref": "1234567890",
  "items": [ { "variant_id": 3, "qty": 1, "unit_price": 330 } ] }
```

## Rules implemented
- Price must stay between the variant's `base_price` (floor) and `selling_price`; the difference is recorded as discount.
- Sales deduct the branch's own stock; first-expiring batch first; expired batches are never sold.
- No refunds: exchange only, replacement must be equal or higher in value, customer pays the difference.
- Void, exchange and manual adjustment need a Staff/Admin per-user 4-digit PIN (3 wrong tries locks it 15 min); the approver is saved on the record.
- A voided sale's corrected re-entry is linked via `replaces_sale_id`.
- Receipt numbers are sequential per branch, assigned by the server (`MAIN-00000001`).
- Offline: devices queue sales with `client_uuid` + `device_created_at`, then `POST sales/sync`. Duplicates are ignored, original time kept; GCash sales and stock shortages found during sync are flagged `needs_review`.
- Every sensitive action writes to `audit_logs`.
- Reports: puhunan = cost of items sold, tubo = revenue - puhunan - expenses.

## Not verified yet
This code was written without PHP available, so it has not been executed. Expect to fix small typos on first run
(`php artisan migrate` then try login). Adding Pest/PHPUnit feature tests for sale, void, exchange and transfer is the next step.

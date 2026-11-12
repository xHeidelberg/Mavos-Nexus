<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\Setting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class SaleService
{
    public function __construct(private StockService $stock, private ApproverService $approvers) {}

    private function r2($n): float
    {
        return round((float) $n, 2);
    }

    public function find(int $id): ?Sale
    {
        return Sale::with(['branch', 'cashier', 'customer', 'items.variant.product', 'void.approver', 'replaces'])->find($id);
    }

    /** @param array<int,array> $items */
    private function loadVariants(array $items)
    {
        $ids = array_values(array_unique(array_column($items, 'variant_id')));
        return ProductVariant::with('product')->whereIn('id', $ids)->where('is_active', true)->get()->keyBy('id');
    }

    /** Price must stay between the variant's base price (floor) and its list price. */
    private function priceLine(?ProductVariant $v, array $item): float
    {
        if (!$v) throw new ApiException('Unknown or inactive item', 422, ['variant_id' => $item['variant_id']]);
        $price = isset($item['unit_price']) ? (float) $item['unit_price'] : (float) $v->selling_price;
        if ($price < $v->base_price - 0.001) {
            throw new ApiException('Price for "' . $v->displayName() . '" is below the allowed minimum', 422, ['min_price' => $v->base_price]);
        }
        if ($price > $v->selling_price + 0.001) {
            throw new ApiException('Price for "' . $v->displayName() . '" is above the list price', 422, ['list_price' => $v->selling_price]);
        }
        return $price;
    }

    private function nextReceiptNo(int $branchId): string
    {
        DB::statement(
            'INSERT INTO receipt_sequences (branch_id, last_number) VALUES (?, 1)
             ON DUPLICATE KEY UPDATE last_number = last_number + 1',
            [$branchId]
        );
        $n = DB::table('receipt_sequences')->where('branch_id', $branchId)->lockForUpdate()->value('last_number');
        $code = DB::table('branches')->where('id', $branchId)->value('code');
        return $code . '-' . str_pad((string) $n, 8, '0', STR_PAD_LEFT);
    }

    private function assertAccess(User $user, Sale $sale): void
    {
        if ($user->role !== 'admin' && (int) $sale->branch_id !== (int) $user->branch_id) {
            throw new ApiException('Sale belongs to another branch', 403);
        }
        if ($user->role === 'sales' && (int) $sale->cashier_id !== (int) $user->id) {
            throw new ApiException('You can only act on your own sales', 403);
        }
    }

    /**
     * Create a sale. $offline = true is used by /sales/sync: keeps the device timestamp, tolerates
     * stock shortages (flagging the sale for review) and flags unverifiable GCash references.
     * Idempotent on client_uuid.
     *
     * @return array{sale: Sale, duplicate: bool, variant_ids: array<int,int>}
     */
    public function create(User $user, array $in, bool $offline = false): array
    {
        return DB::transaction(function () use ($user, $in, $offline) {
            $branchId = $user->role === 'admin' ? ($in['branch_id'] ?? $user->branch_id) : $user->branch_id;
            if (!$branchId) throw new ApiException('branch_id is required', 400);

            if (!empty($in['client_uuid'])) {
                $dupId = DB::table('sales')->where('client_uuid', $in['client_uuid'])->value('id');
                if ($dupId) return ['sale' => $this->find($dupId), 'duplicate' => true, 'variant_ids' => []];
            }

            $variants = $this->loadVariants($in['items']);
            $reasons = [];
            $subtotal = 0.0;
            $total = 0.0;
            $lines = [];
            foreach ($in['items'] as $it) {
                $v = $variants->get($it['variant_id']);
                $price = $this->priceLine($v, $it);
                $subtotal += $v->selling_price * $it['qty'];
                $total += $price * $it['qty'];
                $lines[] = ['v' => $v, 'price' => $price, 'qty' => (int) $it['qty']];
            }
            $subtotal = $this->r2($subtotal);
            $total = $this->r2($total);

            $tendered = $total;
            $change = 0.0;
            $gcashRef = $in['gcash_ref'] ?? null;
            if ($in['payment_method'] === 'cash') {
                $tendered = (float) ($in['amount_tendered'] ?? $total);
                if ($tendered < $total) throw new ApiException('Amount tendered is less than the total', 422);
                $change = $this->r2($tendered - $total);
                $gcashRef = null;
            } else {
                if (!$gcashRef && !$offline) throw new ApiException('GCash reference number is required', 422);
                if (!$gcashRef) $reasons[] = 'GCASH_REF_MISSING';
                if ($gcashRef && DB::table('sales')->where('gcash_ref', $gcashRef)->where('status', 'completed')->exists()) {
                    if (!$offline) throw new ApiException('This GCash reference number was already used', 409);
                    $reasons[] = 'GCASH_REF_DUPLICATE';
                }
                if ($offline) $reasons[] = 'GCASH_UNVERIFIED_OFFLINE';
            }

            $soldAt = now();
            if ($offline && !empty($in['device_created_at'])) {
                $d = Carbon::parse($in['device_created_at'])->setTimezone(config('app.timezone'));
                if ($d->lte($soldAt)) $soldAt = $d;
            }

            $saleId = DB::table('sales')->insertGetId([
                'receipt_no' => $this->nextReceiptNo($branchId),
                'client_uuid' => $in['client_uuid'] ?? null,
                'branch_id' => $branchId, 'cashier_id' => $user->id, 'customer_id' => $in['customer_id'] ?? null,
                'payment_method' => $in['payment_method'], 'gcash_ref' => $gcashRef,
                'subtotal' => $subtotal, 'discount_total' => $this->r2($subtotal - $total), 'total' => $total,
                'amount_tendered' => $tendered, 'change_given' => $change,
                'is_offline_sync' => $offline, 'device_info' => $in['device_info'] ?? null,
                'sold_at' => $soldAt, 'created_at' => now(),
            ]);

            foreach ($lines as $l) {
                $res = $this->stock->deductFefo($branchId, $l['v']->id, $l['qty'], 'sale', 'sales', $saleId, $user->id, $offline);
                if ($res['shortage']) $reasons[] = 'NEGATIVE_STOCK:' . $l['v']->id;
                foreach ($res['allocations'] as $a) {
                    DB::table('sale_items')->insert([
                        'sale_id' => $saleId, 'variant_id' => $l['v']->id, 'batch_id' => $a['batch_id'], 'qty' => $a['qty'],
                        'list_price' => $l['v']->selling_price, 'unit_price' => $l['price'],
                        'base_price' => $l['v']->base_price, 'unit_cost' => $l['v']->cost_price,
                        'line_total' => $this->r2($l['price'] * $a['qty']),
                    ]);
                }
            }

            if ($reasons) {
                DB::table('sales')->where('id', $saleId)->update(['needs_review' => true, 'review_reason' => implode(', ', array_unique($reasons))]);
            }

            if (!empty($in['customer_id'])) {
                $perPoint = max((float) Setting::read('loyalty_peso_per_point', 100), 1);
                $points = (int) floor($total / $perPoint);
                if ($points > 0) {
                    Customer::where('id', $in['customer_id'])->increment('loyalty_points', $points);
                    DB::table('loyalty_ledger')->insert(['customer_id' => $in['customer_id'], 'sale_id' => $saleId, 'points' => $points, 'reason' => 'purchase', 'created_at' => now()]);
                }
            }

            if (!empty($in['replaces_sale_id'])) {
                $ok = DB::table('voids')->where('sale_id', $in['replaces_sale_id'])->whereNull('replacement_sale_id')
                    ->update(['replacement_sale_id' => $saleId]);
                if (!$ok) throw new ApiException('replaces_sale_id must refer to a voided sale without a replacement', 422);
            }

            return ['sale' => $this->find($saleId), 'duplicate' => false, 'variant_ids' => array_map(fn ($l) => $l['v']->id, $lines)];
        });
    }

    /** Void: needs a Staff/Admin PIN. Stock goes back to the exact batches it came from. */
    public function void(User $user, int $saleId, array $in): Sale
    {
        $sale = Sale::findOrFail($saleId);
        $this->assertAccess($user, $sale);
        $approver = $this->approvers->verify($in['approver_username'], $in['approver_pin'], (int) $sale->branch_id); // outside tx on purpose

        return DB::transaction(function () use ($user, $saleId, $in, $approver) {
            $sale = Sale::lockForUpdate()->findOrFail($saleId);
            if ($sale->status === 'voided') throw new ApiException('Sale is already voided', 409);
            if (DB::table('exchanges')->where('original_sale_id', $saleId)->exists()) {
                throw new ApiException('A sale with an exchange cannot be voided', 409);
            }

            foreach (DB::table('sale_items')->where('sale_id', $saleId)->get() as $it) {
                if ($it->batch_id) {
                    $this->stock->addStock($sale->branch_id, $it->variant_id, $it->batch_id, $it->qty, 'void_restore', 'sales', $saleId, $user->id);
                }
            }
            DB::table('sales')->where('id', $saleId)->update(['status' => 'voided']);
            DB::table('voids')->insert([
                'sale_id' => $saleId, 'reason' => $in['reason'], 'voided_by' => $user->id,
                'approved_by' => $approver->id, 'created_at' => now(),
            ]);

            if ($sale->customer_id) {
                $earned = (int) DB::table('loyalty_ledger')->where('sale_id', $saleId)->sum('points');
                if ($earned > 0) {
                    DB::statement('UPDATE customers SET loyalty_points = GREATEST(loyalty_points - ?, 0) WHERE id = ?', [$earned, $sale->customer_id]);
                    DB::table('loyalty_ledger')->insert(['customer_id' => $sale->customer_id, 'sale_id' => $saleId, 'points' => -$earned, 'reason' => 'void', 'created_at' => now()]);
                }
            }
            AuditService::log($user, 'SALE_VOID', 'sale', $saleId, ['status' => 'completed'],
                ['status' => 'voided', 'reason' => $in['reason'], 'approved_by' => $approver->username]);
            return $this->find($saleId);
        });
    }

    /**
     * Exchange only (no refunds). Returned items go back to their original batch and branch.
     * The replacement must be equal or higher in value; the customer pays any difference.
     */
    public function exchange(User $user, int $saleId, array $in): array
    {
        $sale = Sale::findOrFail($saleId);
        $this->assertAccess($user, $sale);
        $approver = $this->approvers->verify($in['approver_username'], $in['approver_pin'], (int) $sale->branch_id);

        return DB::transaction(function () use ($user, $saleId, $in, $approver) {
            $sale = Sale::lockForUpdate()->findOrFail($saleId);
            if ($sale->status !== 'completed') throw new ApiException('Only completed sales can be exchanged', 409);

            $returnedValue = 0.0;
            $returned = [];
            foreach ($in['returned'] as $r) {
                $it = DB::table('sale_items')->where('id', $r['sale_item_id'])->where('sale_id', $saleId)->first();
                if (!$it) throw new ApiException('Item does not belong to this sale', 422, ['sale_item_id' => $r['sale_item_id']]);
                $done = (int) DB::table('exchange_items')->where('sale_item_id', $it->id)->where('direction', 'returned')->sum('qty');
                if ($r['qty'] > $it->qty - $done) throw new ApiException('Return quantity exceeds what is left on the sale', 422, ['sale_item_id' => $it->id]);
                $returnedValue += $it->unit_price * $r['qty'];
                $returned[] = ['it' => $it, 'qty' => (int) $r['qty']];
            }

            $variants = $this->loadVariants($in['given']);
            $givenValue = 0.0;
            $given = [];
            foreach ($in['given'] as $g) {
                $v = $variants->get($g['variant_id']);
                $price = $this->priceLine($v, $g);
                $givenValue += $price * $g['qty'];
                $given[] = ['v' => $v, 'price' => $price, 'qty' => (int) $g['qty']];
            }

            $diff = $this->r2($givenValue - $returnedValue);
            if ($diff < 0) throw new ApiException('Refunds are not allowed: the replacement must be equal or higher in value', 422, ['difference' => $diff]);
            if ($diff > 0) {
                if (empty($in['payment_method'])) throw new ApiException('payment_method is required when there is a price difference', 422);
                if ($in['payment_method'] === 'gcash' && empty($in['gcash_ref'])) throw new ApiException('GCash reference number is required', 422);
            }

            $exId = DB::table('exchanges')->insertGetId([
                'original_sale_id' => $saleId, 'branch_id' => $sale->branch_id, 'processed_by' => $user->id,
                'approved_by' => $approver->id, 'price_difference' => $diff,
                'payment_method' => $diff > 0 ? $in['payment_method'] : null,
                'gcash_ref' => $diff > 0 ? ($in['gcash_ref'] ?? null) : null,
                'note' => $in['note'] ?? null, 'created_at' => now(),
            ]);

            foreach ($returned as $r) {
                $it = $r['it'];
                if ($it->batch_id) {
                    $this->stock->addStock($sale->branch_id, $it->variant_id, $it->batch_id, $r['qty'], 'exchange_return', 'exchanges', $exId, $user->id);
                }
                DB::table('exchange_items')->insert([
                    'exchange_id' => $exId, 'direction' => 'returned', 'sale_item_id' => $it->id, 'variant_id' => $it->variant_id,
                    'batch_id' => $it->batch_id, 'qty' => $r['qty'], 'unit_price' => $it->unit_price, 'unit_cost' => $it->unit_cost,
                ]);
            }
            foreach ($given as $g) {
                $res = $this->stock->deductFefo($sale->branch_id, $g['v']->id, $g['qty'], 'exchange_out', 'exchanges', $exId, $user->id);
                foreach ($res['allocations'] as $a) {
                    DB::table('exchange_items')->insert([
                        'exchange_id' => $exId, 'direction' => 'given', 'variant_id' => $g['v']->id, 'batch_id' => $a['batch_id'],
                        'qty' => $a['qty'], 'unit_price' => $g['price'], 'unit_cost' => $g['v']->cost_price,
                    ]);
                }
            }

            AuditService::log($user, 'SALE_EXCHANGE', 'sale', $saleId, null,
                ['exchange_id' => $exId, 'price_difference' => $diff, 'approved_by' => $approver->username]);
            return ['exchange_id' => $exId, 'price_difference' => $diff, 'sale' => $this->find($saleId)];
        });
    }
}

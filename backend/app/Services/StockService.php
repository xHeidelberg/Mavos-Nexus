<?php

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Support\Facades\DB;

class StockService
{
    /** Add (or subtract, if qty < 0) stock in one specific batch at one branch, and log the movement. */
    public function addStock(
        int $branchId, int $variantId, int $batchId, int $qty, string $type,
        ?string $refTable = null, ?int $refId = null, ?int $userId = null, ?string $note = null,
        bool $allowNegative = false
    ): void {
        if ($qty < 0 && !$allowNegative) {
            $row = DB::table('branch_stock')->where(['branch_id' => $branchId, 'batch_id' => $batchId])->lockForUpdate()->first();
            if (!$row || $row->quantity + $qty < 0) {
                throw new ApiException('Insufficient stock in that batch', 409);
            }
        }
        DB::statement(
            'INSERT INTO branch_stock (branch_id, batch_id, variant_id, quantity) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + ?',
            [$branchId, $batchId, $variantId, $qty, $qty]
        );
        DB::table('stock_movements')->insert([
            'variant_id' => $variantId, 'batch_id' => $batchId, 'branch_id' => $branchId,
            'qty_change' => $qty, 'movement_type' => $type, 'ref_table' => $refTable, 'ref_id' => $refId,
            'note' => $note, 'user_id' => $userId, 'created_at' => now(),
        ]);
    }

    /**
     * First-Expire-First-Out deduction across batches (items with no expiry are taken last-in-line
     * by received date). Expired batches are never sold.
     * With $allowNegative (offline sync only) a shortage is pushed onto a batch row and reported.
     *
     * @return array{allocations: array<int, array{batch_id: ?int, qty: int}>, shortage: int}
     */
    public function deductFefo(
        int $branchId, int $variantId, int $qty, string $type,
        ?string $refTable, ?int $refId, ?int $userId, bool $allowNegative = false
    ): array {
        $rows = DB::table('branch_stock as bs')
            ->join('stock_batches as b', 'b.id', '=', 'bs.batch_id')
            ->where('bs.branch_id', $branchId)
            ->where('bs.variant_id', $variantId)
            ->where('bs.quantity', '>', 0)
            ->where(fn ($q) => $q->whereNull('b.expiry_date')->orWhere('b.expiry_date', '>=', now()->toDateString()))
            ->orderByRaw('b.expiry_date IS NULL, b.expiry_date ASC, b.received_at ASC, b.id ASC')
            ->lockForUpdate()
            ->get(['bs.batch_id', 'bs.quantity']);

        $remaining = $qty;
        $allocations = [];
        foreach ($rows as $r) {
            if ($remaining <= 0) break;
            $take = min($r->quantity, $remaining);
            $allocations[] = ['batch_id' => $r->batch_id, 'qty' => $take];
            $remaining -= $take;
        }

        $shortage = 0;
        if ($remaining > 0) {
            if (!$allowNegative) {
                throw new ApiException('Insufficient stock', 409, ['variant_id' => $variantId, 'short_by' => $remaining]);
            }
            $shortage = $remaining;
            $fallback = $rows->first()->batch_id
                ?? DB::table('branch_stock')->where(['branch_id' => $branchId, 'variant_id' => $variantId])->orderByDesc('batch_id')->value('batch_id');
            $allocations[] = ['batch_id' => $fallback, 'qty' => $remaining];
        }

        foreach ($allocations as $a) {
            if ($a['batch_id']) {
                $this->addStock($branchId, $variantId, $a['batch_id'], -$a['qty'], $type, $refTable, $refId, $userId, null, true);
            }
        }
        return ['allocations' => $allocations, 'shortage' => $shortage];
    }

    /** Variants at/below their low-stock threshold in a branch (optionally limited to some variant ids). */
    public function lowStock(int $branchId, ?array $variantIds = null): array
    {
        $in = '';
        $bind = [$branchId];
        if ($variantIds !== null) {
            if (!$variantIds) return [];
            $in = 'AND v.id IN (' . implode(',', array_fill(0, count($variantIds), '?')) . ')';
            $bind = array_merge($bind, array_values($variantIds));
        }
        return DB::select(
            "SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.label, v.low_stock_threshold,
                    CAST(COALESCE(SUM(bs.quantity), 0) AS SIGNED) AS on_hand
               FROM product_variants v
               JOIN products p ON p.id = v.product_id
               LEFT JOIN branch_stock bs ON bs.variant_id = v.id AND bs.branch_id = ?
              WHERE v.is_active = 1 AND p.is_active = 1 $in
              GROUP BY v.id, v.sku, p.name, v.label, v.low_stock_threshold
             HAVING COALESCE(SUM(bs.quantity), 0) <= v.low_stock_threshold
              ORDER BY on_hand ASC, p.name",
            $bind
        );
    }
}

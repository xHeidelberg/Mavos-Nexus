<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Models\StockBatch;
use App\Services\ApproverService;
use App\Services\AuditService;
use App\Services\Realtime;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class StockController extends Controller
{
    public function __construct(private StockService $stock, private ApproverService $approvers) {}

    /** Admin may choose any branch; everyone else is locked to their own. */
    private function branchFor(Request $r, bool $fallbackToMain = true): ?int
    {
        $u = $r->user();
        if ($u->role !== 'admin') return (int) $u->branch_id;
        $id = $r->input('branch_id', $r->query('branch_id'));
        return $id ? (int) $id : ($fallbackToMain ? Branch::mainId() : null);
    }

    // On-hand per variant for one branch, with batch breakdown (expiring first).
    public function index(Request $r)
    {
        $branch = $this->branchFor($r);
        $batches = DB::table('branch_stock as bs')->join('stock_batches as b', 'b.id', '=', 'bs.batch_id')
            ->where('bs.branch_id', $branch)->where('bs.quantity', '<>', 0)
            ->orderByRaw('b.expiry_date IS NULL, b.expiry_date')
            ->get(['bs.variant_id', 'b.id as batch_id', 'b.batch_no', 'b.expiry_date', 'bs.quantity'])->groupBy('variant_id');

        $items = ProductVariant::with('product.category')->where('is_active', true)->get()->map(fn ($v) => [
            'variant_id' => $v->id, 'sku' => $v->sku, 'product' => $v->product->name, 'label' => $v->label,
            'category' => $v->product->category->name, 'tracks_expiry' => $v->product->tracks_expiry_effective,
            'low_stock_threshold' => $v->low_stock_threshold,
            'on_hand' => (int) ($batches->get($v->id)?->sum('quantity') ?? 0),
            'batches' => $batches->get($v->id)?->values() ?? [],
        ])->sortBy('product')->values();
        return ['branch_id' => $branch, 'items' => $items];
    }

    public function low(Request $r)
    {
        return $this->stock->lowStock($this->branchFor($r));
    }

    public function expiring(Request $r)
    {
        $days = (int) ($r->query('days') ?: Setting::read('expiry_alert_days', 90));
        $branch = $this->branchFor($r, false);
        $items = DB::table('branch_stock as bs')
            ->join('stock_batches as b', 'b.id', '=', 'bs.batch_id')
            ->join('product_variants as v', 'v.id', '=', 'bs.variant_id')
            ->join('products as p', 'p.id', '=', 'v.product_id')
            ->join('branches as br', 'br.id', '=', 'bs.branch_id')
            ->where('bs.quantity', '>', 0)->whereNotNull('b.expiry_date')
            ->where('b.expiry_date', '<=', now()->addDays($days)->toDateString())
            ->when($branch, fn ($q) => $q->where('bs.branch_id', $branch))
            ->orderBy('b.expiry_date')
            ->get(['br.name as branch', 'v.sku', 'p.name as product', 'v.label', 'b.batch_no', 'b.expiry_date', 'bs.quantity',
                DB::raw('DATEDIFF(b.expiry_date, CURDATE()) as days_left')]);
        return ['within_days' => $days, 'items' => $items];
    }

    public function movements(Request $r)
    {
        $branch = $this->branchFor($r, false);
        return DB::table('stock_movements as m')
            ->join('product_variants as v', 'v.id', '=', 'm.variant_id')
            ->join('products as p', 'p.id', '=', 'v.product_id')
            ->leftJoin('users as u', 'u.id', '=', 'm.user_id')
            ->when($branch, fn ($q) => $q->where('m.branch_id', $branch))
            ->when($r->query('variant_id'), fn ($q, $v) => $q->where('m.variant_id', $v))
            ->orderByDesc('m.id')->limit(200)
            ->get(['m.*', 'v.sku', 'p.name as product', 'v.label', 'u.username']);
    }

    // Receive new stock = create a batch. Expiry is required (or auto-derived) only when the item tracks expiry.
    public function receive(Request $r)
    {
        $d = $r->validate([
            'branch_id' => 'sometimes|exists:branches,id',
            'variant_id' => 'required|exists:product_variants,id',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'batch_no' => 'nullable|string|max:60',
            'qty' => 'required|integer|min:1',
            'expiry_date' => 'nullable|date_format:Y-m-d',
        ]);
        $u = $r->user();
        $batch = DB::transaction(function () use ($d, $u) {
            $branch = $u->role === 'admin' ? ($d['branch_id'] ?? Branch::mainId()) : $u->branch_id;
            if (!$branch) throw new ApiException('No branch to receive into', 400);
            $v = ProductVariant::with('product.category')->findOrFail($d['variant_id']);
            $p = $v->product;
            $expiry = $d['expiry_date'] ?? null;
            if ($p->tracks_expiry_effective) {
                if (!$expiry && $p->shelf_life_months_effective) $expiry = now()->addMonths($p->shelf_life_months_effective)->toDateString();
                if (!$expiry) throw new ApiException('expiry_date is required for this item', 422);
            } else {
                $expiry = null; // apparel & other non-expiring goods
            }
            $batchNo = $d['batch_no'] ?? ('B-' . now()->format('Ymd') . '-' . strtoupper(Str::random(4)));
            $batch = StockBatch::create(['variant_id' => $v->id, 'supplier_id' => $d['supplier_id'] ?? null, 'batch_no' => $batchNo,
                'received_at' => now()->toDateString(), 'expiry_date' => $expiry, 'qty_received' => $d['qty'], 'created_by' => $u->id]);
            $this->stock->addStock($branch, $v->id, $batch->id, $d['qty'], 'stock_in', 'stock_batches', $batch->id, $u->id);
            AuditService::log($u, 'STOCK_RECEIVED', 'stock_batch', $batch->id, null, ['branch_id' => $branch, 'qty' => $d['qty'], 'batch_no' => $batchNo]);
            return $batch;
        });
        return response()->json($batch, 201);
    }

    // Manual adjustment: needs a Staff/Admin PIN.
    public function adjust(Request $r)
    {
        $d = $r->validate([
            'branch_id' => 'sometimes|exists:branches,id',
            'variant_id' => 'required|exists:product_variants,id',
            'batch_id' => 'required|exists:stock_batches,id',
            'qty_change' => 'required|integer|not_in:0',
            'reason' => 'required|string|min:3|max:300',
            'approver_username' => 'required|string',
            'approver_pin' => ['required', 'regex:/^\d{4}$/'],
        ]);
        $u = $r->user();
        $branch = $u->role === 'admin' ? ($d['branch_id'] ?? $u->branch_id) : $u->branch_id;
        if (!$branch) throw new ApiException('branch_id is required', 400);
        $approver = $this->approvers->verify($d['approver_username'], $d['approver_pin'], (int) $branch); // before the tx

        $id = DB::transaction(function () use ($d, $u, $branch, $approver) {
            $this->stock->addStock($branch, $d['variant_id'], $d['batch_id'], $d['qty_change'], 'adjustment', 'stock_adjustments', null, $u->id, $d['reason']);
            $id = DB::table('stock_adjustments')->insertGetId(['branch_id' => $branch, 'variant_id' => $d['variant_id'], 'batch_id' => $d['batch_id'],
                'qty_change' => $d['qty_change'], 'reason' => $d['reason'], 'created_by' => $u->id, 'approved_by' => $approver->id,
                'created_at' => now(), 'updated_at' => now()]);
            AuditService::log($u, 'STOCK_ADJUSTED', 'stock_adjustment', $id, null, $d + ['approved_by' => $approver->username]);
            return $id;
        });
        $low = $this->stock->lowStock($branch, [(int) $d['variant_id']]);
        if ($low) Realtime::emit('stock:low', $branch, ['branch_id' => $branch, 'items' => $low]);
        return response()->json(['id' => $id], 201);
    }
}

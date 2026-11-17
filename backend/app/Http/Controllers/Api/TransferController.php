<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Services\AuditService;
use App\Services\Realtime;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Main -> branch transfers. Stock leaves the sender immediately and arrives only when the receiver confirms. */
class TransferController extends Controller
{
    public function __construct(private StockService $stock) {}

    public function index(Request $r)
    {
        $u = $r->user();
        $rows = DB::table('stock_transfers as t')
            ->join('branches as fb', 'fb.id', '=', 't.from_branch_id')->join('branches as tb', 'tb.id', '=', 't.to_branch_id')
            ->when($u->role !== 'admin', fn ($q) => $q->where(fn ($w) => $w->where('t.from_branch_id', $u->branch_id)->orWhere('t.to_branch_id', $u->branch_id)))
            ->orderByDesc('t.id')->limit(100)->get(['t.*', 'fb.name as from_name', 'tb.name as to_name']);
        $items = DB::table('stock_transfer_items as i')
            ->join('product_variants as v', 'v.id', '=', 'i.variant_id')->join('products as p', 'p.id', '=', 'v.product_id')
            ->join('stock_batches as b', 'b.id', '=', 'i.batch_id')
            ->whereIn('i.transfer_id', $rows->pluck('id'))
            ->get(['i.id', 'i.transfer_id', 'i.variant_id', 'v.sku', 'p.name as product', 'v.label', 'b.batch_no', 'b.expiry_date', 'i.qty', 'i.received_qty'])
            ->groupBy('transfer_id');
        return $rows->map(fn ($t) => (array) $t + ['items' => $items->get($t->id, collect())->values()]);
    }

    public function store(Request $r)
    {
        $d = $r->validate([
            'from_branch_id' => 'sometimes|exists:branches,id',
            'to_branch_id' => 'required|exists:branches,id',
            'note' => 'nullable|string|max:300',
            'items' => 'required|array|min:1',
            'items.*.variant_id' => 'required|exists:product_variants,id',
            'items.*.qty' => 'required|integer|min:1',
        ]);
        $u = $r->user();
        $t = DB::transaction(function () use ($d, $u) {
            $from = $d['from_branch_id'] ?? Branch::mainId();
            if (!$from) throw new ApiException('No source branch', 400);
            if ((int) $from === (int) $d['to_branch_id']) throw new ApiException('Source and destination must differ', 422);
            $no = 'TR-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
            $id = DB::table('stock_transfers')->insertGetId(['transfer_no' => $no, 'from_branch_id' => $from, 'to_branch_id' => $d['to_branch_id'],
                'note' => $d['note'] ?? null, 'created_by' => $u->id, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($d['items'] as $it) {
                $res = $this->stock->deductFefo($from, $it['variant_id'], $it['qty'], 'transfer_out', 'stock_transfers', $id, $u->id);
                foreach ($res['allocations'] as $a) {
                    DB::table('stock_transfer_items')->insert(['transfer_id' => $id, 'variant_id' => $it['variant_id'], 'batch_id' => $a['batch_id'], 'qty' => $a['qty']]);
                }
            }
            AuditService::log($u, 'TRANSFER_CREATED', 'stock_transfer', $id, null, ['transfer_no' => $no]);
            return DB::table('stock_transfers')->find($id);
        });
        Realtime::emit('transfer:incoming', (int) $t->to_branch_id, (array) $t);
        return response()->json($t, 201);
    }

    // Destination confirms what actually arrived. Omit `items` to confirm everything in full.
    public function receive(Request $r, int $id)
    {
        $d = $r->validate(['items' => 'sometimes|array', 'items.*.item_id' => 'required|integer', 'items.*.received_qty' => 'required|integer|min:0']);
        $u = $r->user();
        $t = DB::transaction(function () use ($id, $d, $u) {
            $t = DB::table('stock_transfers')->where('id', $id)->lockForUpdate()->first();
            if (!$t) throw new ApiException('Transfer not found', 404);
            if ($t->status !== 'in_transit') throw new ApiException("Transfer is already {$t->status}", 409);
            if ($u->role !== 'admin' && (int) $u->branch_id !== (int) $t->to_branch_id) throw new ApiException('Only the receiving branch can confirm', 403);
            $given = collect($d['items'] ?? [])->pluck('received_qty', 'item_id');
            $discrepancy = false;
            foreach (DB::table('stock_transfer_items')->where('transfer_id', $id)->get() as $it) {
                $got = $given->has($it->id) ? (int) $given[$it->id] : $it->qty;
                if ($got > $it->qty) throw new ApiException('Received quantity cannot exceed the quantity sent', 422, ['item_id' => $it->id]);
                if ($got !== $it->qty) $discrepancy = true;
                DB::table('stock_transfer_items')->where('id', $it->id)->update(['received_qty' => $got]);
                if ($got > 0) $this->stock->addStock($t->to_branch_id, $it->variant_id, $it->batch_id, $got, 'transfer_in', 'stock_transfers', $id, $u->id);
            }
            DB::table('stock_transfers')->where('id', $id)->update(['status' => 'received', 'received_by' => $u->id, 'received_at' => now(),
                'has_discrepancy' => $discrepancy, 'updated_at' => now()]);
            AuditService::log($u, 'TRANSFER_RECEIVED', 'stock_transfer', $id, null, ['discrepancy' => $discrepancy]);
            return DB::table('stock_transfers')->find($id);
        });
        if ($t->has_discrepancy) Realtime::emit('transfer:discrepancy', (int) $t->to_branch_id, (array) $t);
        return $t;
    }

    public function cancel(Request $r, int $id)
    {
        $u = $r->user();
        return DB::transaction(function () use ($id, $u) {
            $t = DB::table('stock_transfers')->where('id', $id)->lockForUpdate()->first();
            if (!$t) throw new ApiException('Transfer not found', 404);
            if ($t->status !== 'in_transit') throw new ApiException("Transfer is already {$t->status}", 409);
            foreach (DB::table('stock_transfer_items')->where('transfer_id', $id)->get() as $it) {
                $this->stock->addStock($t->from_branch_id, $it->variant_id, $it->batch_id, $it->qty, 'transfer_cancel', 'stock_transfers', $id, $u->id);
            }
            DB::table('stock_transfers')->where('id', $id)->update(['status' => 'cancelled', 'updated_at' => now()]);
            AuditService::log($u, 'TRANSFER_CANCELLED', 'stock_transfer', $id);
            return DB::table('stock_transfers')->find($id);
        });
    }
}

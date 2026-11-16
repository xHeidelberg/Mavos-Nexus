<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Services\AuditService;
use App\Services\Realtime;
use App\Services\SaleService;
use App\Services\StockService;
use Illuminate\Http\Request;

class SaleController extends Controller
{
    public function __construct(private SaleService $sales, private StockService $stock) {}

    private function saleRules(bool $sync = false): array
    {
        return [
            'client_uuid' => ($sync ? 'required' : 'nullable') . '|uuid',
            'branch_id' => 'sometimes|integer|exists:branches,id',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'payment_method' => 'required|in:cash,gcash',
            'gcash_ref' => 'nullable|string|min:4|max:40',
            'amount_tendered' => 'nullable|numeric|min:0',
            'items' => 'required|array|min:1',
            'items.*.variant_id' => 'required|integer',
            'items.*.qty' => 'required|integer|min:1',
            'items.*.unit_price' => 'nullable|numeric|min:0', // between base and list price
            'replaces_sale_id' => 'nullable|integer',
            'device_info' => 'nullable|string|max:200',
            'device_created_at' => 'nullable|date',           // only honoured by /sales/sync
        ];
    }

    private function afterSale(array $result): void
    {
        $s = $result['sale'];
        Realtime::emit('sale:created', (int) $s->branch_id, [
            'id' => $s->id, 'receipt_no' => $s->receipt_no, 'branch_id' => $s->branch_id, 'branch_name' => $s->branch->name,
            'cashier_id' => $s->cashier_id, 'cashier_name' => $s->cashier->full_name, 'total' => $s->total,
            'payment_method' => $s->payment_method, 'needs_review' => $s->needs_review, 'sold_at' => $s->sold_at,
        ]);
        $low = $this->stock->lowStock((int) $s->branch_id, $result['variant_ids']);
        if ($low) Realtime::emit('stock:low', (int) $s->branch_id, ['branch_id' => $s->branch_id, 'items' => $low]);
    }

    private function filtered(Request $r)
    {
        $u = $r->user();
        return Sale::visibleTo($u)
            ->when($u->role === 'admin' && $r->query('branch_id'), fn ($q) => $q->where('branch_id', $r->query('branch_id')))
            ->when($u->role !== 'sales' && $r->query('cashier_id'), fn ($q) => $q->where('cashier_id', $r->query('cashier_id')))
            ->when($r->query('from'), fn ($q, $v) => $q->where('sold_at', '>=', $v))
            ->when($r->query('to'), fn ($q, $v) => $q->where('sold_at', '<', $v))
            ->when($r->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($r->query('needs_review') === 'true', fn ($q) => $q->where('needs_review', true))
            ->orderByDesc('sold_at');
    }

    public function index(Request $r)
    {
        return $this->filtered($r)->with(['branch:id,name', 'cashier:id,full_name'])->paginate(min((int) $r->query('per_page', 50), 200));
    }

    private function csvText(string $value): string
    {
        return preg_match('/^[\x00-\x20\xEF\xBB\xBF]*[=+\-@]/', $value) ? "'".$value : $value;
    }

    public function export(Request $r)
    {
        $q = $this->filtered($r)->with(['branch:id,name', 'cashier:id,full_name'])->limit(50000);
        AuditService::log($r->user(), 'SALES_EXPORTED', 'sale');
        return response()->streamDownload(function () use ($q) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Receipt No', 'Date/Time', 'Branch', 'Cashier', 'Payment', 'GCash Ref', 'Subtotal', 'Discount', 'Total', 'Status', 'Needs Review']);
            foreach ($q->cursor() as $s) {
                fputcsv($out, [$this->csvText((string) $s->receipt_no), $s->sold_at, $this->csvText((string) $s->branch->name), $this->csvText((string) $s->cashier->full_name), $s->payment_method, $this->csvText((string) $s->gcash_ref),
                    $s->subtotal, $s->discount_total, $s->total, $s->status, $s->needs_review ? 'yes' : 'no']);
            }
            fclose($out);
        }, 'sales.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function store(Request $r)
    {
        $result = $this->sales->create($r->user(), $r->validate($this->saleRules()), false);
        if (!$result['duplicate']) $this->afterSale($result);
        return response()->json($result['sale'], $result['duplicate'] ? 200 : 201);
    }

    // Offline queue flush: each sale is its own transaction; the response reports a status per client_uuid.
    public function sync(Request $r)
    {
        $r->validate(['sales' => 'required|array|min:1|max:200']);
        $rules = collect($this->saleRules(true))->mapWithKeys(fn ($v, $k) => ["sales.*.$k" => $v])->all();
        $d = $r->validate($rules);
        $ordered = collect($d['sales'])->sortBy(fn ($s) => $s['device_created_at'] ?? '')->values();
        $results = [];
        foreach ($ordered as $s) {
            try {
                $res = $this->sales->create($r->user(), $s, true);
                if (!$res['duplicate']) $this->afterSale($res);
                $results[] = ['client_uuid' => $s['client_uuid'], 'status' => $res['duplicate'] ? 'duplicate' : 'created',
                    'sale_id' => $res['sale']->id, 'receipt_no' => $res['sale']->receipt_no, 'needs_review' => $res['sale']->needs_review];
            } catch (ApiException $e) {
                $results[] = ['client_uuid' => $s['client_uuid'], 'status' => 'rejected', 'error' => $e->getMessage(), 'details' => $e->details];
            } catch (\Throwable $e) {
                report($e);
                $results[] = ['client_uuid' => $s['client_uuid'], 'status' => 'rejected', 'error' => 'Server error'];
            }
        }
        return ['results' => $results];
    }

    public function show(Request $r, int $id)
    {
        Sale::visibleTo($r->user())->findOrFail($id);
        return $this->sales->find($id);
    }

    public function void(Request $r, int $id)
    {
        $d = $r->validate(['reason' => 'required|string|min:3|max:300', 'approver_username' => 'required|string', 'approver_pin' => ['required', 'regex:/^\d{4}$/']]);
        $sale = $this->sales->void($r->user(), $id, $d);
        Realtime::emit('sale:voided', (int) $sale->branch_id, ['id' => $sale->id, 'receipt_no' => $sale->receipt_no, 'reason' => $d['reason']]);
        return $sale;
    }

    public function exchange(Request $r, int $id)
    {
        $d = $r->validate([
            'returned' => 'required|array|min:1',
            'returned.*.sale_item_id' => 'required|integer',
            'returned.*.qty' => 'required|integer|min:1',
            'given' => 'required|array|min:1',
            'given.*.variant_id' => 'required|integer',
            'given.*.qty' => 'required|integer|min:1',
            'given.*.unit_price' => 'nullable|numeric|min:0',
            'payment_method' => 'nullable|in:cash,gcash',
            'gcash_ref' => 'nullable|string|min:4|max:40',
            'note' => 'nullable|string|max:300',
            'approver_username' => 'required|string',
            'approver_pin' => ['required', 'regex:/^\d{4}$/'],
        ]);
        return response()->json($this->sales->exchange($r->user(), $id, $d), 201);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Expense;
use App\Models\Setting;
use App\Services\AuditService;
use Illuminate\Http\Request;

/** Expenses, audit log, settings. */
class MiscController extends Controller
{
    public function expenses(Request $r)
    {
        $u = $r->user();
        $branch = $u->role === 'admin' ? $r->query('branch_id') : $u->branch_id;
        return Expense::with('branch:id,name')
            ->when($branch, fn ($q) => $q->where('branch_id', $branch))
            ->when($r->query('from'), fn ($q, $v) => $q->where('expense_date', '>=', $v))
            ->when($r->query('to'), fn ($q, $v) => $q->where('expense_date', '<', $v))
            ->orderByDesc('expense_date')->orderByDesc('id')->limit(500)->get();
    }

    public function storeExpense(Request $r)
    {
        $d = $r->validate(['branch_id' => 'sometimes|exists:branches,id', 'category' => 'required|string|max:60',
            'description' => 'nullable|string|max:300', 'amount' => 'required|numeric|gt:0', 'expense_date' => 'nullable|date_format:Y-m-d']);
        $u = $r->user();
        $e = Expense::create([
            'branch_id' => $u->role === 'admin' ? ($d['branch_id'] ?? $u->branch_id) : $u->branch_id,
            'category' => $d['category'], 'description' => $d['description'] ?? null, 'amount' => $d['amount'],
            'expense_date' => $d['expense_date'] ?? now()->toDateString(), 'created_by' => $u->id,
        ]);
        AuditService::log($u, 'EXPENSE_CREATED', 'expense', $e->id, null, $e->toArray());
        return response()->json($e, 201);
    }

    public function audit(Request $r)
    {
        return AuditLog::with('user:id,username')
            ->when($r->query('entity'), fn ($q, $v) => $q->where('entity', $v))
            ->when($r->query('action'), fn ($q, $v) => $q->where('action', $v))
            ->when($r->query('user_id'), fn ($q, $v) => $q->where('user_id', $v))
            ->orderByDesc('id')->paginate(min((int) $r->query('per_page', 100), 500));
    }

    public function settings()
    {
        return Setting::all()->pluck('value', 'key');
    }

    public function putSetting(Request $r, string $key)
    {
        abort_unless(in_array($key, ['expiry_alert_days', 'loyalty_peso_per_point'], true), 404, 'Unknown setting');
        $d = $r->validate(['value' => 'required|numeric|min:1']);
        Setting::updateOrCreate(['key' => $key], ['value' => $d['value'] + 0]);
        AuditService::log($r->user(), 'SETTING_CHANGED', 'setting', $key, null, ['value' => $d['value']]);
        return ['ok' => true];
    }
}

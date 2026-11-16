<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Services\AuditService;
use Illuminate\Http\Request;

class EmployeeController extends Controller
{
    public function index(Request $r)
    {
        $search = trim((string) $r->query('search', ''));
        return Employee::with('branch:id,name')
            ->when($r->query('branch_id'), fn ($q, $b) => $q->where('branch_id', $b))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('full_name', 'like', "%$search%")->orWhere('position', 'like', "%$search%")))
            ->orderByDesc('is_active')->orderBy('full_name')->get();
    }

    private function rules(bool $create): array
    {
        $s = $create ? 'required' : 'sometimes';
        return [
            'branch_id' => "$s|exists:branches,id",
            'full_name' => "$s|string|max:120",
            'position' => 'nullable|string|max:80',
            'contact_number' => 'nullable|string|max:30',
            'address' => 'nullable|string|max:300',
            'date_hired' => 'nullable|date_format:Y-m-d',
            'tin' => 'nullable|string|max:20',
            'pay_basis' => "$s|in:monthly,daily",
            'rate' => "$s|numeric|gt:0",
            'pay_frequency' => "$s|in:weekly,semi_monthly,monthly",
            'payment_method' => "$s|in:cash,gcash,maya",
            'ewallet_number' => ['nullable', 'regex:/^(09|\+639)\d{9}$/'],
            'ewallet_account_name' => 'nullable|string|max:100',
            'deductions_status' => 'sometimes|in:pending,configured',
            'sss_enabled' => 'sometimes|boolean', 'sss_number' => 'nullable|string|max:20', 'sss_fixed_amount' => 'nullable|numeric|min:0',
            'philhealth_enabled' => 'sometimes|boolean', 'philhealth_number' => 'nullable|string|max:20', 'philhealth_fixed_amount' => 'nullable|numeric|min:0',
            'pagibig_enabled' => 'sometimes|boolean', 'pagibig_number' => 'nullable|string|max:20', 'pagibig_fixed_amount' => 'nullable|numeric|min:0',
            'is_active' => 'sometimes|boolean',
        ];
    }

    /** Cross-field rules: e-wallet details when paid by GCash/Maya; ID numbers for every deduction that is switched on. */
    private function normalize(array $d, ?Employee $existing): array
    {
        $m = array_merge($existing?->toArray() ?? [], $d);

        if (in_array($m['payment_method'] ?? 'cash', ['gcash', 'maya'], true)) {
            if (empty($m['ewallet_number'])) throw new ApiException('Enter the ' . strtoupper($m['payment_method']) . ' mobile number to pay to.', 422);
            if (empty($m['ewallet_account_name'])) throw new ApiException('Enter the name registered on the e-wallet account.', 422);
        } else {
            $d['ewallet_number'] = null;
            $d['ewallet_account_name'] = null;
        }

        $status = $m['deductions_status'] ?? 'pending';
        if ($status === 'configured') {
            foreach (['sss' => [10, 'SSS'], 'philhealth' => [12, 'PhilHealth'], 'pagibig' => [12, 'Pag-IBIG']] as $k => [$digits, $label]) {
                if (!empty($m["{$k}_enabled"])) {
                    $num = preg_replace('/\D/', '', (string) ($m["{$k}_number"] ?? ''));
                    if (strlen($num) !== $digits) throw new ApiException("$label number must be $digits digits.", 422);
                    $d["{$k}_number"] = $num;
                }
            }
        } elseif (array_key_exists('deductions_status', $d)) {
            // "Set up later": nothing is deducted until it is configured.
            foreach (['sss', 'philhealth', 'pagibig'] as $k) {
                $d["{$k}_enabled"] = false; $d["{$k}_fixed_amount"] = null;
            }
        }
        return $d;
    }

    public function store(Request $r)
    {
        $d = $this->normalize($r->validate($this->rules(true)), null);
        $e = Employee::create($d);
        AuditService::log($r->user(), 'EMPLOYEE_CREATED', 'employee', $e->id, null, ['name' => $e->full_name, 'payment_method' => $e->payment_method]);
        return response()->json($e->load('branch:id,name'), 201);
    }

    public function update(Request $r, Employee $employee)
    {
        $d = $this->normalize($r->validate($this->rules(false)), $employee);
        $old = $employee->toArray();
        $employee->update($d);
        AuditService::log($r->user(), 'EMPLOYEE_UPDATED', 'employee', $employee->id, $old, $employee->fresh()->toArray());
        return $employee->fresh('branch:id,name');
    }
}

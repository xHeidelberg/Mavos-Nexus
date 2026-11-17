<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\Setting;
use App\Services\AuditService;
use App\Services\PayrollService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PayrollController extends Controller
{
    public function __construct(private PayrollService $payroll) {}

    // ----- Contribution rates (editable because the law changes) -----
    public function rates()
    {
        return ['rates' => $this->payroll->rates(), 'defaults' => PayrollService::DEFAULT_RATES];
    }

    public function updateRates(Request $r)
    {
        $rules = collect(array_keys(PayrollService::DEFAULT_RATES))->mapWithKeys(fn ($k) => [$k => 'required|numeric|min:0'])->all();
        $d = $r->validate($rules);
        $old = $this->payroll->rates();
        Setting::updateOrCreate(['key' => 'payroll_rates'], ['value' => array_map('floatval', $d)]);
        AuditService::log($r->user(), 'PAYROLL_RATES_CHANGED', 'setting', 'payroll_rates', $old, $d);
        return ['ok' => true];
    }

    // ----- Runs -----
    public function runs()
    {
        return PayrollRun::with('branch:id,name')->withCount('payslips')
            ->withSum('payslips as total_net', 'net_pay')
            ->withCount(['payslips as paid_count' => fn ($q) => $q->whereNotNull('paid_at')])
            ->orderByDesc('id')->limit(100)->get();
    }

    public function createRun(Request $r)
    {
        $d = $r->validate([
            'branch_id' => 'nullable|exists:branches,id',
            'pay_frequency' => 'required|in:weekly,semi_monthly,monthly',
            'period_start' => 'required|date_format:Y-m-d',
            'period_end' => 'required|date_format:Y-m-d|after_or_equal:period_start',
            'pay_date' => 'required|date_format:Y-m-d',
            'notes' => 'nullable|string|max:300',
        ]);

        $run = DB::transaction(function () use ($d, $r) {
            $clash = PayrollRun::where('pay_frequency', $d['pay_frequency'])->where('period_start', $d['period_start'])->where('period_end', $d['period_end'])
                ->when(!empty($d['branch_id']), fn ($q) => $q->where(fn ($w) => $w->where('branch_id', $d['branch_id'])->orWhereNull('branch_id')))
                ->exists();
            if ($clash) throw new ApiException('A payroll run for this period already exists.', 422);

            $employees = Employee::where('is_active', true)->where('pay_frequency', $d['pay_frequency'])
                ->when(!empty($d['branch_id']), fn ($q) => $q->where('branch_id', $d['branch_id']))->get();
            if ($employees->isEmpty()) throw new ApiException('No active employees are paid ' . str_replace('_', '-', $d['pay_frequency']) . ' in this selection.', 422);

            $run = PayrollRun::create($d + ['created_by' => $r->user()->id]);
            foreach ($employees as $e) $this->insertPayslip($run, $e);
            AuditService::log($r->user(), 'PAYROLL_RUN_CREATED', 'payroll_run', $run->id, null, ['period' => "{$d['period_start']} to {$d['period_end']}", 'employees' => $employees->count()]);
            return $run;
        });
        return response()->json($this->show($run->id), 201);
    }

    private function insertPayslip(PayrollRun $run, Employee $e, array $in = []): void
    {
        $calc = $this->payroll->compute($e, $run->pay_frequency, $in);
        Payslip::create($calc + [
            'run_id' => $run->id, 'employee_id' => $e->id, 'other_deductions_note' => $in['other_deductions_note'] ?? null,
            'payment_method' => $e->payment_method, 'ewallet_number' => $e->ewallet_number, 'ewallet_account_name' => $e->ewallet_account_name,
        ]);
    }

    public function show(int $id)
    {
        $run = PayrollRun::with(['branch:id,name', 'payslips.employee:id,full_name,position,branch_id', 'payslips.employee.branch:id,name'])->findOrFail($id);
        $slips = $run->payslips->sortBy(fn ($p) => $p->employee->full_name)->values();
        $byMethod = $slips->groupBy('payment_method')->map(fn ($g) => round($g->sum('net_pay'), 2));
        return [
            'run' => $run->setRelation('payslips', $slips),
            'summary' => [
                'gross' => round($slips->sum('gross_pay'), 2), 'deductions' => round($slips->sum('total_deductions'), 2),
                'net' => round($slips->sum('net_pay'), 2), 'by_method' => $byMethod,
                'pending_deductions' => $slips->where('deductions_pending', true)->count(),
                'unpaid' => $slips->whereNull('paid_at')->count(),
            ],
        ];
    }

    private function draft(PayrollRun $run): void
    {
        if ($run->status !== 'draft') throw new ApiException('This payroll run is finalized and can no longer be changed.', 422);
    }

    public function updatePayslip(Request $r, int $id)
    {
        $d = $r->validate([
            'days_worked' => 'nullable|numeric|min:0|max:31', 'allowances' => 'nullable|numeric|min:0',
            'other_deductions' => 'nullable|numeric|min:0', 'other_deductions_note' => 'nullable|string|max:120',
        ]);
        $slip = Payslip::with('run', 'employee')->findOrFail($id);
        $this->draft($slip->run);
        $in = array_merge(['days_worked' => $slip->days_worked, 'allowances' => $slip->allowances, 'other_deductions' => $slip->other_deductions], $d);
        $calc = $this->payroll->compute($slip->employee, $slip->run->pay_frequency, $in);
        $old = $slip->only(['days_worked', 'allowances', 'other_deductions', 'net_pay']);
        $slip->update($calc + ['other_deductions_note' => $d['other_deductions_note'] ?? $slip->other_deductions_note]);
        AuditService::log($r->user(), 'PAYSLIP_UPDATED', 'payslip', $slip->id, $old, $slip->only(['days_worked', 'allowances', 'other_deductions', 'net_pay']));
        return $slip->fresh('employee');
    }

    // Re-read each employee's current pay and deduction setup (e.g. after "set up later" was completed).
    public function recalculate(Request $r, int $id)
    {
        $run = PayrollRun::findOrFail($id);
        $this->draft($run);
        DB::transaction(function () use ($run) {
            foreach (Payslip::with('employee')->where('run_id', $run->id)->get() as $slip) {
                $e = $slip->employee;
                $calc = $this->payroll->compute($e, $run->pay_frequency, ['days_worked' => $slip->days_worked, 'allowances' => $slip->allowances, 'other_deductions' => $slip->other_deductions]);
                $slip->update($calc + ['payment_method' => $e->payment_method, 'ewallet_number' => $e->ewallet_number, 'ewallet_account_name' => $e->ewallet_account_name]);
            }
        });
        AuditService::log($r->user(), 'PAYROLL_RECALCULATED', 'payroll_run', $run->id);
        return $this->show($run->id);
    }

    public function finalize(Request $r, int $id)
    {
        $run = PayrollRun::findOrFail($id);
        $this->draft($run);
        $pending = Payslip::where('run_id', $run->id)->where('deductions_pending', true)->count();
        $run->update(['status' => 'finalized', 'finalized_by' => $r->user()->id, 'finalized_at' => now()]);
        AuditService::log($r->user(), 'PAYROLL_FINALIZED', 'payroll_run', $run->id, null, ['deductions_pending' => $pending]);
        return $this->show($run->id);
    }

    public function pay(Request $r, int $id)
    {
        $d = $r->validate(['payment_reference' => 'nullable|string|min:4|max:60']);
        $slip = Payslip::with('run', 'employee')->findOrFail($id);
        if ($slip->run->status !== 'finalized') throw new ApiException('Finalize the payroll run before marking salaries as paid.', 422);
        if ($slip->paid_at) throw new ApiException('This payslip is already marked as paid.', 409);
        if ($slip->payment_method !== 'cash' && empty($d['payment_reference'])) {
            throw new ApiException('Enter the ' . strtoupper($slip->payment_method) . ' reference number for this transfer.', 422);
        }
        $slip->update(['paid_at' => now(), 'paid_by' => $r->user()->id, 'payment_reference' => $d['payment_reference'] ?? null]);
        AuditService::log($r->user(), 'PAYSLIP_PAID', 'payslip', $slip->id, null, ['employee' => $slip->employee->full_name, 'net_pay' => $slip->net_pay, 'method' => $slip->payment_method]);
        return $slip->fresh('employee');
    }

    public function destroyRun(Request $r, int $id)
    {
        $run = PayrollRun::findOrFail($id);
        $this->draft($run);
        $run->delete();
        AuditService::log($r->user(), 'PAYROLL_RUN_DELETED', 'payroll_run', $id);
        return ['ok' => true];
    }
}

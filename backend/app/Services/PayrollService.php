<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Employee;
use App\Models\Setting;

/**
 * Government contributions are the EMPLOYEE share only (what is deducted from pay).
 * Defaults follow the published 2025-2026 schedules; they are editable in Setup because rates change.
 * Contributions are worked out per month, then split across the pay periods in that month.
 */
class PayrollService
{
    public const DEFAULT_RATES = [
        'sss_rate' => 0.05, 'sss_min_msc' => 5000, 'sss_max_msc' => 35000,
        'philhealth_rate' => 0.025, 'philhealth_floor' => 10000, 'philhealth_ceiling' => 100000,
        'pagibig_rate' => 0.02, 'pagibig_low_rate' => 0.01, 'pagibig_low_threshold' => 1500, 'pagibig_max_salary' => 10000,
        'days_per_month' => 26,
    ];
    private const PERIODS_PER_MONTH = ['monthly' => 1, 'semi_monthly' => 2, 'weekly' => 4];
    private const DEFAULT_DAYS = ['monthly' => 26, 'semi_monthly' => 13, 'weekly' => 6];

    public function rates(): array
    {
        return array_merge(self::DEFAULT_RATES, (array) Setting::read('payroll_rates', []));
    }

    public function defaultDays(string $frequency): int
    {
        return self::DEFAULT_DAYS[$frequency] ?? 13;
    }

    private function r2(float $n): float { return round($n, 2); }

    public function monthlySalary(Employee $e, array $r): float
    {
        return $e->pay_basis === 'daily' ? $e->rate * $r['days_per_month'] : $e->rate;
    }

    /** Monthly employee-share contributions for an employee (before splitting into pay periods). */
    public function monthlyContributions(Employee $e): array
    {
        $r = $this->rates();
        $salary = $this->monthlySalary($e, $r);

        $msc = min(max(round($salary / 500) * 500, $r['sss_min_msc']), $r['sss_max_msc']);
        $sss = $msc * $r['sss_rate'];
        $ph = min(max($salary, $r['philhealth_floor']), $r['philhealth_ceiling']) * $r['philhealth_rate'];
        $pagibigRate = $salary <= $r['pagibig_low_threshold'] ? $r['pagibig_low_rate'] : $r['pagibig_rate'];
        $pi = min($salary, $r['pagibig_max_salary']) * $pagibigRate;

        return ['sss' => $this->r2($sss), 'philhealth' => $this->r2($ph), 'pagibig' => $this->r2($pi)];
    }

    /**
     * Work out one payslip's numbers.
     * @param array{days_worked?: ?float, allowances?: float, other_deductions?: float} $in
     */
    public function compute(Employee $e, string $frequency, array $in): array
    {
        $perMonth = self::PERIODS_PER_MONTH[$frequency] ?? 2;
        $days = $e->pay_basis === 'daily' ? (float) ($in['days_worked'] ?? $this->defaultDays($frequency)) : null;

        $basic = $e->pay_basis === 'daily'
            ? $e->rate * $days
            : match ($frequency) { 'monthly' => $e->rate, 'weekly' => $e->rate * 12 / 52, default => $e->rate / 2 };

        $allow = (float) ($in['allowances'] ?? 0);
        $other = (float) ($in['other_deductions'] ?? 0);

        $sss = $ph = $pi = 0.0;
        $pending = $e->deductions_status !== 'configured';
        if (!$pending) {
            $c = $this->monthlyContributions($e);
            $sss = $e->sss_enabled ? ($e->sss_fixed_amount ?? $c['sss'] / $perMonth) : 0;
            $ph = $e->philhealth_enabled ? ($e->philhealth_fixed_amount ?? $c['philhealth'] / $perMonth) : 0;
            $pi = $e->pagibig_enabled ? ($e->pagibig_fixed_amount ?? $c['pagibig'] / $perMonth) : 0;
        }

        $gross = $basic + $allow;
        $totalDed = $sss + $ph + $pi + $other;
        $net = $gross - $totalDed;
        if ($net < 0) {
            throw new ApiException("Deductions are higher than pay for {$e->full_name}. Lower the other deductions.", 422);
        }

        return [
            'days_worked' => $days, 'basic_pay' => $this->r2($basic), 'allowances' => $this->r2($allow),
            'gross_pay' => $this->r2($gross), 'sss' => $this->r2($sss), 'philhealth' => $this->r2($ph), 'pagibig' => $this->r2($pi),
            'other_deductions' => $this->r2($other), 'total_deductions' => $this->r2($totalDed), 'net_pay' => $this->r2($net),
            'deductions_pending' => $pending,
        ];
    }
}

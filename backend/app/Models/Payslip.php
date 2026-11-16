<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payslip extends Model
{
    protected $guarded = [];
    protected $casts = [
        'days_worked' => 'float', 'basic_pay' => 'float', 'allowances' => 'float', 'gross_pay' => 'float',
        'sss' => 'float', 'philhealth' => 'float', 'pagibig' => 'float', 'other_deductions' => 'float',
        'total_deductions' => 'float', 'net_pay' => 'float', 'deductions_pending' => 'boolean', 'paid_at' => 'datetime',
    ];

    public function employee() { return $this->belongsTo(Employee::class); }
    public function run() { return $this->belongsTo(PayrollRun::class, 'run_id'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollRun extends Model
{
    protected $guarded = [];
    protected $casts = ['period_start' => 'date:Y-m-d', 'period_end' => 'date:Y-m-d', 'pay_date' => 'date:Y-m-d', 'finalized_at' => 'datetime'];

    public function branch() { return $this->belongsTo(Branch::class); }
    public function payslips() { return $this->hasMany(Payslip::class, 'run_id'); }
}

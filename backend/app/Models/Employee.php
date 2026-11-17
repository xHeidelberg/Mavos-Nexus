<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    protected $guarded = [];
    protected $casts = [
        'rate' => 'float', 'date_hired' => 'date:Y-m-d', 'is_active' => 'boolean',
        'sss_enabled' => 'boolean', 'philhealth_enabled' => 'boolean', 'pagibig_enabled' => 'boolean',
        'sss_fixed_amount' => 'float', 'philhealth_fixed_amount' => 'float', 'pagibig_fixed_amount' => 'float',
    ];

    public function branch() { return $this->belongsTo(Branch::class); }
}

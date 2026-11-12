<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockBatch extends Model
{
    protected $guarded = [];
    protected $casts = ['received_at' => 'date:Y-m-d', 'expiry_date' => 'date:Y-m-d'];
}

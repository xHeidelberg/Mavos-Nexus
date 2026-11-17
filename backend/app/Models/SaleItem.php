<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleItem extends Model
{
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = ['list_price' => 'float', 'unit_price' => 'float', 'base_price' => 'float', 'unit_cost' => 'float', 'line_total' => 'float'];

    public function variant() { return $this->belongsTo(ProductVariant::class, 'variant_id'); }
}

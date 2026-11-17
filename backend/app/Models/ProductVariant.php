<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductVariant extends Model
{
    protected $guarded = [];
    protected $casts = [
        'attributes' => 'array',
        'is_active' => 'boolean',
        'cost_price' => 'float',
        'base_price' => 'float',
        'selling_price' => 'float',
    ];

    public function product() { return $this->belongsTo(Product::class); }
    public function stock() { return $this->hasMany(BranchStock::class, 'variant_id'); }

    public function displayName(): string
    {
        return $this->product->name . ($this->label ? " ({$this->label})" : '');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductCategory extends Model
{
    protected $guarded = [];
    protected $casts = [
        'tracks_expiry' => 'boolean',
        'has_variants' => 'boolean',
        'is_active' => 'boolean',
        'variant_options' => 'array',
    ];

    public function products() { return $this->hasMany(Product::class, 'category_id'); }
}

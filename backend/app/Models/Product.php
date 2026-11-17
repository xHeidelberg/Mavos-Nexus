<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $guarded = [];
    protected $casts = ['tracks_expiry' => 'boolean', 'is_active' => 'boolean'];
    protected $appends = ['tracks_expiry_effective', 'shelf_life_months_effective'];

    public function category() { return $this->belongsTo(ProductCategory::class, 'category_id'); }
    public function variants() { return $this->hasMany(ProductVariant::class); }

    /** Product override wins, otherwise the category rule applies. */
    public function getTracksExpiryEffectiveAttribute(): bool
    {
        return (bool) ($this->tracks_expiry ?? $this->category?->tracks_expiry ?? false);
    }

    public function getShelfLifeMonthsEffectiveAttribute(): ?int
    {
        return $this->shelf_life_months ?? $this->category?->default_shelf_life_months;
    }
}

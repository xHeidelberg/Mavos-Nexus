<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Sale extends Model
{
    const UPDATED_AT = null;

    protected $guarded = [];
    protected $casts = [
        'subtotal' => 'float', 'discount_total' => 'float', 'total' => 'float',
        'amount_tendered' => 'float', 'change_given' => 'float',
        'needs_review' => 'boolean', 'is_offline_sync' => 'boolean',
        'sold_at' => 'datetime',
    ];

    public function branch() { return $this->belongsTo(Branch::class); }
    public function cashier() { return $this->belongsTo(User::class, 'cashier_id'); }
    public function customer() { return $this->belongsTo(Customer::class); }
    public function items() { return $this->hasMany(SaleItem::class); }
    public function void() { return $this->hasOne(SaleVoid::class); }
    /** The voided sale this one corrects (if any). */
    public function replaces() { return $this->hasOne(SaleVoid::class, 'replacement_sale_id'); }

    /**
     * Visibility:
     *  sales -> own sales, last 1 month only
     *  staff -> own + the Sales users they supervise, in their branch
     *  admin -> everything
     */
    public function scopeVisibleTo(Builder $q, User $u): Builder
    {
        return match ($u->role) {
            'sales' => $q->where('cashier_id', $u->id)->where('sold_at', '>=', now()->subMonth()),
            'staff' => $q->where('branch_id', $u->branch_id)->where(
                fn ($w) => $w->where('cashier_id', $u->id)
                    ->orWhereIn('cashier_id', User::where('supervisor_id', $u->id)->select('id'))
            ),
            default => $q,
        };
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleVoid extends Model
{
    protected $table = 'voids';
    const UPDATED_AT = null;
    protected $guarded = [];

    public function approver() { return $this->belongsTo(User::class, 'approved_by'); }
}

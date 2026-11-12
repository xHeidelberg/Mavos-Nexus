<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Read-only helper for relations; all writes go through StockService. */
class BranchStock extends Model
{
    protected $table = 'branch_stock';
    protected $primaryKey = null;
    public $incrementing = false;
    public $timestamps = false;
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Branch extends Model
{
    protected $guarded = [];
    protected $hidden = ['main_marker'];
    protected $casts = ['is_main' => 'boolean', 'is_active' => 'boolean'];

    public static function mainId(): ?int
    {
        return static::where('is_main', true)->value('id');
    }
}

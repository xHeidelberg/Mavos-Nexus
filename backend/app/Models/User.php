<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;

    protected $guarded = [];
    protected $hidden = ['password', 'pin_hash'];
    protected $appends = ['has_pin'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'must_change_password' => 'boolean',
            'is_active' => 'boolean',
            'locked_until' => 'datetime',
            'pin_locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'last_seen_at' => 'datetime',
        ];
    }

    public function getHasPinAttribute(): bool
    {
        return !is_null($this->pin_hash);
    }

    public function branch() { return $this->belongsTo(Branch::class); }
    public function supervisor() { return $this->belongsTo(User::class, 'supervisor_id'); }
}

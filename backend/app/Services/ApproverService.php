<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Verifies a Staff/Admin per-user 4-digit override PIN, so every void, exchange and adjustment
 * records exactly WHO approved it.
 *
 * IMPORTANT: call this BEFORE opening a DB transaction. Failed-attempt counters must be saved
 * even though the request then fails (inside a transaction they would be rolled back).
 */
class ApproverService
{
    public function verify(string $username, string $pin, ?int $branchId = null): User
    {
        $a = User::whereRaw('lower(username) = ?', [strtolower($username)])->first();
        if (!$a || !$a->is_active || !in_array($a->role, ['staff', 'admin'], true) || !$a->pin_hash) {
            throw new ApiException('Approval denied', 403);
        }
        if ($a->pin_locked_until && $a->pin_locked_until->isFuture()) {
            throw new ApiException('Approver PIN is locked. Try again later.', 423);
        }
        if (!Hash::check($pin, $a->pin_hash)) {
            $a->pin_failed_attempts++;
            if ($a->pin_failed_attempts >= 3) {
                $a->pin_failed_attempts = 0;
                $a->pin_locked_until = now()->addMinutes(15);
            }
            $a->save();
            throw new ApiException('Invalid approver PIN', 403);
        }
        if ($a->role === 'staff' && $branchId && (int) $a->branch_id !== $branchId) {
            throw new ApiException('Approver belongs to a different branch', 403);
        }
        if ($a->pin_failed_attempts) {
            $a->forceFill(['pin_failed_attempts' => 0, 'pin_locked_until' => null])->save();
        }
        return $a;
    }
}

<?php

namespace App\Services;

use App\Events\BranchBroadcast;

class Realtime
{
    /** Never let a broadcasting hiccup break a sale. */
    public static function emit(string $name, int $branchId, array $payload): void
    {
        try {
            event(new BranchBroadcast($name, $branchId, $payload));
        } catch (\Throwable $e) {
            report($e);
        }
    }
}

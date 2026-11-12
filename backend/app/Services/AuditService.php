<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;

class AuditService
{
    public static function log(?User $user, string $action, ?string $entity = null, $entityId = null, $old = null, $new = null): void
    {
        $req = request();
        AuditLog::create([
            'user_id' => $user?->id,
            'action' => $action,
            'entity' => $entity,
            'entity_id' => $entityId === null ? null : (string) $entityId,
            'old_data' => $old,
            'new_data' => $new,
            'ip' => $req?->ip(),
            'user_agent' => $req ? substr((string) $req->userAgent(), 0, 200) : null,
        ]);
    }
}

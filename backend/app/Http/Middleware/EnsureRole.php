<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;

/** Usage: ->middleware('role:admin,staff') */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, $roles, true)) {
            throw new ApiException('You do not have permission for this action', 403);
        }
        return $next($request);
    }
}

<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;

/** Blocks everything except changing the password while a temporary password is in use. */
class EnsurePasswordChanged
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        if ($user && !$user->is_active) {
            $user->tokens()->delete();
            throw new ApiException('Account disabled', 401);
        }
        if ($user && $user->must_change_password && !$request->routeIs('auth.change-password', 'auth.me', 'auth.logout')) {
            throw new ApiException('Password change required', 403, ['code' => 'PASSWORD_CHANGE_REQUIRED']);
        }
        return $next($request);
    }
}

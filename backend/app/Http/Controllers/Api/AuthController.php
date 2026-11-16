<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $d = $request->validate(['username' => 'required|string', 'password' => 'required|string']);
        $u = User::whereRaw('lower(username) = ?', [strtolower($d['username'])])->first();
        if (!$u || !$u->is_active) throw new ApiException('Invalid username or password', 401);
        if ($u->locked_until && $u->locked_until->isFuture()) {
            throw new ApiException('Account temporarily locked. Try again in a few minutes.', 423);
        }
        if (!Hash::check($d['password'], $u->password)) {
            $u->failed_attempts++;
            if ($u->failed_attempts >= 5) {
                $u->failed_attempts = 0;
                $u->locked_until = now()->addMinutes(15);
            }
            $u->save();
            throw new ApiException('Invalid username or password', 401);
        }
        $u->forceFill(['failed_attempts' => 0, 'locked_until' => null, 'last_login_at' => now()])->save();
        AuditService::log($u, 'LOGIN', 'user', $u->id);
        return [
            'token' => $u->createToken('mavos')->plainTextToken,
            'must_change_password' => $u->must_change_password,
            'user' => $u->only(['id', 'username', 'full_name', 'role', 'branch_id']),
        ];
    }

    public function me(Request $request)
    {
        return ['user' => $request->user()->load('branch')];
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return ['ok' => true];
    }

    public function changePassword(Request $request)
    {
        $d = $request->validate(['current_password' => 'required|string', 'new_password' => 'required|string|min:8|max:100']);
        $u = $request->user();
        if (!Hash::check($d['current_password'], $u->password)) throw new ApiException('Current password is incorrect', 401);
        if ($d['current_password'] === $d['new_password']) throw new ApiException('New password must be different', 422);
        $u->forceFill(['password' => $d['new_password'], 'must_change_password' => false])->save();
        $currentToken = $u->currentAccessToken();
        if ($currentToken instanceof PersonalAccessToken) {
            $u->tokens()->where('id', '!=', $currentToken->getKey())->delete();
        } else {
            $u->tokens()->delete();
        }
        AuditService::log($u, 'PASSWORD_CHANGED', 'user', $u->id);
        return ['ok' => true];
    }

    /** Set / change my own 4-digit override PIN (Staff and Admin). */
    public function setPin(Request $request)
    {
        $d = $request->validate(['password' => 'required|string', 'pin' => ['required', 'regex:/^\d{4}$/']]);
        $u = $request->user();
        if (!Hash::check($d['password'], $u->password)) throw new ApiException('Password is incorrect', 401);
        $u->forceFill(['pin_hash' => Hash::make($d['pin']), 'pin_failed_attempts' => 0, 'pin_locked_until' => null])->save();
        AuditService::log($u, 'PIN_SET', 'user', $u->id);
        return ['ok' => true];
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class UserController extends Controller
{
    // Staff see their own branch's users; admin sees everyone.
    public function index(Request $request)
    {
        $u = $request->user();
        return User::when($u->role !== 'admin', fn ($q) => $q->where('branch_id', $u->branch_id))->orderBy('username')->get();
    }

    public function store(Request $request)
    {
        $d = $request->validate([
            'username' => 'required|string|min:3|max:50|unique:users,username',
            'full_name' => 'required|string|max:100',
            'role' => 'required|in:admin,staff,sales',
            'branch_id' => 'required_unless:role,admin|nullable|exists:branches,id',
            'supervisor_id' => 'nullable|exists:users,id',
        ]);
        $temp = Str::random(10);
        $user = User::create($d + ['password' => $temp, 'must_change_password' => true]);
        AuditService::log($request->user(), 'USER_CREATED', 'user', $user->id, null, $user->only(['username', 'role']));
        return response()->json(['user' => $user, 'temporary_password' => $temp], 201); // shown once
    }

    public function update(Request $request, User $user)
    {
        $d = $request->validate([
            'username' => "sometimes|string|min:3|max:50|unique:users,username,{$user->id}",
            'full_name' => 'sometimes|string|max:100',
            'role' => 'sometimes|in:admin,staff,sales',
            'branch_id' => 'sometimes|nullable|exists:branches,id',
            'supervisor_id' => 'sometimes|nullable|exists:users,id',
            'is_active' => 'sometimes|boolean',
        ]);
        $me = $request->user();
        if ($user->id === $me->id) {
            if (array_key_exists('is_active', $d) && !$d['is_active']) throw new ApiException('You can’t disable your own account.', 422);
            if (isset($d['role']) && $d['role'] !== $user->role) throw new ApiException('You can’t change your own role.', 422);
        }
        // Never leave the system without an active admin.
        $losesAdmin = $user->role === 'admin' && $user->is_active
            && ((array_key_exists('is_active', $d) && !$d['is_active']) || (isset($d['role']) && $d['role'] !== 'admin'));
        if ($losesAdmin && User::where('role', 'admin')->where('is_active', true)->count() <= 1) {
            throw new ApiException('At least one active admin is required.', 422);
        }
        $old = $user->toArray();
        $user->update($d);
        if (array_key_exists('is_active', $d) && !$d['is_active']) $user->tokens()->delete();
        AuditService::log($request->user(), 'USER_UPDATED', 'user', $user->id, $old, $user->toArray());
        return $user;
    }

    // Admin-only reset -> temporary password; the user must change it at next login.
    public function resetPassword(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            throw new ApiException('Use My account → Change password for your own password.', 422);
        }
        $temp = Str::random(10);
        $user->forceFill(['password' => $temp, 'must_change_password' => true, 'failed_attempts' => 0, 'locked_until' => null])->save();
        $user->tokens()->delete();
        AuditService::log($request->user(), 'PASSWORD_RESET', 'user', $user->id);
        return ['temporary_password' => $temp];
    }
}

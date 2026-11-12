<?php

use Illuminate\Support\Facades\Broadcast;

// Live dashboard: admins get everything, staff get their own branch.
Broadcast::channel('admins', fn ($user) => $user->role === 'admin');
Broadcast::channel('branch.{id}', fn ($user, $id) => $user->role === 'admin' || ($user->role === 'staff' && (int) $user->branch_id === (int) $id));

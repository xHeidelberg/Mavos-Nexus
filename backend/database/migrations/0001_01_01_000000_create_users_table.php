<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Replaces Laravel's default users migration (branches must exist first).
return new class extends Migration {
    public function up(): void
    {
        Schema::create('branches', function (Blueprint $t) {
            $t->id();
            $t->string('code', 10)->unique();            // used in receipt numbers
            $t->string('name', 100);
            $t->text('address')->nullable();
            $t->boolean('is_main')->default(false);
            // Unique only when is_main = 1 (NULLs don't collide) => at most one main inventory.
            $t->tinyInteger('main_marker')->nullable()->virtualAs('IF(is_main, 1, NULL)')->unique();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('username', 50)->unique();         // MySQL default collation = case-insensitive
            $t->string('full_name', 100);
            $t->enum('role', ['admin', 'staff', 'sales']);
            $t->foreignId('branch_id')->nullable()->constrained('branches');
            $t->foreignId('supervisor_id')->nullable()->constrained('users'); // Staff who monitors this Sales user
            $t->string('password');
            $t->boolean('must_change_password')->default(true);
            $t->unsignedTinyInteger('failed_attempts')->default(0);
            $t->timestamp('locked_until')->nullable();
            $t->string('pin_hash')->nullable();           // per-user 4-digit override PIN (Staff/Admin)
            $t->unsignedTinyInteger('pin_failed_attempts')->default(0);
            $t->timestamp('pin_locked_until')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamp('last_login_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('branches');
    }
};

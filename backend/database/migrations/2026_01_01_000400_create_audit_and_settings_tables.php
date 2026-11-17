<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained('users');
            $t->string('action', 60)->index();
            $t->string('entity', 40)->nullable();
            $t->string('entity_id', 40)->nullable();
            $t->json('old_data')->nullable();
            $t->json('new_data')->nullable();
            $t->string('ip', 64)->nullable();
            $t->string('user_agent', 200)->nullable();
            $t->timestamp('created_at')->useCurrent()->index();
            $t->index(['entity', 'entity_id']);
        });

        Schema::create('settings', function (Blueprint $t) {
            $t->string('key', 60)->primary();
            $t->json('value');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
        Schema::dropIfExists('audit_logs');
    }
};
